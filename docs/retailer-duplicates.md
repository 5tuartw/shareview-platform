
## Confirmed Duplicate `retailer_id` Inventory

> Queried across all three domain tables: `category_performance` (full table), `product_performance` (≥ 2025-06-01), and `keywords` (indexed range checks). All 20 pairs are confirmed present in all three tables.
> 
> Data as of **2026-03-19** (most recent data date in source DB).

### Pattern

Every duplicate follows the same pattern: the original `retailer_id` is a human-readable slug (e.g. `m&s`, `etsy`) while the new value is a numeric or alphanumeric network account ID (`1402`, `6091`, `1011l6018`). The slug was used during early onboarding; the numeric ID represents a separate product feed or campaign configuration that was onboarded later.

### Root cause: shared account vs dedicated account

The two IDs represent **two different Google Ads accounts** writing data into the same tables via the same pipeline:

| ID type | Google Ads account | Example |
|---|---|---|
| **Slug** | Shareight shared CSS account (`Octer CSS`, customer `978-008-8984`, or `Octer DE CSS - Euros` for German market) | `m&s` / `etsy` / `cosde` |
| **Numeric** | Retailer's dedicated Google Ads account (managed by Shareight) | `1402` / `6091` / `46463` |

Confirmed via the `clicks_impr_convs` table, which exposes the upstream `customer_id` alongside `retailer_id`:

```
m&s    → customer 978-008-8984  → Octer CSS (shared)
1402   → customer 325-209-3442  → M&S CSS (dedicated)
etsy   → customer 978-008-8984  → Octer CSS (shared)
6091   → customer 550-163-8078  → Etsy CSS (dedicated)
cosde  → customer 268-078-2217  → Octer DE CSS - Euros (shared DE)
46463  → customer 778-341-0821  → COS DE CSS (dedicated)
```

The `accounts` and `retailer_id_mappings` tables only record the **dedicated** accounts — the shared `Octer CSS` account's contributions are written using slug-based `retailer_id` values derived from the campaign name, not from an account ID.

The data differs because the two accounts run different product selections, bid strategies, and budgets. As retailers migrate from shared to dedicated accounts, dedicated account volume grows while shared account volume declines (visible in the etsy trend: slug dropping from ~74% to ~34% of combined impressions over 3 months).

**Implication**: the two IDs should be **summed** to obtain the complete retailer total. A query filtering to only one ID will under-report — on 2026-03-10, the `m&s` shared account row had 430K impressions vs only 33K in the `1402` dedicated account.

---

### Shareview snapshot behaviour and under-reporting

#### Which ID is used for snapshots

The snapshot generator (`services/snapshot-generator/generate-snapshots.ts`) reads `retailers.source_retailer_id` from the Shareview DB and uses it as the single `retailer_id` filter when querying the source (acc-mgmt) tables. All 20 retailers have `source_retailer_id` set to the **numeric/dedicated account ID**:

| Shareview `retailer_id` | `source_retailer_id` used for snapshots |
|---|---|
| marks-and-spencer | `1402` |
| etsy | `6091` |
| cos-de | `46463` |
| levis | `53153` |
| lounge-underwear | `38798` |
| nobodys-child | `7090990` |
| pets-at-home | `40864` |
| boohooman | `7009` |
| brandalley | `5221712` |
| brora | `17043` |
| cos | `47832` |
| flannels | `1011l6018` |
| harts-of-stur | `32187` |
| jacamo | `3026` |
| lego | `24340` |
| tk-maxx | `43244` |
| uniqlo | `6771` |
| frasers | `1100l5964` |
| qvc | `7202610` |
| asda-george | `6400033` |

The shared-account slug (`m&s`, `etsy`, etc.) is **never queried**. This is a single-ID filter, not a union.

#### Is this the same root cause as the auctions solution?

**Yes — same root cause, but a different constraint.**

For auction data, the same dual-account situation exists (shared Octer CSS vs dedicated retailer account). The solution there was to mark one source as `preferred_for_display = true` in the `auction_insights` table, with the dedicated account preferred. The snapshot generator then filters `WHERE preferred_for_display = true`.

The reason a "pick one" approach was used for auctions is that **auction metrics are relative percentages** (impression share, overlap rate, outranking share) — they cannot be meaningfully summed across two independently-bidding accounts. Averaging them would be misleading.

