import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasActiveRole } from '@/lib/permissions';
import { getLlmBatchJob, getLlmBatchJobsTableExists } from '@/lib/llm-batch-jobs';

function parseJobId(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth();

  if (!await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
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

  return NextResponse.json({ job });
}
