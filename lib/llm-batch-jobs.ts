import { query } from '@/lib/db';

export type LlmBatchJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type LlmBatchJobRow = {
  id: number;
  job_type: string;
  status: LlmBatchJobStatus;
  provider: string | null;
  model: string | null;
  execution_mode: string | null;
  request_payload: Record<string, unknown>;
  result_payload: Record<string, unknown>;
  total_items: number;
  processed_items: number;
  updated_items: number;
  failed_items: number;
  created_by: number | null;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getLlmBatchJobsTableExists(): Promise<boolean> {
  const result = await query<{ has_table: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'llm_batch_jobs'
    ) AS has_table
  `);

  return result.rows[0]?.has_table === true;
}

export async function getLlmBatchJob(jobId: number): Promise<LlmBatchJobRow | null> {
  const result = await query<LlmBatchJobRow>(
    `
      SELECT
        id,
        job_type,
        status,
        provider,
        model,
        execution_mode,
        request_payload,
        result_payload,
        total_items,
        processed_items,
        updated_items,
        failed_items,
        created_by,
        last_error,
        started_at::text,
        completed_at::text,
        created_at::text,
        updated_at::text
      FROM llm_batch_jobs
      WHERE id = $1
      LIMIT 1
    `,
    [jobId]
  );

  return result.rows[0] ?? null;
}

export async function createLlmBatchJob(params: {
  jobType: string;
  provider: string | null;
  model: string | null;
  executionMode: string | null;
  requestPayload: Record<string, unknown>;
  totalItems: number;
  createdBy: number | null;
}): Promise<LlmBatchJobRow> {
  const result = await query<LlmBatchJobRow>(
    `
      INSERT INTO llm_batch_jobs (
        job_type,
        provider,
        model,
        execution_mode,
        request_payload,
        total_items,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
      RETURNING
        id,
        job_type,
        status,
        provider,
        model,
        execution_mode,
        request_payload,
        result_payload,
        total_items,
        processed_items,
        updated_items,
        failed_items,
        created_by,
        last_error,
        started_at::text,
        completed_at::text,
        created_at::text,
        updated_at::text
    `,
    [
      params.jobType,
      params.provider,
      params.model,
      params.executionMode,
      JSON.stringify(params.requestPayload),
      params.totalItems,
      params.createdBy,
    ]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to create LLM batch job');
  }

  return row;
}

export async function updateLlmBatchJob(jobId: number, fields: {
  status?: LlmBatchJobStatus;
  resultPayload?: Record<string, unknown>;
  processedItems?: number;
  updatedItems?: number;
  failedItems?: number;
  lastError?: string | null;
  startedAt?: 'now' | null;
  completedAt?: 'now' | null;
}): Promise<LlmBatchJobRow> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];

  if (fields.status !== undefined) {
    values.push(fields.status);
    setClauses.push(`status = $${values.length}`);
  }

  if (fields.resultPayload !== undefined) {
    values.push(JSON.stringify(fields.resultPayload));
    setClauses.push(`result_payload = $${values.length}::jsonb`);
  }

  if (fields.processedItems !== undefined) {
    values.push(fields.processedItems);
    setClauses.push(`processed_items = $${values.length}`);
  }

  if (fields.updatedItems !== undefined) {
    values.push(fields.updatedItems);
    setClauses.push(`updated_items = $${values.length}`);
  }

  if (fields.failedItems !== undefined) {
    values.push(fields.failedItems);
    setClauses.push(`failed_items = $${values.length}`);
  }

  if (fields.lastError !== undefined) {
    values.push(fields.lastError);
    setClauses.push(`last_error = $${values.length}`);
  }

  if (fields.startedAt !== undefined) {
    if (fields.startedAt === 'now') {
      setClauses.push('started_at = NOW()');
    } else {
      setClauses.push('started_at = NULL');
    }
  }

  if (fields.completedAt !== undefined) {
    if (fields.completedAt === 'now') {
      setClauses.push('completed_at = NOW()');
    } else {
      setClauses.push('completed_at = NULL');
    }
  }

  values.push(jobId);

  const result = await query<LlmBatchJobRow>(
    `
      UPDATE llm_batch_jobs
      SET ${setClauses.join(', ')}
      WHERE id = $${values.length}
      RETURNING
        id,
        job_type,
        status,
        provider,
        model,
        execution_mode,
        request_payload,
        result_payload,
        total_items,
        processed_items,
        updated_items,
        failed_items,
        created_by,
        last_error,
        started_at::text,
        completed_at::text,
        created_at::text,
        updated_at::text
    `,
    values
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to update LLM batch job');
  }

  return row;
}
