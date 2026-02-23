# Category Performance Data Quality Issues

**Date**: February 20, 2026  
**Database**: `acc_mgmt.category_performance`  
**Retailer**: Boots  
**Impact**: Category navigation feature severely limited

---

## Executive Summary

The `category_performance` table contains **search terms mixed with product categories**, making hierarchical category navigation unusable. In February 2026, **95% of level-1 "categories" are actually search terms/brands** with no hierarchical structure.

---

## Key Statistics

### November 2025 vs February 2026 Comparison

| Metric | **November 2025 (GOOD)** | **February 2026 (BAD)** | Change |
|--------|--------------------------|-------------------------|--------|
| **Total unique level-1 categories** | **20** ✅ | 151 | **+655%** ⚠️ |
| **Level-1 categories WITH children** | **20** (100%) ✅ | 7 (5%) | **-93%** ⚠️ |
| **Category structure** | Google Product Taxonomy ✅ | Search terms + brands | **Broken** ⚠️ |

### February 2026 vs January 2026

| Metric | February 2026 | January 2026 | Change |
|--------|---------------|--------------|--------|
| **Total unique level-1 categories** | 151 | 163 | -7% |
| **Level-1 categories WITH children** | 7 | 107 | **-93%** ⚠️ |
| **Total unique category paths** | 178 | 693 | **-74%** ⚠️ |
| **Total impressions** | 737,211 | 1,086,493 | -32% |

### February 2026 Breakdown

- **144 "categories" have NO child categories** (95% of level-1 entries)
- **Only 7 categories have proper hierarchy** (5% of level-1 entries)
- **7 valid categories account for 86% of impressions** (643,990 / 737,211)

---

## Reference: Good Data (November 2025)

The **November 2025 CSV export** shows proper category structure using Google Product Taxonomy:

### Level 1 Categories (20 total)
```
Animals & Pet Supplies
Arts & Entertainment
Baby & Toddler
Business & Industrial
Cameras & Optics
Clothing & Accessories
Electronics
Food, Beverages & Tobacco
Furniture
Hardware
Health & Beauty
Home & Garden
Luggage & Bags
Mature
Media
Office Supplies
Software
Sporting Goods
Toys & Games
Vehicles & Parts
```

### Example Hierarchies
```
Animals & Pet Supplies > Pet Supplies > Dog Supplies
Baby & Toddler > Nursing & Feeding > Baby & Toddler Food > Baby Food
Baby & Toddler > Baby Toys & Activity Equipment > Sorting & Stacking Toys
Health & Beauty > Health Care > Medicine & Drugs > Vitamins & Supplements
Home & Garden > Kitchen & Dining > Food & Beverage Carriers
```

**Key characteristics:**
- ✅ All 20 categories have hierarchical children
- ✅ Uses standardized Google Product Taxonomy
- ✅ Depth up to 5 levels
- ✅ No search terms or brand names as categories
- ✅ Clean, navigable tree structure

---

## Problem Examples

### ❌ Invalid Data (Search Terms/Brands as Categories)

These entries have **no hierarchical structure** and appear to be search terms or promotional campaigns:

| Category Level 1 | Impressions | Days Active | Notes |
|-----------------|-------------|-------------|-------|
| `armani` | 129 | 20 | Brand name |
| `britney spears perfume` | 1 | 20 | Specific product search |
| `£10 tuesday` | 1 | 20 | Promotional campaign |
| `3 for 2` | - | 20 | Promotional campaign |
| `fragrance` | 39,556 | 20 | Should be level 2+ under Beauty |
| `general` | 15,716 | 20 | Catch-all term |
| `content` | 4,488 | 20 | System/technical category |
| `john frieda` | 1,505 | 19 | Brand name |
| `pantene` | 1,426 | 20 | Brand name |

### ✅ Valid Data (Proper Product Categories)

These categories have **hierarchical structure** (level 2+):

| Category Level 1 | Child Paths | Max Depth | Impressions | Example Hierarchy |
|-----------------|-------------|-----------|-------------|-------------------|
| `health & pharmacy` | 2 | 2 | 344,366 | health & pharmacy > lifestyle & wellbeing |
| `beauty & skincare` | 21 | 4 | 129,629 | beauty & skincare > makeup > face > foundation |
| `baby & child` | 3 | 3 | 60,852 | baby & child > baby gifting > baby shower gifting |
| `toiletries` | 2 | 3 | 57,049 | toiletries > dental > teeth whitening |
| `electrical` | 2 | 2 | 38,659 | electrical > electrical offers |
| `gift` | 2 | 3 | 6,847 | - |
| `seasonal events` | 2 | 3 | 5,588 | seasonal events > black friday > black friday baby deals |

