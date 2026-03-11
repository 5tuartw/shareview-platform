import 'dotenv/config';
import { Client } from 'pg';
import {
  buildMarketComparisonMonthlyQuery,
  buildOverviewMonthlyQuery,
} from '../lib/overview-monthly-sql';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

type IdRow = { retailer_id: string };
type PeriodRow = { period_start: Date | string };

const toPeriodKey = (value: Date | string): string => {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
};

async function selectRetailerIds(client: Client): Promise<{ sparseId: string; denseId: string }> {
  const sparseResult = await client.query<IdRow>(
    `SELECT retailer_id
     FROM monthly_archive
     GROUP BY retailer_id
     HAVING COUNT(DISTINCT month_year) BETWEEN 4 AND 9
     ORDER BY COUNT(DISTINCT month_year) ASC, MAX(created_at) DESC
     LIMIT 1`
  );

  const denseResult = await client.query<IdRow>(
    `SELECT retailer_id
     FROM monthly_archive
     GROUP BY retailer_id
     HAVING COUNT(DISTINCT month_year) >= 12
     ORDER BY COUNT(DISTINCT month_year) DESC, MAX(created_at) DESC
     LIMIT 1`
  );

  assert(sparseResult.rows.length === 1, 'Could not find a sparse monthly retailer sample');
  assert(denseResult.rows.length === 1, 'Could not find a dense monthly retailer sample');

  return {
    sparseId: sparseResult.rows[0].retailer_id,
    denseId: denseResult.rows[0].retailer_id,
  };
}

async function fetchOverviewPeriods(client: Client, retailerId: string): Promise<string[]> {
  const result = await client.query<PeriodRow>(buildOverviewMonthlyQuery('withMonthYear'), [retailerId, null]);
  const seen = new Set<string>();

  for (const row of result.rows) {
    seen.add(toPeriodKey(row.period_start));
  }

  return Array.from(seen).sort();
}

async function fetchCohortPeriods(client: Client, retailerId: string, periods: string[]): Promise<string[]> {
  if (periods.length === 0) return [];

  const result = await client.query<PeriodRow>(buildMarketComparisonMonthlyQuery('withMonthYear'), [
    [retailerId],
    periods,
  ]);
  const seen = new Set<string>();

  for (const row of result.rows) {
    seen.add(toPeriodKey(row.period_start));
  }

  return Array.from(seen).sort();
}

function assertQueryContract(): void {
  const overview = buildOverviewMonthlyQuery('withMonthYear');
  const cohort = buildMarketComparisonMonthlyQuery('withMonthYear');

  assert(/ROW_NUMBER\s*\(\)\s*OVER/i.test(overview), 'Overview query must use ROW_NUMBER ranking');
  assert(/ROW_NUMBER\s*\(\)\s*OVER/i.test(cohort), 'Cohort query must use ROW_NUMBER ranking');
  assert(!/DISTINCT\s+ON/i.test(overview), 'Overview query must not rely on DISTINCT ON');
  assert(!/DISTINCT\s+ON/i.test(cohort), 'Cohort query must not rely on DISTINCT ON');
}

async function assertPeriodParity(client: Client, retailerId: string): Promise<void> {
  const overviewPeriods = await fetchOverviewPeriods(client, retailerId);
  assert(overviewPeriods.length > 0, `No overview monthly periods returned for retailer ${retailerId}`);

  const cohortPeriods = await fetchCohortPeriods(client, retailerId, overviewPeriods);

  const missingInCohort = overviewPeriods.filter((period) => !cohortPeriods.includes(period));
  assert(
    missingInCohort.length === 0,
    `Monthly period parity failed for retailer ${retailerId}. Missing periods: ${missingInCohort.join(', ')}`
  );
}

async function run(): Promise<void> {
  assertQueryContract();

  const analyticsUrl = process.env.DATABASE_URL;
  assert(Boolean(analyticsUrl), 'DATABASE_URL is required and should point to analytics DB for this test');

  const client = new Client({ connectionString: analyticsUrl });
  await client.connect();

  try {
    const { sparseId, denseId } = await selectRetailerIds(client);

    await assertPeriodParity(client, sparseId);
    await assertPeriodParity(client, denseId);

    console.log('PASS: overview/market-comparison monthly contract parity is valid.');
    console.log(`Checked sparse retailer: ${sparseId}`);
    console.log(`Checked dense retailer: ${denseId}`);
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('FAIL:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
