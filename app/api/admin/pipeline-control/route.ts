import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasActiveRole } from '@/lib/permissions'

type SchedulerState = 'ENABLED' | 'PAUSED'

type SchedulerJobResponse = {
  name: string
  schedule: string
  timeZone: string
  state: SchedulerState | string
}

type RunJobResponse = {
  template?: {
    template?: {
      containers?: Array<{
        resources?: {
          limits?: {
            memory?: string
            cpu?: string
          }
        }
      }>
      timeout?: string
      maxRetries?: number
      vpcAccess?: {
        connector?: string
      }
    }
  }
}

type RunExecution = {
  name: string
  createTime?: string
  startTime?: string
  completionTime?: string
  failedCount?: number
  succeededCount?: number
  cancelledCount?: number
}

type RunExecutionListResponse = {
  executions?: RunExecution[]
}

const PROJECT_ID = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
const REGION = process.env.PIPELINE_REGION || 'europe-west2'
const JOB_NAME = process.env.PIPELINE_JOB_NAME || 'shareview-pipeline'
const SCHEDULER_JOB_NAME = process.env.PIPELINE_SCHEDULER_JOB_NAME || 'shareview-pipeline-cron'
const DEFAULT_TIME_ZONE = process.env.PIPELINE_SCHEDULER_TIMEZONE || 'Europe/London'

const parseDailyTimeFromCron = (schedule: string): string | null => {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length < 2) return null

  const minute = Number(parts[0])
  const hour = Number(parts[1])

  if (!Number.isInteger(minute) || !Number.isInteger(hour)) return null
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null

  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return `${hh}:${mm}`
}

const dailyCronFromTime = (value: string): string | null => {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2])
  return `${minute} ${hour} * * *`
}

const getAccessToken = async (): Promise<string> => {
  const response = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: {
      'Metadata-Flavor': 'Google',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch metadata token (${response.status})`)
  }

  const payload = (await response.json()) as { access_token?: string }
  if (!payload.access_token) {
    throw new Error('Metadata token response did not include access_token')
  }

  return payload.access_token
}

const gcpRequest = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const token = await getAccessToken()
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`GCP API request failed (${response.status}): ${text}`)
  }

  return (await response.json()) as T
}

const getSchedulerJob = async (): Promise<SchedulerJobResponse | null> => {
  const url = `https://cloudscheduler.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/jobs/${SCHEDULER_JOB_NAME}`
  try {
    return await gcpRequest<SchedulerJobResponse>(url)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('(404)')) return null
    throw error
  }
}

const getRunJob = async (): Promise<RunJobResponse | null> => {
  const url = `https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB_NAME}`
  try {
    return await gcpRequest<RunJobResponse>(url)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('(404)')) return null
    throw error
  }
}

const getRunExecutions = async (): Promise<RunExecution[]> => {
  const url = `https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB_NAME}/executions?pageSize=12`
  const payload = await gcpRequest<RunExecutionListResponse>(url)
  return payload.executions || []
}

const durationSeconds = (start?: string, completion?: string): number | null => {
  if (!start) return null

  const startMs = Date.parse(start)
  if (Number.isNaN(startMs)) return null

  const endMs = completion ? Date.parse(completion) : Date.now()
  if (Number.isNaN(endMs)) return null

  const diff = Math.floor((endMs - startMs) / 1000)
  return diff >= 0 ? diff : null
}

const executionStatus = (execution: RunExecution): 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'RUNNING' => {
  if ((execution.succeededCount || 0) > 0) return 'SUCCEEDED'
  if ((execution.failedCount || 0) > 0) return 'FAILED'
  if ((execution.cancelledCount || 0) > 0) return 'CANCELLED'
  return 'RUNNING'
}

const requireSuperAdmin = async (): Promise<NextResponse | null> => {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  if (!await hasActiveRole(session, 'CSS_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden: Super Admin role required' }, { status: 403 })
  }

  return null
}

