import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasRole } from '@/lib/permissions';
import { getAdminAiSettings } from '@/lib/admin-ai-settings';
import { assignMarketProfilesWithAi } from '@/lib/market-profile-ai-assignment';
import {
  getLlmBatchJob,
  getLlmBatchJobsTableExists,
  updateLlmBatchJob,
  type LlmBatchJobRow,
} from '@/lib/llm-batch-jobs';

type BatchResultPayload = {
  processed_retailer_ids?: string[];
  results?: unknown[];
  failed?: Array<{ retailer_id: string; reason: string }>;
};

function parseJobId(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function parseRetailerIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is string => value.length > 0);
}

function getResultPayload(payload: Record<string, unknown>): BatchResultPayload {
  if (!payload || typeof payload !== 'object') return {};
  return payload as BatchResultPayload;
}

async function handleRetailerProfileAssign(job: LlmBatchJobRow): Promise<LlmBatchJobRow> {
  const aiSettings = await getAdminAiSettings();
  const chunkSize = Math.max(1, Number(aiSettings.chunk_size || 1));

  const requestRetailerIds = parseRetailerIds(job.request_payload?.retailer_ids);
  const currentResultPayload = getResultPayload(job.result_payload || {});
  const processedRetailerIds = parseRetailerIds(currentResultPayload.processed_retailer_ids || []);
  const processedSet = new Set(processedRetailerIds);

  const remaining = requestRetailerIds.filter((id) => !processedSet.has(id));

  if (remaining.length === 0) {
    return updateLlmBatchJob(job.id, {
      status: 'completed',
      completedAt: 'now',
      processedItems: processedRetailerIds.length,
      updatedItems: Array.isArray(currentResultPayload.results) ? currentResultPayload.results.length : 0,
      failedItems: Array.isArray(currentResultPayload.failed) ? currentResultPayload.failed.length : 0,
      lastError: null,
    });
  }

  const nextChunk = remaining.slice(0, chunkSize);

  const summary = await assignMarketProfilesWithAi(nextChunk);

  const mergedResults = [
    ...(Array.isArray(currentResultPayload.results) ? currentResultPayload.results : []),
    ...summary.results,
  ];

  const mergedFailed = [
    ...(Array.isArray(currentResultPayload.failed) ? currentResultPayload.failed : []),
    ...summary.failed,
  ];

  const mergedProcessed = Array.from(new Set([...processedRetailerIds, ...nextChunk]));

  const isComplete = mergedProcessed.length >= requestRetailerIds.length;

  return updateLlmBatchJob(job.id, {
    status: isComplete ? 'completed' : 'running',
    resultPayload: {
      ...currentResultPayload,
      provider: summary.provider,
      configured_model: summary.configured_model,
      last_chunk_size: nextChunk.length,
      processed_retailer_ids: mergedProcessed,
      results: mergedResults,
      failed: mergedFailed,
    },
    processedItems: mergedProcessed.length,
    updatedItems: mergedResults.length,
    failedItems: mergedFailed.length,
    lastError: null,
    completedAt: isComplete ? 'now' : null,
  });
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth();

  if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!(await getLlmBatchJobsTableExists())) {
    return NextResponse.json({
      error: 'LLM batch jobs table is not available. Run migration 20260309020000 first.',
    }, { status: 500 });
  }

  const { jobId: rawJobId } = await params;
  const jobId = parseJobId(rawJobId);
  if (!jobId) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const job = await getLlmBatchJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return NextResponse.json({ job });
  }

  if (job.status === 'pending') {
    await updateLlmBatchJob(job.id, {
      status: 'running',
      startedAt: 'now',
      completedAt: null,
      lastError: null,
    });
  }

  try {
    let updatedJob: LlmBatchJobRow;

    switch (job.job_type) {
      case 'retailer_profile_assign':
        updatedJob = await handleRetailerProfileAssign(job);
        break;
      default:
        updatedJob = await updateLlmBatchJob(job.id, {
          status: 'failed',
          completedAt: 'now',
          lastError: `Unsupported job_type: ${job.job_type}`,
        });
        break;
    }

    return NextResponse.json({ job: updatedJob });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedJob = await updateLlmBatchJob(job.id, {
      status: 'failed',
      completedAt: 'now',
      lastError: message,
    });

    return NextResponse.json({ job: failedJob }, { status: 500 });
  }
}
