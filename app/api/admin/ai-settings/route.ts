import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasRole } from '@/lib/permissions';
import { query } from '@/lib/db';
import {
  AI_PROVIDER_MODELS,
  DEFAULT_ADMIN_AI_SETTINGS,
  getAdminAiSettings,
  getProviderKeyHint,
  isProviderApiKeyConfigured,
  resolveProviderApiKey,
  supportsProviderBatch,
  type AdminAiSettings,
  type AiExecutionMode,
  type AiProvider,
} from '@/lib/admin-ai-settings';

type SettingsBody = Partial<AdminAiSettings>;

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

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settings = await getAdminAiSettings();

    return NextResponse.json({
      settings,
      defaults: DEFAULT_ADMIN_AI_SETTINGS,
      provider_models: AI_PROVIDER_MODELS,
      supports_batch: supportsProviderBatch(settings.provider, settings.model),
      api_key_configured: isProviderApiKeyConfigured(settings),
      api_key_hint: settings.api_key_env_var || getProviderKeyHint(settings.provider),
    });
  } catch (error) {
    console.error('Admin AI settings GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    if (!hasRole(session, 'CSS_ADMIN')) {
      return NextResponse.json({ error: 'Forbidden: CSS_ADMIN role required' }, { status: 403 });
    }

    const tableReady = await hasSettingsTable();
    if (!tableReady) {
      return NextResponse.json(
        { error: 'admin_ai_settings table is missing. Run migration 20260309010000 first.' },
        { status: 409 }
      );
    }

    let body: SettingsBody;
    try {
      body = (await request.json()) as SettingsBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const provider = (body.provider || DEFAULT_ADMIN_AI_SETTINGS.provider) as AiProvider;
    const model = (body.model || '').trim();
    const executionMode = (body.execution_mode || DEFAULT_ADMIN_AI_SETTINGS.execution_mode) as AiExecutionMode;
    const chunkSize = Number(body.chunk_size ?? DEFAULT_ADMIN_AI_SETTINGS.chunk_size);
    const apiKeyEnvVar = body.api_key_env_var?.trim() || null;

    if (provider !== 'gemini' && provider !== 'openai') {
      return NextResponse.json({ error: 'provider must be gemini or openai.' }, { status: 400 });
    }

    if (!model) {
      return NextResponse.json({ error: 'model is required.' }, { status: 400 });
    }

    if (executionMode !== 'chunked_sync' && executionMode !== 'provider_batch') {
      return NextResponse.json({ error: 'execution_mode must be chunked_sync or provider_batch.' }, { status: 400 });
    }

    if (!Number.isFinite(chunkSize) || chunkSize < 1 || chunkSize > 100) {
      return NextResponse.json({ error: 'chunk_size must be a number between 1 and 100.' }, { status: 400 });
    }

    if (executionMode === 'provider_batch' && !supportsProviderBatch(provider, model)) {
      return NextResponse.json(
        { error: `Model ${model} is not marked as batch-capable for provider ${provider}.` },
        { status: 400 }
      );
    }

    await query(
      `
        INSERT INTO admin_ai_settings (
          id,
          provider,
          model,
          execution_mode,
          chunk_size,
          api_key_env_var,
          updated_by,
          updated_at,
          created_at
        )
        VALUES (1, $1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          provider = EXCLUDED.provider,
          model = EXCLUDED.model,
          execution_mode = EXCLUDED.execution_mode,
          chunk_size = EXCLUDED.chunk_size,
          api_key_env_var = EXCLUDED.api_key_env_var,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
      `,
      [provider, model, executionMode, Math.floor(chunkSize), apiKeyEnvVar, Number(session.user.id)]
    );

    const settings = await getAdminAiSettings();
    const apiKey = resolveProviderApiKey(settings);

    return NextResponse.json({
      settings,
      defaults: DEFAULT_ADMIN_AI_SETTINGS,
      provider_models: AI_PROVIDER_MODELS,
      supports_batch: supportsProviderBatch(settings.provider, settings.model),
      api_key_configured: Boolean(apiKey),
      api_key_hint: settings.api_key_env_var || getProviderKeyHint(settings.provider),
    });
  } catch (error) {
    console.error('Admin AI settings PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
