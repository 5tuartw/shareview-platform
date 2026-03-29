'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clock3, Loader2, PlayCircle, Save, Settings2 } from 'lucide-react'

type PipelineControlResponse = {
  projectId: string
  region: string
  jobName: string
  schedulerJobName: string
  scheduler: {
    state: 'ENABLED' | 'PAUSED' | string
    schedule: string
    timeZone: string
    time?: string | null
  } | null
  job: {
    memory: string | null
    cpu: string | null
    timeout: string | null
    maxRetries: number | null
    vpcConnector: string | null
  } | null
  executions: Array<{
    name: string
    status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'RUNNING'
    createTime: string | null
    startTime: string | null
    completionTime: string | null
    durationSeconds: number | null
    failedCount: number
    succeededCount: number
    cancelledCount: number
  }>
}

const formatDateTime = (value: string | null): string => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds < 0) return '-'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60

  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function SuperAdminPipelineControls() {
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [data, setData] = useState<PipelineControlResponse | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [time, setTime] = useState('12:00')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/pipeline-control', {
        credentials: 'include',
        cache: 'no-store',
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Failed to load pipeline controls.')
      }

      const payload = (await response.json()) as PipelineControlResponse
      setData(payload)

      if (payload.scheduler) {
        setEnabled(payload.scheduler.state === 'ENABLED')
        if (payload.scheduler.time) setTime(payload.scheduler.time)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load pipeline controls.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const triggerNow = async () => {
    setRunning(true)
    setError(null)
    setSaved(null)

    try {
      const response = await fetch('/api/admin/pipeline-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Failed to trigger pipeline run.')
      }

      const payload = (await response.json().catch(() => ({}))) as { executionName?: string }
      const suffix = payload.executionName ? ` (${payload.executionName})` : ''
      setSaved(`Pipeline run triggered${suffix}.`)
      setTimeout(() => setSaved(null), 5000)
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Failed to trigger pipeline run.')
    } finally {
      setRunning(false)
    }
  }

  const saveSchedule = async () => {
    setSaving(true)
    setError(null)
    setSaved(null)

    try {
      const response = await fetch('/api/admin/pipeline-control', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          time,
          enabled,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Failed to save schedule.')
      }

      setSaved('Pipeline schedule updated.')
      setTimeout(() => setSaved(null), 4000)
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save schedule.')
    } finally {
      setSaving(false)
    }
  }

  const statusBadge = useMemo(() => {
    if (!data?.scheduler) return null
    const isEnabled = data.scheduler.state === 'ENABLED'
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
          isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
        }`}
      >
        {isEnabled ? 'Enabled' : 'Paused'}
      </span>
    )
  }, [data])

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <p className="text-sm text-gray-500">Loading pipeline controls...</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Settings2 className="w-5 h-5 text-[#F59E0B]" />
        <h3 className="text-lg font-semibold text-gray-900">Pipeline Operations</h3>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {saved && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {saved}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-2">
          <p className="font-semibold text-slate-900">Current Schedule</p>
          <p>{statusBadge}</p>
          <p>
            <span className="font-medium">Cron:</span> {data?.scheduler?.schedule ?? 'Unavailable'}
          </p>
          <p>
            <span className="font-medium">Time zone:</span> {data?.scheduler?.timeZone ?? 'Europe/London'}
          </p>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-2">
          <p className="font-semibold text-slate-900">Runtime Profile</p>
          <p>
            <span className="font-medium">Memory:</span> {data?.job?.memory ?? 'Unknown'}
          </p>
          <p>
            <span className="font-medium">Timeout:</span> {data?.job?.timeout ?? 'Unknown'}
          </p>
          <p>
            <span className="font-medium">VPC connector:</span> {data?.job?.vpcConnector ?? 'None'}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 p-4 space-y-4">
        <p className="text-sm font-semibold text-slate-900">Scheduler Controls</p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Enable daily scheduled run
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Clock3 className="h-4 w-4 text-slate-500" />
            <span>Daily time</span>
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </label>

          <p className="text-xs text-slate-500 md:self-center">
            Time zone fixed to Europe/London.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={saveSchedule}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-[#1C1D1C] px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Save schedule'}
          </button>

          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-900">Manual Trigger</p>
        <p className="text-xs text-slate-500">Starts a run immediately using the current runtime and schedule configuration.</p>
        <button
          type="button"
          onClick={triggerNow}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          {running ? 'Triggering...' : 'Run pipeline now'}
        </button>
      </div>

      <div className="rounded-md border border-slate-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-900">Recent Executions</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs text-left text-slate-700">
            <thead className="text-slate-500">
              <tr>
                <th className="px-2 py-2 font-semibold">Execution</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold">Started</th>
                <th className="px-2 py-2 font-semibold">Completed</th>
                <th className="px-2 py-2 font-semibold">Duration</th>
              </tr>
            </thead>
            <tbody>
              {(data?.executions || []).map((execution) => {
                const statusClass = execution.status === 'SUCCEEDED'
                  ? 'text-emerald-700'
                  : execution.status === 'FAILED'
                    ? 'text-red-700'
                    : execution.status === 'CANCELLED'
                      ? 'text-amber-700'
                      : 'text-indigo-700'

                return (
                  <tr key={execution.name} className="border-t border-slate-100">
                    <td className="px-2 py-2 font-mono">{execution.name}</td>
                    <td className={`px-2 py-2 font-semibold ${statusClass}`}>{execution.status}</td>
                    <td className="px-2 py-2">{formatDateTime(execution.startTime || execution.createTime)}</td>
                    <td className="px-2 py-2">{formatDateTime(execution.completionTime)}</td>
                    <td className="px-2 py-2">{formatDuration(execution.durationSeconds)}</td>
                  </tr>
                )
              })}
              {(data?.executions || []).length === 0 && (
                <tr>
                  <td className="px-2 py-3 text-slate-500" colSpan={5}>No execution history available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
