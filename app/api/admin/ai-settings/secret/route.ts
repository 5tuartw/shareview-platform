import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasActiveRole } from '@/lib/permissions';
import { query } from '@/lib/db';
import { addSecretVersion, getDefaultProviderSecretId, type AiProvider } from '@/lib/gcp-secret-manager';

type SecretUpdateBody = {
  provider?: AiProvider;
  api_key?: string;
  secret_id?: string;
  sync_api_key_env_var?: boolean;
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

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    if (!await hasActiveRole(session, 'CSS_ADMIN')) {
      return NextResponse.json({ error: 'Forbidden: Super Admin role required' }, { status: 403 });
    }

    let body: SecretUpdateBody;
    try {
      body = (await request.json()) as SecretUpdateBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const provider = body.provider;
    if (provider !== 'gemini' && provider !== 'openai') {
      return NextResponse.json({ error: 'provider must be gemini or openai.' }, { status: 400 });
    }

    const apiKey = body.api_key?.trim() || '';
    if (apiKey.length < 10) {
      return NextResponse.json({ error: 'api_key appears invalid or too short.' }, { status: 400 });
    }

    const syncApiKeyEnvVar = body.sync_api_key_env_var !== false;
    const defaultSecretId = getDefaultProviderSecretId(provider);

    const secretResult = await addSecretVersion({
      provider,
      apiKey,
      secretId: body.secret_id,
    });

    const resolvedEnvVarName = defaultSecretId;
    if (syncApiKeyEnvVar) {
      const tableReady = await hasSettingsTable();
      if (!tableReady) {
        return NextResponse.json(
          {
            error: 'Secret updated, but admin_ai_settings table is missing. Run migration 20260309010000 first.',
            secret_updated: true,
            project_id: secretResult.projectId,
            secret_id: secretResult.secretId,
            secret_version_name: secretResult.secretVersionName,
          },
          { status: 409 }
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
          VALUES (
            1,
            $1,
            CASE
              WHEN $1 = 'gemini' THEN COALESCE($2, 'gemini-2.5-flash')
              ELSE COALESCE($3, 'gpt-4.1-mini')
            END,
            COALESCE($4, 'chunked_sync'),
            COALESCE($5, 12),
            $6,
            $7,
            NOW(),
            NOW()
          )
          ON CONFLICT (id)
          DO UPDATE SET
            api_key_env_var = EXCLUDED.api_key_env_var,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
        `,
        [
          provider,
          provider === 'gemini' ? 'gemini-2.5-flash' : null,
          provider === 'openai' ? 'gpt-4.1-mini' : null,
          'chunked_sync',
          12,
          resolvedEnvVarName,
          Number(session.user.id),
        ]
      );
    }

    return NextResponse.json({
      ok: true,
      provider,
      project_id: secretResult.projectId,
      secret_id: secretResult.secretId,
      secret_version_name: secretResult.secretVersionName,
      api_key_env_var: syncApiKeyEnvVar ? resolvedEnvVarName : null,
      deploy_binding_required: `Ensure Cloud Run maps env var ${resolvedEnvVarName} from secret ${secretResult.secretId}:latest.`,
    });
  } catch (error) {
    console.error('Admin AI secret update error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update API key secret.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