---

## Root Cause Analysis

### Data Quality Timeline

**November 2025**: ✅ **Good data** (20 proper categories using Google Product Taxonomy)  
**January 2026**: ⚠️ **Regression started** (163 categories, only 66% with children)  
**February 2026**: ❌ **Severe degradation** (151 categories, only 5% with children)

**Regression occurred between November 2025 and January 2026.**

### Likely Source

All problematic entries share the same `campaign_name`:
```
octer-boots~catchallredirect
```

This suggests:
1. **Google Shopping campaign structure** exports search query terms as "categories"
2. **Import process** doesn't distinguish between actual product categories and search terms
3. **Catch-all campaign** aggregates miscellaneous/unstructured data

### Data Quality Degradation

January 2026 had **107 categories with hierarchical structure** (66% of level-1).  
February 2026 has **only 7 categories with hierarchical structure** (5% of level-1).

This indicates an **import process regression** or **campaign structure change** in February.

---

## Business Impact

### For ShareView Platform

- **Category Navigation Feature**: Unusable - shows 151 mostly-flat brand names instead of navigable taxonomy
- **Performance Analysis**: Cannot analyze category-level performance across hierarchy
- **User Experience**: Confusing mix of brands, campaigns, and actual categories
- **Data Quality**: Cannot trust category metrics for February data

### Expected Behavior

Users should see:
```
Beauty & Skincare (129k impressions)
├── Makeup (158 impressions)
│   ├── Face (737 impressions)
│   │   ├── Foundation (450 impressions)
│   │   ├── BB Cream (384 impressions)
│   │   └── Concealer (20 impressions)
│   └── Lips (124 impressions)
└── Skincare (452 impressions)
    └── Facial Skincare (452 impressions)
```

### Current Broken Behavior

Users see 151 entries:
```
3 for 2
£10 tuesday
armani
aussie
aveeno
barry m
batiste
beauty & skincare  ← (only 1 of 7 actual categories)
... 140+ more brand/search terms ...
```

---

## Recommended Actions

### Immediate (This Week)

1. **Restore November 2025 import process**
   - November data shows correct structure (20 Google Product Taxonomy categories)
   - Identify what changed in the import pipeline after November
   - Revert to November configuration

2. **Investigate regression timeline**
2. **Investigate regression timeline**
   - Compare import scripts/configs: November → December → January → February
   - Check for campaign structure changes in Google Ads
   - Review data source configuration changes

3. **Add data validation against November baseline**
   - Flag entries from `catchallredirect` campaigns
   - Require minimum child category depth for level-1 entries
   - Alert when level-1 category count exceeds threshold (e.g., > 50)

### Short Term (2-4 Weeks)

3. **Separate search terms from categories**
   - Create `search_performance` table for query-level data
   - Only import product taxonomy into `category_performance`
   - Map brand names to proper category paths

4. **Use product_categories table**
   - `product_categories` has item-level category data
   - Aggregate from product → category instead of campaign → category
   - Maintains proper hierarchical relationships

### Long Term (Coming Quarter)

5. **Category taxonomy standardization**
   - Define canonical category tree for each retailer
   - Validate imports against approved taxonomy
   - Version control category structure changes

6. **Data quality monitoring**
   - Daily checks for category hierarchy depth
   - Alerts for missing child categories
   - Track category count trends over time

---

## SQL Queries for Validation

### Check current data quality:

```sql
SELECT 
  COUNT(DISTINCT category_level1) as level1_count,
  COUNT(DISTINCT CASE 
    WHEN category_level2 IS NOT NULL AND category_level2 != '' 
    THEN category_level1 
  END) as level1_with_children,
  COUNT(DISTINCT (category_level1, category_level2, category_level3, category_level4, category_level5)) as total_paths
FROM category_performance 
WHERE retailer_id = 'boots' 
  AND insight_date >= CURRENT_DATE - INTERVAL '30 days';
```

### Find likely search terms:

```sql
SELECT category_level1, SUM(impressions)::int as impressions
FROM category_performance
WHERE retailer_id = 'boots'
  AND insight_date >= CURRENT_DATE - INTERVAL '7 days'
  AND category_level1 NOT IN (
    SELECT DISTINCT category_level1 
    FROM category_performance 
    WHERE category_level2 IS NOT NULL AND category_level2 != ''
  )
GROUP BY category_level1
ORDER BY SUM(impressions) DESC
LIMIT 20;
```

---

## Contact

For questions about this analysis or the category navigation feature:
- **Feature Team**: ShareView Platform Development
- **Data Source**: `acc_mgmt` database table `category_performance`
- **Report Generated**: February 20, 2026

