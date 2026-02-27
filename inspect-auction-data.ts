/**
 * Auction Data Structure Inspection
 * 
 * This script inspects the auction_insights table from the source database
 * to prepare for integration into snapshot-generator and metrics-generator
 * 
 * Expected database connection on port 18097 (SSH tunnel)
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { Pool } from 'pg';

// Load environment
config({ path: resolve(process.cwd(), '.env.local') });

// Source database connection (SSH tunnel on port 18007)
const SOURCE_DB_CONFIG = {
  host: process.env.SOURCE_DB_TUNNEL_HOST || '127.0.0.1',
  port: parseInt(process.env.SOURCE_DB_TUNNEL_PORT || '18007'),
  user: process.env.SOURCE_DB_USER || 'postgres',
  password: process.env.SOURCE_DB_PASS,
  database: process.env.SOURCE_DB_NAME || 'acc_mgmt',
};

const sourcePool = new Pool(SOURCE_DB_CONFIG);

async function inspectAuctionData() {
  console.log('========================================');
  console.log('Auction Data Structure Inspection');
  console.log('========================================');
  console.log(`Source DB: ${SOURCE_DB_CONFIG.host}:${SOURCE_DB_CONFIG.port}`);
  console.log(`Database: ${SOURCE_DB_CONFIG.database}`);
  console.log('========================================\n');

  try {
    const retailerId = 'boots';
    
    // 1. Check if table exists
    console.log('1. Checking table structure...');
    const tableCheck = await sourcePool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'auction_insights'
      ORDER BY ordinal_position
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log('   ❌ Table auction_insights not found!');
      console.log('   Available tables:');
      const tables = await sourcePool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      tables.rows.forEach(row => console.log(`      - ${row.table_name}`));
      return;
    }
    
    console.log('   ✅ Table exists with columns:');
    tableCheck.rows.forEach(row => {
      const nullable = row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      console.log(`      - ${row.column_name.padEnd(35)} ${row.data_type.padEnd(20)} ${nullable}`);
    });
    console.log('');

    // 2. Check data availability
    console.log('2. Checking data availability...');
    const dataCheck = await sourcePool.query(`
      SELECT 
        COUNT(*) as total_rows,
        MIN(month) as earliest_date,
        MAX(month) as latest_date,
        COUNT(DISTINCT account_name) as distinct_retailers,
        COUNT(DISTINCT month) as distinct_dates
      FROM auction_insights
    `);
    
    if (dataCheck.rows.length > 0 && dataCheck.rows[0].total_rows > 0) {
      const { total_rows, earliest_date, latest_date, distinct_retailers, distinct_dates } = dataCheck.rows[0];
      console.log(`   Total rows: ${total_rows}`);
      console.log(`   Date range: ${earliest_date} to ${latest_date}`);
      console.log(`   Distinct retailers: ${distinct_retailers}`);
      console.log(`   Distinct dates: ${distinct_dates}`);
    } else {
      console.log('   ❌ No data found in auction_insights table');
      return;
    }
    console.log('');

    // 3. Check data for specific retailer
    console.log(`3. Checking data for retailer: ${retailerId}...`);
    const retailerCheck = await sourcePool.query(`
      SELECT 
        COUNT(*) as total_rows,
        MIN(month) as earliest_date,
        MAX(month) as latest_date,
        COUNT(DISTINCT month) as distinct_dates,
        COUNT(DISTINCT shop_display_name) as distinct_competitors
      FROM auction_insights
      WHERE account_name = $1
    `, [retailerId]);
    
    if (retailerCheck.rows[0].total_rows > 0) {
      const { total_rows, earliest_date, latest_date, distinct_dates, distinct_competitors } = retailerCheck.rows[0];
      console.log(`   ✅ Data found for ${retailerId}`);
      console.log(`   Total rows: ${total_rows}`);
      console.log(`   Date range: ${earliest_date} to ${latest_date}`);
      console.log(`   Distinct dates: ${distinct_dates}`);
      console.log(`   Distinct competitors: ${distinct_competitors}`);
    } else {
      console.log(`   ❌ No data found for retailer: ${retailerId}`);
      
      // Show available retailers
      const availableRetailers = await sourcePool.query(`
        SELECT DISTINCT account_name, COUNT(*) as row_count
        FROM auction_insights
        GROUP BY account_name
        ORDER BY COUNT(*) DESC
        LIMIT 10
      `);
      console.log('\n   Available retailers:');
      availableRetailers.rows.forEach(row => {
        console.log(`      - ${row.account_name} (${row.row_count} rows)`);
      });
      return;
    }
    console.log('');

    // 4. Sample data structure (last 7 days)
    console.log('4. Sample data structure (recent months)...');
    const sampleData = await sourcePool.query(`
      SELECT *
      FROM auction_insights
      WHERE account_name = $1
      ORDER BY month DESC
      LIMIT 5
    `, [retailerId]);
    
    if (sampleData.rows.length > 0) {
      console.log(`   Sample record (latest):`);
      const sample = sampleData.rows[0];
      Object.keys(sample).forEach(key => {
        const value = sample[key];
        const displayValue = value === null ? 'NULL' : 
                            typeof value === 'number' ? value.toFixed(2) :
                            value.toString().substring(0, 50);
        console.log(`      ${key.padEnd(35)}: ${displayValue}`);
      });
    }
    console.log('');

    // 5. Aggregate metrics (last 6 months)
    console.log('5. Aggregate metrics (last 6 months)...');
    const aggregateMetrics = await sourcePool.query(`
      SELECT 
        AVG(impr_share)::numeric(10,2) as avg_impression_share,
        AVG(overlap_rate)::numeric(10,2) as avg_overlap_rate,
        AVG(outranking_share)::numeric(10,2) as avg_outranking_share,
        COUNT(DISTINCT shop_display_name) as total_competitors,
        COUNT(DISTINCT month) as months_with_data
      FROM auction_insights
      WHERE account_name = $1
        AND month >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months'
    `, [retailerId]);
    
    if (aggregateMetrics.rows.length > 0) {
      const metrics = aggregateMetrics.rows[0];
      console.log(`   Average Impression Share: ${metrics.avg_impression_share}%`);
      console.log(`   Average Overlap Rate: ${metrics.avg_overlap_rate}%`);
      console.log(`   Average Outranking Share: ${metrics.avg_outranking_share}%`);
      console.log(`   Total Competitors: ${metrics.total_competitors}`);
      console.log(`   Months with Data: ${metrics.months_with_data}`);
    }
    console.log('');

    // 6. Top competitors by overlap rate
    console.log('6. Top 10 competitors by overlap rate (last 6 months)...');
    const topCompetitors = await sourcePool.query(`
      SELECT 
        shop_display_name,
        COUNT(DISTINCT month) as months_seen,
        AVG(overlap_rate)::numeric(10,2) as avg_overlap_rate,
        AVG(outranking_share)::numeric(10,2) as avg_you_outranking,
        AVG(impr_share)::numeric(10,2) as avg_their_impression_share
      FROM auction_insights
      WHERE account_name = $1
        AND month >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months'
      GROUP BY shop_display_name
      ORDER BY AVG(overlap_rate) DESC
      LIMIT 10
    `, [retailerId]);
    
    console.log('');
    console.log('   Competitor                      | Months | Overlap% | You Outrank% | Their Impr%');
    console.log('   ' + '-'.repeat(85));
    
    topCompetitors.rows.forEach(row => {
      const name = (row.shop_display_name || 'Unknown').substring(0, 30).padEnd(30);
      const months = row.months_seen.toString().padStart(6);
      const overlap = (row.avg_overlap_rate || 0).toString().padStart(8);
      const youOutrank = (row.avg_you_outranking || 0).toString().padStart(12);
      const theirImpr = (row.avg_their_impression_share || 0).toString().padStart(11);
      console.log(`   ${name} | ${months} | ${overlap} | ${youOutrank} | ${theirImpr}`);
    });
    console.log('');

    // 7. Check for required fields from s8-retailer-analytics AuctionContent
    console.log('7. Mapping to s8-retailer-analytics AuctionContent structure...');
    console.log('\n   Required fields from AuctionContent.tsx:');
    console.log('   Overview metrics:');
    console.log('      ✓ avg_impression_share');
    console.log('      ✓ total_competitors');
    console.log('      ✓ avg_overlap_rate');
    console.log('      ✓ avg_outranking_share');
    console.log('');
    console.log('   Competitor detail:');
    console.log('      ✓ competitor_id / competitor_name');
    console.log('      ✓ days_seen (derived from distinct dates)');
    console.log('      ✓ avg_overlap_rate');
    console.log('      ✓ avg_you_outranking (maps to outranking_share)');
    console.log('      ✓ avg_them_outranking (maps to position_above_rate)');
    console.log('      ✓ avg_their_impression_share (competitor impression_share)');
    console.log('      ? is_shareight (needs to be determined)');
    console.log('      ? impression_share_is_estimate (needs to be determined)');
    console.log('');

    // 8. Check for Shareight identifier
    console.log('8. Checking for Shareight identifier...');
    const shareightCheck = await sourcePool.query(`
      SELECT DISTINCT shop_display_name, campaign_name
      FROM auction_insights
      WHERE account_name = $1
        AND (
          shop_display_name ILIKE '%shareight%' OR
          shop_display_name ILIKE '%represented by%' OR
          campaign_name ILIKE '%shareight%'
        )
      LIMIT 5
    `, [retailerId]);
    
    if (shareightCheck.rows.length > 0) {
      console.log('   ✅ Found potential Shareight entries:');
      shareightCheck.rows.forEach(row => {
        console.log(`      ${row.shop_display_name}: ${row.campaign_name}`);
      });
    } else {
      console.log('   ℹ️  No Shareight identifiers found in competitor names');
      console.log('   Note: May need to identify by campaign structure or metadata');
    }
    console.log('');

    // 9. Summary and recommendations
    console.log('========================================');
    console.log('INTEGRATION RECOMMENDATIONS');
    console.log('========================================\n');
    
    console.log('1. Snapshot Generator Integration:');
    console.log('   - Add generateAuctionSnapshot() function');
    console.log('   - Query: Aggregate by retailer + date range');
    console.log('   - Include: avg metrics, top competitor, biggest threat, best opportunity');
    console.log('   - Store in: auction_insights_snapshots table');
    console.log('');
    
    console.log('2. Metrics Generator Integration:');
    console.log('   - Appears already implemented: buildAuctionsMetrics() in calculators/auctions.ts');
    console.log('   - Verify snapshot loader includes auction_insights_snapshots');
    console.log('');
    
    console.log('3. Data Quality:');
    const hasData = retailerCheck.rows[0].total_rows > 0;
    const hasRecent = dataCheck.rows[0].latest_date && 
                     new Date(dataCheck.rows[0].latest_date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    if (hasData && hasRecent) {
      console.log('   ✅ Data quality: GOOD');
      console.log('   ✅ Recent data available');
      console.log('   ✅ Ready for integration');
    } else if (hasData) {
      console.log('   ⚠️  Data quality: ACCEPTABLE');
      console.log('   ⚠️  Data may be stale');
      console.log('   ℹ️  Verify data freshness before integration');
    } else {
      console.log('   ❌ Data quality: POOR');
      console.log('   ❌ No data available');
      console.log('   ❌ Not ready for integration');
    }
    console.log('');
    
    console.log('4. Missing Fields to Handle:');
    console.log('   - is_shareight: Need logic to identify Shareight campaigns');
    console.log('   - impression_share_is_estimate: Check if value < 10% (Google shows "< 10%" for low share)');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ Error during inspection:', error);
    throw error;
  } finally {
    await sourcePool.end();
  }
}

// Run inspection
if (require.main === module) {
  inspectAuctionData()
    .then(() => {
      console.log('\nInspection complete.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nFatal error:', error);
      process.exit(1);
    });
}
