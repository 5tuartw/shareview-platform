import { query } from '@/lib/db';

export type AiProvider = 'gemini' | 'openai';
export type AiExecutionMode = 'chunked_sync' | 'provider_batch';

export type AdminAiSettings = {
  provider: AiProvider;
  model: string;
  execution_mode: AiExecutionMode;
  chunk_size: number;
  api_key_env_var: string | null;
};

export type ProviderModelCapability = {
  model: string;
  supports_batch: boolean;
};

export const AI_PROVIDER_MODELS: Record<AiProvider, ProviderModelCapability[]> = {
  gemini: [
    { model: 'gemini-2.5-flash', supports_batch: true },
    { model: 'gemini-2.5-pro', supports_batch: true },
    { model: 'gemini-3-flash-preview', supports_batch: false },
  ],
  openai: [
    { model: 'gpt-4.1-mini', supports_batch: true },
    { model: 'gpt-4.1', supports_batch: true },
    { model: 'gpt-4o-mini', supports_batch: true },
  ],
};

export const DEFAULT_ADMIN_AI_SETTINGS: AdminAiSettings = {
  provider: 'gemini',
  model: process.env.GEMINI_MARKET_PROFILE_MODEL || 'gemini-2.5-flash',
  execution_mode: 'chunked_sync',
  chunk_size: 12,
  api_key_env_var: null,
};

const clampChunkSize = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_ADMIN_AI_SETTINGS.chunk_size;
  return Math.max(1, Math.min(100, Math.floor(value)));
};

export const supportsProviderBatch = (provider: AiProvider, model: string): boolean => {
  return (AI_PROVIDER_MODELS[provider] || []).some((row) => row.model === model && row.supports_batch);
};

const hasSettingsTable = async (): Promise<boolean> => {
  const result = await query<{ has_table: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'admin_ai_settings'
    ) AS has_table
  `);

  return result.rows[0]?.has_table === true;
};

export const getAdminAiSettings = async (): Promise<AdminAiSettings> => {
  const hasTable = await hasSettingsTable();
  if (!hasTable) return DEFAULT_ADMIN_AI_SETTINGS;

  const result = await query<{
    provider: AiProvider;
    model: string;
    execution_mode: AiExecutionMode;
    chunk_size: number;
    api_key_env_var: string | null;
  }>(`
    SELECT provider, model, execution_mode, chunk_size, api_key_env_var
    FROM admin_ai_settings
    WHERE id = 1
    LIMIT 1
  `);

  if (result.rowCount === 0) {
    return DEFAULT_ADMIN_AI_SETTINGS;
  }

  const row = result.rows[0];

  return {
    provider: row.provider,
    model: row.model,
    execution_mode: row.execution_mode,
    chunk_size: clampChunkSize(Number(row.chunk_size)),
    api_key_env_var: row.api_key_env_var || null,
  };
};

export const resolveProviderApiKey = (settings: AdminAiSettings): string | null => {
  if (settings.api_key_env_var && process.env[settings.api_key_env_var]) {
    return process.env[settings.api_key_env_var] || null;
  }

  if (settings.provider === 'gemini') {
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
  }

  return process.env.OPENAI_API_KEY || null;
};

export const isProviderApiKeyConfigured = (settings: AdminAiSettings): boolean => {
  return Boolean(resolveProviderApiKey(settings));
};

export const getProviderKeyHint = (provider: AiProvider): string => {
  return provider === 'gemini' ? 'GEMINI_API_KEY (or GOOGLE_API_KEY)' : 'OPENAI_API_KEY';
};