For **keywords, categories, and products**, the metrics are **additive counts** (impressions, clicks, conversions). Both accounts' activity represents real traffic against the retailer's products, so the correct approach is to sum both IDs, not pick one.

The current single-ID implementation of the snapshot generator therefore under-reports for any retailer where the shared account is still active.

#### Volume split — Category A (both accounts active, last 30 days of `category_performance`)

> Data period: 2026-02-17 to 2026-03-19.

| Retailer pair (slug / numeric) | Shared acct impressions | Dedicated acct impressions | Combined | Shared % | Dedicated % | Currently captured |
|---|---|---|---|---|---|---|
| m&s / 1402 | 8,669,679 | 1,156,877 | 9,826,556 | 88.2% | 11.8% | **11.8%** |
| petsathome / 40864 | 3,569,722 | 850,567 | 4,420,289 | 80.8% | 19.2% | **19.2%** |
| nobodyschild / 7090990 | 3,615,826 | 588,673 | 4,204,499 | 86.0% | 14.0% | **14.0%** |
| etsy / 6091 | 3,058,470 | 4,616,973 | 7,675,443 | 39.8% | 60.2% | **60.2%** |
| cosde / 46463 | 2,629,943 | 906,875 | 3,536,818 | 74.4% | 25.6% | **25.6%** |
| levis / 53153 | 1,016,326 | 508,292 | 1,524,618 | 66.7% | 33.3% | **33.3%** |
| loungeunderwear / 38798 | 524,760 | 359,575 | 884,335 | 59.3% | 40.7% | **40.7%** |

Snapshots for these 7 retailers are capturing **11–60% of actual impressions**. The worst case is M&S: only 11.8% of combined impressions are reflected in the snapshot.

#### Volume split — Category B (overlap window, slug data lost)

During the overlap window each Category B retailer ran both accounts simultaneously. Snapshots only captured the dedicated (numeric) account, missing the following shared-account impressions:

| Retailer | Shared acct impressions (overlap period) | Dedicated acct impressions | Shared % of combined |
|---|---|---|---|
| uniqlo | 25,653,108 | 3,623,282 | 87.6% missed |
| brora | 914,666 | 344,748 | 72.6% missed |
| lego | 406,216 | 216,835 | 65.2% missed |
| cos | 303,136 | 115,324 | 72.4% missed |
| flannels | 1,222,159 | 2,886,464 | 29.7% missed |
| boohooman | 130,841 | 239,356 | 35.3% missed |
| brandalley | 83,535 | 156,074 | 34.9% missed |
| tkmaxx | 476,948 | 1,503,546 | 24.1% missed |
| hartsofstur | 85,901 | 265,392 | 24.5% missed |
| jacamo | 64,620 | 222,211 | 22.5% missed |

For these retailers, `current_month` and `last_month` snapshots generated during the overlap window are under-reported. Post-overlap (shared account gone), the numeric-only ID is now complete and accurate.

---

### Category A — Both IDs currently active (as of 2026-03-19)

> These 7 retailers have campaigns running **simultaneously in both the Shareight shared account and their dedicated account**. The data is distinct — not duplicated. Both feeds are real and must be summed for full performance totals.
>
> **Trend analysis (category_performance, Jan–Mar 2026)**:
> - `cosde`: shared account (slug) accounts for 44–93% of combined impressions — declining as dedicated grows
> - `m&s`: shared account still dominant at 56–100%; dedicated account (`1402`) launched Jan 24
> - `etsy`: shared account declining from ~74% → ~34% over 3 months as dedicated (`6091`) grows

| Retailer | Slug ID | Numeric/Alphanumeric ID | Slug first seen | Numeric first seen |
|---|---|---|---|---|
| COS DE | `cosde` | `46463` | 2025-12-02 | 2025-12-08 |
| Etsy | `etsy` | `6091` | 2025-11-17 | 2025-12-02 |
| Levi's | `levis` | `53153` | 2025-11-01 | 2026-02-08 |
| Lounge Underwear | `loungeunderwear` | `38798` | 2025-11-01 | 2026-02-09 |
| Marks & Spencer | `m&s` | `1402` | 2025-11-01 | 2026-01-24 |
| Nobody's Child | `nobodyschild` | `7090990` | 2025-11-01 | 2026-01-25 |
| Pets at Home | `petsathome` | `40864` | 2025-11-01 | 2026-02-09 |

