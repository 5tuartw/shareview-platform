import { Client } from 'pg';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectFailure(client: Client, sql: string, params: unknown[], label: string): Promise<void> {
  try {
    await client.query(sql, params);
    throw new Error(`${label} unexpectedly succeeded`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('At least one active Super Admin must remain')) {
      throw new Error(`${label} failed with unexpected error: ${message}`);
    }
  }
}

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const superAdminRows = await client.query<{ id: number }>(
      `SELECT id
       FROM users
       WHERE role = 'CSS_ADMIN' AND is_active = true
       ORDER BY id ASC`
    );

    assert(superAdminRows.rows.length >= 1, 'Expected at least one active Super Admin');

    const primaryId = superAdminRows.rows[0].id;
    const otherIds = superAdminRows.rows.slice(1).map((row) => row.id);

    const isolateToSingleSuperAdmin = async () => {
      for (const id of otherIds) {
        await client.query(`UPDATE users SET is_active = false WHERE id = $1`, [id]);
      }
    };

    // Test 1: cannot deactivate last active super admin.
    await client.query('BEGIN');
    try {
      await isolateToSingleSuperAdmin();
      await expectFailure(
        client,
        `UPDATE users SET is_active = false WHERE id = $1`,
        [primaryId],
        'Deactivate last Super Admin'
      );
    } finally {
      await client.query('ROLLBACK');
    }

    // Test 2: cannot demote last active super admin.
    await client.query('BEGIN');
    try {
      await isolateToSingleSuperAdmin();
      await expectFailure(
        client,
        `UPDATE users SET role = 'SALES_TEAM' WHERE id = $1`,
        [primaryId],
        'Demote last Super Admin'
      );
    } finally {
      await client.query('ROLLBACK');
    }

    // Test 3: cannot delete last active super admin.
    await client.query('BEGIN');
    try {
      await isolateToSingleSuperAdmin();
      await expectFailure(
        client,
        `DELETE FROM users WHERE id = $1`,
        [primaryId],
        'Delete last Super Admin'
      );
    } finally {
      await client.query('ROLLBACK');
    }

    console.log('PASS: super-admin continuity guardrails are enforced at DB level.');
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('FAIL:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
