import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { hasActiveRole } from '@/lib/permissions';
import { getAdminAiSettings } from '@/lib/admin-ai-settings';
import {
  createLlmBatchJob,
  getLlmBatchJobsTableExists,
} from '@/lib/llm-batch-jobs';

const ALLOWED_JOB_TYPES = new Set(['retailer_profile_assign']);

type CreateBatchJobBody = {
  job_type?: string;
  retailer_ids?: string[];
};

function parseRetailerIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((id) => (typeof id === 'string' ? id.trim() : ''))
    .filter((id): id is string => id.length > 0);
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || !await hasActiveRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!(await getLlmBatchJobsTableExists())) {
    return NextResponse.json({
      error: 'LLM batch jobs table is not available. Run migration 20260309020000 first.',
    }, { status: 500 });
  }

  let body: CreateBatchJobBody;
  try {
    body = (await request.json()) as CreateBatchJobBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const jobType = typeof body.job_type === 'string' ? body.job_type.trim() : '';
  if (!ALLOWED_JOB_TYPES.has(jobType)) {
    return NextResponse.json({ error: 'Unsupported job_type' }, { status: 400 });
  }

  const retailerIds = parseRetailerIds(body.retailer_ids);
  if (retailerIds.length === 0) {
    return NextResponse.json({ error: 'retailer_ids must contain at least one ID' }, { status: 400 });
  }

  const uniqueRetailerIds = Array.from(new Set(retailerIds));
  const rows = await query<{ retailer_id: string }>(
    `SELECT retailer_id FROM retailers WHERE retailer_id = ANY($1)`,
    [uniqueRetailerIds]
  );
  const existingIds = new Set(rows.rows.map((row) => row.retailer_id));
  const validRetailerIds = uniqueRetailerIds.filter((id) => existingIds.has(id));

  if (validRetailerIds.length === 0) {
    return NextResponse.json({ error: 'No valid retailer IDs found' }, { status: 400 });
  }

  const aiSettings = await getAdminAiSettings();
  const createdBy = Number(session.user.id);

  const created = await createLlmBatchJob({
    jobType,
    provider: aiSettings.provider,
    model: aiSettings.model,
    executionMode: aiSettings.execution_mode,
    requestPayload: {
      retailer_ids: validRetailerIds,
      ignored_retailer_ids: uniqueRetailerIds.filter((id) => !existingIds.has(id)),
    },
    totalItems: validRetailerIds.length,
    createdBy: Number.isFinite(createdBy) ? createdBy : null,
  });

  return NextResponse.json({ job: created }, { status: 201 });
}