**Impact**: Any Shareview query that filters to a single `retailer_id` (slug OR numeric) will **under-report** performance by missing the other segment. The correct total requires aggregating both IDs together.

---

### Category B — Slug discontinued, numeric ID now active

> The shared account (`Octer CSS`) stopped running campaigns for this retailer; the dedicated account is now the only active feed. During the overlap window, both accounts ran simultaneously. The shared account was typically the dominant feed; the dedicated took over completely once the shared campaigns were paused.
>
> In all 10 cases below, there is an overlap period — this represents genuine parallel activity from both accounts, not a data error.

| Retailer | Slug ID | Slug last date | Numeric ID | Numeric first date | Overlap? |
|---|---|---|---|---|---|
| boohooMAN | `boohooman` | 2026-02-21 | `7009` | 2026-02-08 | Yes (13 days) |
| BrandAlley | `brandalley` | 2026-02-21 | `5221712` | 2026-02-08 | Yes (13 days) |
| Brora | `brora` | 2026-03-14 | `17043` | 2026-02-08 | Yes (34 days) |
| COS | `cos` | 2025-12-21 | `47832` | 2025-12-08 | Yes (13 days) |
| Flannels | `flannels` | 2026-02-19 | `1011l6018` | 2026-01-15 | Yes (35 days) |
| Harts of Stur | `hartsofstur` | 2026-02-23 | `32187` | 2026-02-09 | Yes (14 days) |
| Jacamo | `jacamo` | 2026-02-05 | `3026` | 2026-01-24 | Yes (12 days) |
| LEGO | `lego` | 2026-02-21 | `24340` | 2026-02-09 | Yes (12 days) |
| TK Maxx | `tkmaxx` | 2026-01-28 | `43244` | 2026-01-15 | Yes (13 days) |
| Uniqlo | `uniqlo` | 2026-01-13 | `6771` | 2025-12-11 | Yes (33 days) |

**Frasers (no-overlap)**: Slug `frasers` ended 2026-01-03; numeric `1100l5964` started 2026-02-05. 33-day gap — no overlap, but also no continuity in data.

**QVC (no-overlap)**: Slug `qvc` ended 2025-12-17; numeric `7202610` started 2026-01-15. 29-day gap.

---

### Category C — Both IDs discontinued

| Retailer | Slug ID | Slug last date | Numeric ID | Numeric last date |
|---|---|---|---|---|
| ASDA George | `asdageorge` | 2026-01-17 | `6400033` | 2026-02-26 |

Numeric `6400033` last appeared 2026-02-26, which is 21 days before the data snapshot date. Possible causes: (a) retailer churned, (b) network account migrated again, (c) data pipeline issue.

---

### Summary counts

| Category | Count | Action required |
|---|---|---|
| Both IDs active (separate feeds, must sum) | 7 | Queries must include both IDs to get full total |
| Slug discontinued, numeric active | 11 | Map slug → numeric in registry; historical data needs both IDs for complete picture |
| Both discontinued | 1 (asdageorge) | Investigate if retailer is churned or re-mapped |
| **Total duplicate pairs** | **20** | All confirmed in keywords, category_performance, product_performance |

---

### Seed data for `retailer_source_id_history`

The table below documents the known legacy → current ID transitions for initial population of `retailer_source_id_history`.

```sql
-- Category A: both still active – valid_to is NULL for both (registry must pick canonical)
-- ('nobodyschild', valid_from='2025-11-01', valid_to=NULL)   # old slug
-- ('7090990',      valid_from='2026-01-25', valid_to=NULL)   # new network ID

-- Category B: slug superseded
INSERT INTO retailer_source_id_history (retailer_id, source_id, valid_from, valid_to, notes) VALUES
-- Placeholder: replace retailer_id with actual retailers.id after retailers table is populated
  (:mands_id,       'm&s',             '2025-11-01', NULL,         'original slug, still active'),
  (:mands_id,       '1402',            '2026-01-24', NULL,         'Awin network account ID, still active'),
  (:etsy_id,        'etsy',            '2025-11-17', NULL,         'original slug, still active'),
  (:etsy_id,        '6091',            '2025-12-02', NULL,         'network account ID, still active'),
  -- ... (complete list from table above)
  (:tkmaxx_id,      'tkmaxx',          '2025-11-01', '2026-01-28', 'superseded by numeric ID'),
  (:tkmaxx_id,      '43244',           '2026-01-15', NULL,         'current network account ID');
```
