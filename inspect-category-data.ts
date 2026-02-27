/**
 * Category Data Quality Inspection
 * 
 * This script inspects the category_performance table from the source database
 * and compares it with the previous analysis from category-data-quality-issues.md
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

async function inspectCategoryData() {
  console.log('========================================');
  console.log('Category Data Quality Inspection');
  console.log('========================================');
  console.log(`Source DB: ${SOURCE_DB_CONFIG.host}:${SOURCE_DB_CONFIG.port}`);
  console.log(`Database: ${SOURCE_DB_CONFIG.database}`);
  console.log('========================================\n');

  try {
    const retailerId = 'boots';
    
    // 1. Check if table exists and get basic info
    console.log('1. Checking table structure...');
    const tableCheck = await sourcePool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'category_performance'
      ORDER BY ordinal_position
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log('   ❌ Table category_performance not found!');
      return;
    }
    
    console.log('   ✅ Table exists with columns:');
    tableCheck.rows.forEach(row => {
      console.log(`      - ${row.column_name} (${row.data_type})`);
    });
    console.log('');

    // 2. Check date range of data
    console.log('2. Checking data date range...');
    const dateRange = await sourcePool.query(`
      SELECT 
        MIN(insight_date) as earliest_date,
        MAX(insight_date) as latest_date,
        COUNT(DISTINCT insight_date) as distinct_dates
      FROM category_performance
      WHERE retailer_id = $1
    `, [retailerId]);
    
    if (dateRange.rows.length > 0) {
      const { earliest_date, latest_date, distinct_dates } = dateRange.rows[0];
      console.log(`   Earliest: ${earliest_date}`);
      console.log(`   Latest: ${latest_date}`);
      console.log(`   Distinct dates: ${distinct_dates}`);
    }
    console.log('');

    // 3. CRITICAL: Check level-1 category structure (February 2026 had 95% flat)
    console.log('3. Analyzing level-1 category structure...');
    const level1Analysis = await sourcePool.query(`
      SELECT 
        COUNT(DISTINCT category_level1) as total_level1_categories,
        COUNT(DISTINCT CASE 
          WHEN category_level2 IS NOT NULL AND category_level2 != '' 
          THEN category_level1 
        END) as level1_with_children,
        COUNT(DISTINCT (category_level1, category_level2, category_level3, category_level4, category_level5)) as total_unique_paths
      FROM category_performance 
      WHERE retailer_id = $1 
        AND insight_date >= CURRENT_DATE - INTERVAL '30 days'
    `, [retailerId]);
    
    const { total_level1_categories, level1_with_children, total_unique_paths } = level1Analysis.rows[0];
    const hierarchicalPercent = total_level1_categories > 0 
      ? ((level1_with_children / total_level1_categories) * 100).toFixed(1)
      : 0;
    
    console.log(`   Total level-1 categories: ${total_level1_categories}`);
    console.log(`   Level-1 with children: ${level1_with_children}`);
    console.log(`   Hierarchical structure: ${hierarchicalPercent}%`);
    console.log(`   Total unique paths: ${total_unique_paths}`);
    
    // Compare with historical baselines
    console.log('\n   📊 Comparison with historical data:');
    console.log('      November 2025 (GOOD):  20 level-1, 100% hierarchical');
    console.log('      February 2026 (BAD):   151 level-1, 5% hierarchical');
    console.log(`      CURRENT:               ${total_level1_categories} level-1, ${hierarchicalPercent}% hierarchical`);
    
    if (parseFloat(hierarchicalPercent as string) < 50) {
      console.log('   ⚠️  WARNING: Low hierarchical structure detected!');
    } else if (parseFloat(hierarchicalPercent as string) > 90) {
      console.log('   ✅ GOOD: High hierarchical structure');
    } else {
      console.log('   🟡 MODERATE: Some hierarchical structure');
    }
    console.log('');

    // 4. Show top 20 level-1 categories by impressions
    console.log('4. Top 20 level-1 categories by impressions (last 30 days)...');
    const topCategories = await sourcePool.query(`
      SELECT 
        category_level1,
        COUNT(DISTINCT CASE WHEN category_level2 IS NOT NULL AND category_level2 != '' THEN 1 END) as has_children,
        SUM(impressions)::bigint as total_impressions,
        COUNT(DISTINCT insight_date) as days_active,
        MAX(CASE WHEN category_level2 IS NOT NULL AND category_level2 != '' 
            THEN category_level1 || ' > ' || category_level2 ELSE NULL END) as example_child
      FROM category_performance
      WHERE retailer_id = $1
        AND insight_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY category_level1
      ORDER BY SUM(impressions) DESC
      LIMIT 20
    `, [retailerId]);
    
    console.log('');
    console.log('   Category Level 1               | Has Children | Impressions | Days Active | Example Child');
    console.log('   ' + '-'.repeat(100));
    
    topCategories.rows.forEach(row => {
      const categoryName = row.category_level1.padEnd(30);
      const hasChildren = row.has_children > 0 ? '✅ Yes' : '❌ No';
      const impressions = row.total_impressions.toString().padStart(11);
      const days = row.days_active.toString().padStart(11);
      const example = row.example_child ? row.example_child.substring(0, 40) : '-';
      console.log(`   ${categoryName} | ${hasChildren.padEnd(12)} | ${impressions} | ${days} | ${example}`);
    });
    console.log('');

    // 5. Identify likely search terms (flat categories with no children)
    console.log('5. Identifying likely search terms (flat categories, last 30 days)...');
    const searchTerms = await sourcePool.query(`
      WITH categories_with_children AS (
        SELECT DISTINCT category_level1 
        FROM category_performance 
        WHERE retailer_id = $1
          AND insight_date >= CURRENT_DATE - INTERVAL '30 days'
          AND category_level2 IS NOT NULL 
          AND category_level2 != ''
      )
      SELECT 
        category_level1,
        SUM(impressions)::bigint as impressions,
        COUNT(DISTINCT insight_date) as days_active,
        MAX(campaign_name) as example_campaign
      FROM category_performance
      WHERE retailer_id = $1
        AND insight_date >= CURRENT_DATE - INTERVAL '30 days'
        AND category_level1 NOT IN (SELECT category_level1 FROM categories_with_children)
      GROUP BY category_level1
      ORDER BY SUM(impressions) DESC
      LIMIT 20
    `, [retailerId]);
    
    console.log(`   Found ${searchTerms.rows.length} flat categories (likely search terms):\n`);
    searchTerms.rows.forEach(row => {
      const indicator = row.impressions > 1000 ? '🔴' : row.impressions > 100 ? '🟡' : '⚪';
      console.log(`   ${indicator} ${row.category_level1}`);
      console.log(`      Impressions: ${row.impressions}, Days: ${row.days_active}`);
      console.log(`      Campaign: ${row.example_campaign || 'N/A'}`);
      console.log('');
    });

    // 6. Check for known good categories from November 2025
    console.log('6. Checking for Google Product Taxonomy categories (November baseline)...');
    const expectedCategories = [
      'Animals & Pet Supplies',
      'Arts & Entertainment',
      'Baby & Toddler',
      'Business & Industrial',
      'Cameras & Optics',
      'Clothing & Accessories',
      'Electronics',
      'Food, Beverages & Tobacco',
      'Furniture',
      'Hardware',
      'Health & Beauty',
      'Home & Garden',
      'Luggage & Bags',
      'Mature',
      'Media',
      'Office Supplies',
      'Software',
      'Sporting Goods',
      'Toys & Games',
      'Vehicles & Parts'
    ];
    
    const foundCategories = await sourcePool.query(`
      SELECT DISTINCT category_level1
      FROM category_performance
      WHERE retailer_id = $1
        AND insight_date >= CURRENT_DATE - INTERVAL '30 days'
        AND category_level1 = ANY($2)
    `, [retailerId, expectedCategories]);
    
    console.log(`   Expected Google Product Taxonomy categories: ${expectedCategories.length}`);
    console.log(`   Found in current data: ${foundCategories.rows.length}`);
    
    if (foundCategories.rows.length > 0) {
      console.log('   ✅ Found categories:');
      foundCategories.rows.forEach(row => {
        console.log(`      - ${row.category_level1}`);
      });
    } else {
      console.log('   ❌ No Google Product Taxonomy categories found');
    }
    console.log('');

    // 7. Summary and recommendations
    console.log('========================================');
    console.log('SUMMARY AND RECOMMENDATIONS');
    console.log('========================================');
    
    const status = parseFloat(hierarchicalPercent as string) > 90 ? 'EXCELLENT' :
                   parseFloat(hierarchicalPercent as string) > 50 ? 'ACCEPTABLE' : 'POOR';
    
    console.log(`\nData Quality Status: ${status}`);
    console.log(`Hierarchical Structure: ${hierarchicalPercent}% (Target: >90%)`);
    console.log(`Total Level-1 Categories: ${total_level1_categories} (Target: ~20 for Google Product Taxonomy)`);
    
    if (parseFloat(hierarchicalPercent as string) < 50) {
      console.log('\n⚠️  CRITICAL ISSUES DETECTED:');
      console.log('   - Low hierarchical structure suggests search terms mixed with categories');
      console.log('   - Review import process and campaign structure');
      console.log('   - Consider filtering out "catchallredirect" campaigns');
      console.log('   - Restore November 2025 import configuration if possible');
    } else if (total_level1_categories > 50) {
      console.log('\n⚠️  ISSUES DETECTED:');
      console.log('   - High number of level-1 categories suggests data quality issues');
      console.log('   - Expected ~20 categories for Google Product Taxonomy');
      console.log('   - May need to filter or consolidate categories');
    } else {
      console.log('\n✅ Data quality looks good!');
      console.log('   - Proceed with integration into snapshot generator');
    }
    
  } catch (error) {
    console.error('\n❌ Error during inspection:', error);
    throw error;
  } finally {
    await sourcePool.end();
  }
}

// Run inspection
if (require.main === module) {
  inspectCategoryData()
    .then(() => {
      console.log('\nInspection complete.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nFatal error:', error);
      process.exit(1);
    });
}
