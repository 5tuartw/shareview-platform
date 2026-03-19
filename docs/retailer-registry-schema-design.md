# Master Retailer Registry — Schema Design

---

## Goal

Transition all source tables to use a single internal `retailer.id` as the stable key. A central `retailer-registry` table (or schema) serves as the authoritative reference for:

- the data importer/fetcher service (knows which network account ID to fetch for each retailer)
- the Shareview report builder (resolves any source ID → internal retailer)
- the campaign management service (owns campaign name → retailer mapping)
- the auction insights pipeline (resolves Google Ads `customer_id` + `campaign_name` → retailer)
- the RSR overview data pipeline (resolves legacy numeric IDs in `monthly_archive`)

---

## Core Insight

After the transition, all services write and read using `retailers.id` as the single internal key. External IDs (network, Google Ads, legacy source IDs) are looked up through sub-tables, always scoped to a time range so history is preserved.

---

## Table 1: `retailers` — Stable Identity

```sql
CREATE TABLE retailers (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug          VARCHAR(100) NOT NULL UNIQUE,  -- stable, never reused (e.g. 'marks-and-spencer')
  display_name  VARCHAR(255) NOT NULL,          -- 'Marks & Spencer'
  market        VARCHAR(10)  NOT NULL,          -- 'uk' | 'de' | 'fr' etc.
  status        VARCHAR(20)  NOT NULL DEFAULT 'active',
  -- business fields: account_manager, tier, target_roi, etc.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

This table never changes its `id`. The `slug` is also stable once confirmed — it is used in Shareview URLs. Everything else can be updated.

---

## Table 2: `retailer_network_accounts` — Affiliate Network IDs

The most critical table. Maps internal retailer IDs to affiliate network account IDs with full history.

```sql
CREATE TABLE retailer_network_accounts (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  retailer_id        BIGINT NOT NULL REFERENCES retailers(id),
  network            VARCHAR(50) NOT NULL,       -- 'awin' | 'rakuten' | 'impact' | 'cj' | 'partnerize'
  network_account_id VARCHAR(100) NOT NULL,      -- '3027' | '1011l6451' | '53153' etc.
  valid_from         DATE NOT NULL,
  valid_to           DATE,                       -- NULL = currently active
  notes              TEXT,                       -- e.g. 'Migrated from Awin to Impact, Jan 2026'

  -- Prevent exact duplicate entries
  UNIQUE (network, network_account_id, valid_from)
);

CREATE INDEX ON retailer_network_accounts (retailer_id, network, valid_to);
CREATE INDEX ON retailer_network_accounts (network, network_account_id);
```

**Why this covers the key cases:**

- A retailer moving from Awin (`3027`) to Impact (`1011l6xxx`) gets a new row with `valid_from = migration date`; the old Awin row gets `valid_to` set — but historical data in acc_mgmt under `3027` remains resolvable.
- Two retailers can have the same `network_account_id` on *different* networks — the `(network, network_account_id)` pair is what is unique, not the ID alone.
- The Impact `NNNNlNNNN` format (`1011l6451`) maps cleanly — `1011` is the Impact programme/sub-account, `6451` is the advertiser ID within it. A retailer moving programmes within Impact receives a new full ID and a new row.

---

## Table 3: `retailer_campaigns` — Ad Platform Campaigns

```sql
CREATE TYPE campaign_platform AS ENUM ('octer', 'fevuh', 'octerde', 'ebay', 'other');
CREATE TYPE campaign_market   AS ENUM ('uk', 'de', 'fr', 'other');

CREATE TABLE retailer_campaigns (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  retailer_id   BIGINT NOT NULL REFERENCES retailers(id),
  campaign_name VARCHAR(255) NOT NULL,  -- e.g. 'octer-boots~catchallredirect'
  platform      campaign_platform NOT NULL,
  market        campaign_market   NOT NULL DEFAULT 'uk',
  campaign_type VARCHAR(50),           -- 'catchall' | 'category' | 'vip' | 'priority' etc.
  active_from   DATE NOT NULL,
  active_to     DATE,                  -- NULL = currently active
  notes         TEXT,

  UNIQUE (campaign_name, active_from)
);

