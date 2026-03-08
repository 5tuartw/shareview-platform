import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasRole } from '@/lib/permissions';
import { query } from '@/lib/db';
import {
  DEFAULT_MARKET_PROFILE_PROMPT,
  MARKET_PROFILE_PROMPT_TEMPLATE_KEY,
} from '@/lib/gemini-market-profiles';

const TEMPLATE_STYLE_DIRECTIVE = 'standard';

async function canUsePromptTemplatesTable(): Promise<boolean> {
  const result = await query<{ has_table: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'prompt_templates'
    ) AS has_table
  `);

  return result.rows[0]?.has_table === true;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Forbidden: SALES_TEAM or CSS_ADMIN role required' },
        { status: 403 }
      );
    }

    const hasTable = await canUsePromptTemplatesTable();
    if (!hasTable) {
      return NextResponse.json({
        source: 'default',
        prompt_text: DEFAULT_MARKET_PROFILE_PROMPT,
        style_directive: TEMPLATE_STYLE_DIRECTIVE,
      });
    }

    const rowResult = await query<{
      prompt_text: string;
      style_directive: string | null;
      updated_at: string | null;
    }>(
      `
        SELECT prompt_text, style_directive, updated_at
        FROM prompt_templates
        WHERE page_type = $1
          AND tab_name = $2
          AND insight_type = $3
          AND is_active = true
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
      `,
      [
        MARKET_PROFILE_PROMPT_TEMPLATE_KEY.page_type,
        MARKET_PROFILE_PROMPT_TEMPLATE_KEY.tab_name,
        MARKET_PROFILE_PROMPT_TEMPLATE_KEY.insight_type,
      ]
    );

    if (rowResult.rowCount === 0) {
      return NextResponse.json({
        source: 'default',
        prompt_text: DEFAULT_MARKET_PROFILE_PROMPT,
        style_directive: TEMPLATE_STYLE_DIRECTIVE,
      });
    }

    const row = rowResult.rows[0];

    return NextResponse.json({
      source: 'db',
      prompt_text: row.prompt_text,
      style_directive: row.style_directive || TEMPLATE_STYLE_DIRECTIVE,
      updated_at: row.updated_at,
    });
  } catch (error) {
    console.error('Market profile prompt GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    if (!hasRole(session, ['SALES_TEAM', 'CSS_ADMIN'])) {
      return NextResponse.json(
        { error: 'Forbidden: SALES_TEAM or CSS_ADMIN role required' },
        { status: 403 }
      );
    }

    const hasTable = await canUsePromptTemplatesTable();
    if (!hasTable) {
      return NextResponse.json(
        { error: 'prompt_templates table is not available in this environment.' },
        { status: 409 }
      );
    }

    let body: { prompt_text?: string; style_directive?: string };
    try {
      body = (await request.json()) as { prompt_text?: string; style_directive?: string };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const promptText = body.prompt_text?.trim();
    const styleDirective = body.style_directive?.trim() || TEMPLATE_STYLE_DIRECTIVE;

    if (!promptText) {
      return NextResponse.json({ error: 'prompt_text is required.' }, { status: 400 });
    }

    if (promptText.length > 12000) {
      return NextResponse.json(
        { error: 'prompt_text exceeds maximum length (12000).' },
        { status: 400 }
      );
    }

    const upsertResult = await query<{
      prompt_text: string;
      style_directive: string | null;
      updated_at: string | null;
    }>(
      `
        INSERT INTO prompt_templates (
          page_type,
          tab_name,
          insight_type,
          prompt_text,
          style_directive,
          is_active,
          updated_at,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
        ON CONFLICT (page_type, tab_name, insight_type)
        DO UPDATE SET
          prompt_text = EXCLUDED.prompt_text,
          style_directive = EXCLUDED.style_directive,
          is_active = true,
          updated_at = NOW()
        RETURNING prompt_text, style_directive, updated_at
      `,
      [
        MARKET_PROFILE_PROMPT_TEMPLATE_KEY.page_type,
        MARKET_PROFILE_PROMPT_TEMPLATE_KEY.tab_name,
        MARKET_PROFILE_PROMPT_TEMPLATE_KEY.insight_type,
        promptText,
        styleDirective,
      ]
    );

    const row = upsertResult.rows[0];

    return NextResponse.json({
      source: 'db',
      prompt_text: row.prompt_text,
      style_directive: row.style_directive || TEMPLATE_STYLE_DIRECTIVE,
      updated_at: row.updated_at,
    });
  } catch (error) {
    console.error('Market profile prompt PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