export async function GET() {
  try {
    const denied = await requireSuperAdmin()
    if (denied) return denied

    if (!PROJECT_ID) {
      return NextResponse.json({ error: 'GCP project is not configured on the server.' }, { status: 500 })
    }

    const [scheduler, job, executions] = await Promise.all([getSchedulerJob(), getRunJob(), getRunExecutions()])

    const memory = job?.template?.template?.containers?.[0]?.resources?.limits?.memory || null
    const cpu = job?.template?.template?.containers?.[0]?.resources?.limits?.cpu || null
    const timeout = job?.template?.template?.timeout || null
    const maxRetries = job?.template?.template?.maxRetries ?? null
    const vpcConnector = job?.template?.template?.vpcAccess?.connector || null

    return NextResponse.json({
      projectId: PROJECT_ID,
      region: REGION,
      jobName: JOB_NAME,
      schedulerJobName: SCHEDULER_JOB_NAME,
      scheduler: scheduler
        ? {
            state: scheduler.state,
            schedule: scheduler.schedule,
            timeZone: scheduler.timeZone,
            time: parseDailyTimeFromCron(scheduler.schedule),
          }
        : null,
      job: {
        memory,
        cpu,
        timeout,
        maxRetries,
        vpcConnector,
      },
      executions: executions.map((execution) => {
        const shortName = execution.name.split('/').pop() || execution.name
        return {
          name: shortName,
          status: executionStatus(execution),
          createTime: execution.createTime || null,
          startTime: execution.startTime || null,
          completionTime: execution.completionTime || null,
          durationSeconds: durationSeconds(execution.startTime, execution.completionTime),
          failedCount: execution.failedCount ?? 0,
          succeededCount: execution.succeededCount ?? 0,
          cancelledCount: execution.cancelledCount ?? 0,
        }
      }),
    })
  } catch (error) {
    console.error('Pipeline control GET error:', error)
    return NextResponse.json({ error: 'Failed to load pipeline controls.' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const denied = await requireSuperAdmin()
    if (denied) return denied

    if (!PROJECT_ID) {
      return NextResponse.json({ error: 'GCP project is not configured on the server.' }, { status: 500 })
    }

    const url = `https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB_NAME}:run`
    const payload = await gcpRequest<{ name?: string }>(url, {
      method: 'POST',
      body: JSON.stringify({}),
    })

    return NextResponse.json({
      ok: true,
      executionName: payload.name || null,
    })
  } catch (error) {
    console.error('Pipeline control POST error:', error)
    return NextResponse.json({ error: 'Failed to trigger pipeline run.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const denied = await requireSuperAdmin()
    if (denied) return denied

    if (!PROJECT_ID) {
      return NextResponse.json({ error: 'GCP project is not configured on the server.' }, { status: 500 })
    }

    const scheduler = await getSchedulerJob()
    if (!scheduler) {
      return NextResponse.json({ error: 'Scheduler job not found.' }, { status: 404 })
    }

    let body: { time?: string; enabled?: boolean }
    try {
      body = (await request.json()) as { time?: string; enabled?: boolean }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    const updateMask: string[] = []
    const patchPayload: Partial<SchedulerJobResponse> = {}

    if (typeof body.time === 'string') {
      const cron = dailyCronFromTime(body.time)
      if (!cron) {
        return NextResponse.json({ error: 'time must be in HH:MM 24-hour format.' }, { status: 400 })
      }

      patchPayload.schedule = cron
      patchPayload.timeZone = DEFAULT_TIME_ZONE
      updateMask.push('schedule', 'timeZone')
    }

    if (typeof body.enabled === 'boolean') {
      patchPayload.state = body.enabled ? 'ENABLED' : 'PAUSED'
      updateMask.push('state')
    }

    if (updateMask.length === 0) {
      return NextResponse.json({ error: 'No valid fields provided for update.' }, { status: 400 })
    }

    const updateMaskQuery = encodeURIComponent(updateMask.join(','))
    const url = `https://cloudscheduler.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/jobs/${SCHEDULER_JOB_NAME}?updateMask=${updateMaskQuery}`
    const updated = await gcpRequest<SchedulerJobResponse>(url, {
      method: 'PATCH',
      body: JSON.stringify({
        ...scheduler,
        ...patchPayload,
      }),
    })

    return NextResponse.json({
      ok: true,
      scheduler: {
        state: updated.state,
        schedule: updated.schedule,
        timeZone: updated.timeZone,
        time: parseDailyTimeFromCron(updated.schedule),
      },
    })
  } catch (error) {
    console.error('Pipeline control PUT error:', error)
    return NextResponse.json({ error: 'Failed to update scheduler settings.' }, { status: 500 })
  }
}