CREATE INDEX ON retailer_campaigns (retailer_id, platform);
CREATE INDEX ON retailer_campaigns (campaign_name) WHERE active_to IS NULL;
```

`campaign_name` is currently the most reliable cross-system join key — it appears in all four domain tables and in `auction_insights`. Recording it here means any service can resolve `campaign_name → retailer_id` without string parsing.

---

## Table 4: `retailer_google_ads_accounts` — Google Ads / Auction Data

```sql
CREATE TABLE retailer_google_ads_accounts (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  retailer_id        BIGINT NOT NULL REFERENCES retailers(id),
  customer_id        VARCHAR(20) NOT NULL,     -- e.g. '978-008-8984'
  is_manager_account BOOLEAN NOT NULL DEFAULT FALSE,
  parent_customer_id VARCHAR(20),              -- for sub-accounts, points to the MCC
  active_from        DATE NOT NULL,
  active_to          DATE,                     -- NULL = currently active

  UNIQUE (customer_id, active_from)
);

CREATE INDEX ON retailer_google_ads_accounts (retailer_id);
CREATE INDEX ON retailer_google_ads_accounts (customer_id) WHERE active_to IS NULL;
```

This resolves `auction_insights` data (keyed by `customer_id + campaign_name`) to an internal retailer ID. Combined with `retailer_campaigns`, the join chain is:

```
auction_insights.campaign_name
  → retailer_campaigns.campaign_name
  → retailers.id
```

The `customer_id` field handles cases where a retailer has its own dedicated Google Ads account vs. sitting under the Shareight manager account (`978-008-8984`).

---

## How Services Connect

```
affiliate network data fetcher
  → reads retailer_network_accounts WHERE retailer_id = ? AND network = ? AND valid_to IS NULL
  → fetches from Awin/Impact/CJ using network_account_id
  → writes to acc_mgmt using retailers.id (post-migration)

campaign management service
  → reads/writes retailer_campaigns
  → knows which campaign_name maps to which retailer

shareview report builder
  → queries acc_mgmt domain tables WHERE retailer_id = retailers.id
  → for pre-migration historical rows: resolves via retailer_source_id_history

auction insights pipeline
  → resolves customer_id → retailer via retailer_google_ads_accounts
  → resolves campaign_name → retailer via retailer_campaigns

RSR overview data
  → retailers.id maps to monthly_archive.retailer_id after migration
  → pre-migration: resolved via retailer_source_id_history
    (RSR uses network IDs almost exclusively — 383 of 408 are pure numeric)
```

---

## Key Design Decisions to Resolve

1. **Where does this registry live?**  
   A dedicated `retailer-registry` DB (or a separate schema in the Shareview DB) that all services connect to read-only, with a single authoritative writer. No service should hold its own copy of the mapping.

2. **Who is the authoritative writer?**  
   Likely the Shareview admin UI or a dedicated admin service. Changes to network accounts especially should require explicit confirmation — not silent updates from a data pipeline.

3. **`valid_to` discipline is the hardest operational challenge.**  
   When a retailer moves network, something must set `valid_to` on the old row. A database constraint preventing two overlapping active rows for the same `(retailer_id, network)` pair is a useful guard:
   ```sql
   -- Exclude constraint: no two active rows for same retailer+network
   ALTER TABLE retailer_network_accounts
     ADD CONSTRAINT no_overlapping_active_accounts
     EXCLUDE USING gist (
       retailer_id WITH =,
       network WITH =,
       daterange(valid_from, valid_to, '[)') WITH &&
     );
   ```

4. **The `all` eBay problem.**  
   acc_mgmt `retailer_id = 'all'` has 30+ campaigns across eBay verticals (`ebayclo`, `ebayhom`, `ebayjew`, etc.). A business decision is needed: one `retailers` row for eBay, or separate rows per vertical. This affects how eBay data is displayed in Shareview.

5. **The `lancôme` / `m&s` character problem.**  
   Some slugs contain non-ASCII characters (`ô`) or special characters (`&`). The new internal `slug` field should enforce `[a-z0-9-]` only, with `display_name` carrying the human-readable form. The old values survive in `retailer_source_id_history` without needing sanitisation.

---
