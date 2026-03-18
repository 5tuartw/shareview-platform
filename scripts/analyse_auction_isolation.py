#!/usr/bin/env python3
"""
Auction Insights Isolation Analysis
====================================
Reads the raw Auction Insights CSV export and determines, per retailer per month,
whether their data can be cleanly isolated.

Key questions answered:
  - Which campaigns can be reliably mapped to a single Shareview retailer ID?
  - When did retailers transition from a shared account (Octer CSS / Fevuh CSS)
    to their own dedicated CSS account?
  - Which campaigns/slugs could NOT be matched to a known retailer (need manual lookup)?

Outputs (written to tmp/):
  auction_isolation_summary.csv   — one row per retailer × month
  auction_unmatched_campaigns.csv — campaigns that couldn't be mapped, sorted by volume

Usage:
  python scripts/analyse_auction_isolation.py [path/to/auction_insights.csv]

  Default CSV path: tmp/Auction Insights - jan25-jan26.csv
  Requires: pip install pandas psycopg2-binary python-dotenv
"""

import re
import sys
import os
from pathlib import Path
from datetime import datetime

import pandas as pd
import psycopg2

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
ENV_FILE     = PROJECT_ROOT / '.env.local'
OUTPUT_DIR   = PROJECT_ROOT / 'tmp'

DEFAULT_CSV = OUTPUT_DIR / 'Auction Insights - jan25-jan26.csv'

# Maps CSV campaign slug → Shareview retailer_id where they differ.
# Slugs not in this map are matched directly (slug == retailer_id).
SLUG_TO_RETAILER_ID = {
    'asdageorge':      'asda-george',
    'aspinal':         'aspinal-of-london',
    'cosde':           'cos-de',
    'feelunique':      'sephora',
    'hartsofstur':     'harts-of-stur',
    'harveynichols':   'harvey-nichols',
    'jdwilliams':      'jd-williams',
    'loungeunderwear': 'lounge-underwear',
    'm&s':             'marks-and-spencer',
    'nobodyschild':    'nobodys-child',
    'petsathome':      'pets-at-home',
    'simplybe':        'simply-be',
    'tkmaxx':          'tk-maxx',
    'tkmaxxde':        'tk-maxx-de',
}

# These account names are shared-account CSS providers (one account, many retailers).
# Dedicated accounts (QVC CSS, Boots CSS, etc.) are anything else.
SHARED_ACCOUNT_NAMES = {
    'octer css',
    'fevuh css',
}

# Month name → zero-padded month number
MONTH_MAP = {
    'january': '01', 'february': '02', 'march': '03', 'april': '04',
    'may': '05', 'june': '06', 'july': '07', 'august': '08',
    'september': '09', 'october': '10', 'november': '11', 'december': '12',
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_env(env_file: Path) -> dict:
    """Parse .env.local into a plain dict (handles KEY=value and KEY="value")."""
    env = {}
    if not env_file.exists():
        return env
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, val = line.partition('=')
        val = val.strip().strip('"').strip("'")
        env[key.strip()] = val
    return env


def parse_month(raw: str) -> str:
    """'January 2026' → '2026-01', unknown → original string."""
    raw = raw.strip()
    parts = raw.lower().split()
    if len(parts) == 2 and parts[0] in MONTH_MAP:
        return f"{parts[1]}-{MONTH_MAP[parts[0]]}"
    return raw


def parse_share(raw: str):
    """
    '27.03%' → 0.2703
    '< 10%'  → 0.05  (midpoint proxy; flagged via is_estimate column)
    '--'     → None
    blanks   → None
    """
    if not isinstance(raw, str):
        return None, False
    raw = raw.strip()
    if raw in ('--', '', '-'):
        return None, False
    if raw.startswith('<'):
        return 0.05, True          # "< 10%" — store as 5% midpoint
    try:
        return float(raw.rstrip('%')) / 100, False
    except ValueError:
        return None, False


def extract_slug(campaign: str):
    """
    Extract (provider, slug) from a campaign name.

    Examples:
      'octer-boots~catchallredirect'   → ('octer', 'boots')
      'octer-boots~cat_skincare'       → ('octer', 'boots')
      'closer-schuh~catchall'          → ('closer', 'schuh')
      'ebayclo-all~cat_coatjacket...'  → ('ebayclo', 'all')
      'bluewater-boots~catchall'       → ('bluewater', 'boots')

    Returns (provider, slug) or (None, None) if pattern doesn't match.
    """
    m = re.match(r'^([a-z0-9]+)-([a-z0-9&_.]+)', campaign.strip().lower())
    if m:
        return m.group(1), m.group(2)
    return None, None


def load_sv_retailers(env: dict) -> dict:
    """
    Connect to Shareview DB and return {retailer_id: retailer_name}.
    Returns empty dict if connection fails (script still runs; all flagged unmatched).
    """
    try:
        conn = psycopg2.connect(
            host=env.get('SV_DB_HOST', '127.0.0.1'),
            port=int(env.get('SV_DB_PORT', 5437)),
            user=env.get('SV_DB_USER', 'sv_user'),
            password=env.get('SV_DB_PASS', ''),
            database=env.get('SV_DB_NAME', 'shareview'),
            connect_timeout=5,
        )
        with conn.cursor() as cur:
            cur.execute("SELECT retailer_id, retailer_name FROM retailers")
            rows = cur.fetchall()
        conn.close()
        print(f"  Loaded {len(rows)} retailers from Shareview DB")
        return {row[0]: row[1] for row in rows}
    except Exception as exc:
        print(f"  WARNING: Could not connect to Shareview DB ({exc})")
        print("           All slugs will be flagged as unmatched.")
        return {}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    if not csv_path.exists():
        print(f"ERROR: CSV not found: {csv_path}")
        sys.exit(1)

    print(f"\nAuction Isolation Analysis")
    print(f"  CSV : {csv_path}")
    print(f"  Rows: (counting...)")

    # ------------------------------------------------------------------
    # 1. Load environment + retailer list
    # ------------------------------------------------------------------
    env = load_env(ENV_FILE)
    print("\nLoading Shareview retailers...")
    sv_retailers = load_sv_retailers(env)   # {id: name}

    # ------------------------------------------------------------------
    # 2. Read CSV  (2-line preamble, then header on line 3)
    # ------------------------------------------------------------------
    print("\nReading CSV...")
    df_raw = pd.read_csv(csv_path, skiprows=2, dtype=str)
    df_raw.columns = [c.strip() for c in df_raw.columns]

    # Rename to short names
    df_raw = df_raw.rename(columns={
        'Account name':                               'account_name',
        'Customer ID':                                'customer_id',
        'Campaign':                                   'campaign',
        'Shop display name':                          'shop_display_name',
        'Month':                                      'month_raw',
        'Shopping Impr. share (Auction Insights)':    'impr_share_raw',
        'Shopping outranking share':                  'outranking_share_raw',
        'Shopping overlap rate':                      'overlap_rate_raw',
    })
    print(f"  Rows: {len(df_raw):,}")

    # ------------------------------------------------------------------
    # 3. Parse / clean columns
    # ------------------------------------------------------------------
    df_raw['month']         = df_raw['month_raw'].apply(parse_month)
    df_raw['account_lower'] = df_raw['account_name'].str.strip().str.lower()
    df_raw['is_you']        = df_raw['shop_display_name'].str.strip().str.lower() == 'you'
    df_raw['is_shared_account'] = df_raw['account_lower'].isin(SHARED_ACCOUNT_NAMES)

    # Parse percentage columns into floats + estimate flag
    for col in ('impr_share_raw', 'outranking_share_raw', 'overlap_rate_raw'):
        out_col   = col.replace('_raw', '')
        est_col   = col.replace('_raw', '_is_est')
        parsed    = df_raw[col].apply(parse_share)
        df_raw[out_col]  = [v for v, _ in parsed]
        df_raw[est_col]  = [e for _, e in parsed]

    # Extract (provider, slug) from campaign name
    slugs = df_raw['campaign'].apply(extract_slug)
    df_raw['provider'] = [p for p, _ in slugs]
    df_raw['slug']     = [s for _, s in slugs]

    # Match slug → Shareview retailer ID (direct match OR alias map)
    def resolve_retailer_id(slug):
        if not slug:
            return None
        if slug in sv_retailers:          # direct: slug == retailer_id
            return slug
        mapped = SLUG_TO_RETAILER_ID.get(slug)
        if mapped and mapped in sv_retailers:
            return mapped
        return None

    df_raw['retailer_id'] = df_raw['slug'].apply(resolve_retailer_id)
    df_raw['retailer_name'] = df_raw['retailer_id'].map(sv_retailers)
    df_raw['slug_matched']  = df_raw['retailer_id'].notna()

    # ------------------------------------------------------------------
    # 4. Build unmatched campaigns report
    # ------------------------------------------------------------------
    unmatched_mask = ~df_raw['slug_matched']
    unmatched_df   = (
        df_raw[unmatched_mask]
        .groupby(['provider', 'slug', 'campaign', 'account_name', 'customer_id'])
        .agg(
            months_seen=('month',       lambda x: ', '.join(sorted(x.unique()))),
            row_count=  ('month',       'count'),
            first_month=('month',       'min'),
            last_month= ('month',       'max'),
        )
        .reset_index()
        .sort_values('row_count', ascending=False)
    )
    # Fill None provider/slug with descriptive strings
    unmatched_df['provider'] = unmatched_df['provider'].fillna('no_pattern')
    unmatched_df['slug']     = unmatched_df['slug'].fillna('no_pattern')

    # ------------------------------------------------------------------
    # 5. Build per-retailer × month isolation summary (matched only)
    # ------------------------------------------------------------------
    matched_df = df_raw[df_raw['slug_matched']].copy()

    def summarise_group(g):
        accounts      = sorted(g['account_name'].unique())
        campaigns     = sorted(g['campaign'].unique())
        customer_ids  = sorted(g['customer_id'].unique())

        you_rows      = g[g['is_you']]
        comp_rows     = g[~g['is_you']]

        # Our own impression share: average across "You" rows for this retailer/month
        our_impr_share    = you_rows['impr_share'].mean() if len(you_rows) else None
        our_impr_is_est   = bool(you_rows['impr_share_is_est'].any()) if len(you_rows) else False

        # Competitor count (unique shop_display_name, ignoring "You")
        competitor_count  = comp_rows['shop_display_name'].nunique()

        # Avg competitor overlap and outranking across all competitors this month
        avg_overlap       = comp_rows['overlap_rate'].mean()    if len(comp_rows) else None
        avg_outranking    = comp_rows['outranking_share'].mean() if len(comp_rows) else None

        # Isolation status
        #   clean          — exactly one account and/or all dedicated to this retailer
        #   shared_account — data is in a shared account (Octer/Fevuh) but slug is unique
        #   multi_account  — both shared and dedicated in same month (transition month)
        shared_in_group    = any(acc.lower() in SHARED_ACCOUNT_NAMES for acc in accounts)
        dedicated_in_group = any(acc.lower() not in SHARED_ACCOUNT_NAMES for acc in accounts)

        if shared_in_group and dedicated_in_group:
            isolation_status = 'transition'        # both present — overlap month
        elif shared_in_group:
            isolation_status = 'shared_account'    # usable but from pooled account
        else:
            isolation_status = 'dedicated'         # best: own CSS account

        # Check for multi-slug anomaly within this group (shouldn't happen but safeguard)
        slugs_in_group = g['slug'].unique()
        if len(slugs_in_group) > 1:
            isolation_status = 'MULTI_SLUG_ERROR'  # flag for investigation

        return pd.Series({
            'isolation_status':    isolation_status,
            'account_names':       ' | '.join(accounts),
            'customer_ids':        ' | '.join(customer_ids),
            'campaign_count':      len(campaigns),
            'campaigns':           ' | '.join(campaigns),
            'our_impr_share':      round(our_impr_share, 4) if our_impr_share is not None else None,
            'our_impr_is_estimate': our_impr_is_est,
            'you_row_count':       len(you_rows),
            'competitor_count':    competitor_count,
            'avg_overlap_rate':    round(avg_overlap, 4)    if avg_overlap    is not None else None,
            'avg_outranking_share': round(avg_outranking, 4) if avg_outranking is not None else None,
            'total_rows':          len(g),
        })

    print("\nBuilding isolation summary...")
    summary = (
        matched_df
        .groupby(['retailer_id', 'retailer_name', 'month'])
        .apply(summarise_group)
        .reset_index()
        .sort_values(['retailer_id', 'month'], ascending=[True, False])
    )

    # ------------------------------------------------------------------
    # 6. Add per-retailer rollup columns
    # ------------------------------------------------------------------
    # For each retailer, find the earliest month with a dedicated account
    # (i.e. isolation_status == 'dedicated')
    dedicated_months = (
        summary[summary['isolation_status'] == 'dedicated']
        .groupby('retailer_id')['month']
        .min()
        .rename('dedicated_from')
    )
    summary = summary.merge(dedicated_months, on='retailer_id', how='left')

    # Count clean/usable months (dedicated or shared_account — both are isolatable)
    usable_statuses = {'dedicated', 'shared_account'}
    usable_counts = (
        summary[summary['isolation_status'].isin(usable_statuses)]
        .groupby('retailer_id')['month']
        .count()
        .rename('usable_months')
    )
    total_counts = (
        summary
        .groupby('retailer_id')['month']
        .count()
        .rename('total_months')
    )
    summary = summary.merge(usable_counts, on='retailer_id', how='left')
    summary = summary.merge(total_counts,  on='retailer_id', how='left')
    summary['usable_months'] = summary['usable_months'].fillna(0).astype(int)

    # ------------------------------------------------------------------
    # 7. Write outputs
    # ------------------------------------------------------------------
    OUTPUT_DIR.mkdir(exist_ok=True)

    summary_path   = OUTPUT_DIR / 'auction_isolation_summary.csv'
    unmatched_path = OUTPUT_DIR / 'auction_unmatched_campaigns.csv'

    summary.to_csv(summary_path,   index=False)
    unmatched_df.to_csv(unmatched_path, index=False)

    # ------------------------------------------------------------------
    # 8. Print console summary
    # ------------------------------------------------------------------
    total_rows     = len(df_raw)
    matched_rows   = df_raw['slug_matched'].sum()
    unmatched_rows = (~df_raw['slug_matched']).sum()
    no_pattern     = df_raw['provider'].isna().sum()

    print(f"\n{'='*60}")
    print(f"  Total CSV rows:        {total_rows:>8,}")
    print(f"  Slug matched:          {matched_rows:>8,}  ({matched_rows/total_rows*100:.1f}%)")
    print(f"  Unmatched:             {unmatched_rows:>8,}  ({unmatched_rows/total_rows*100:.1f}%)")
    print(f"    of which no pattern: {no_pattern:>8,}")
    print(f"{'='*60}")

    print(f"\nMatched retailers: {summary['retailer_id'].nunique()}")
    print(f"Months in data:    {summary['month'].nunique()}")

    print(f"\nIsolation status breakdown (row = retailer×month):")
    for status, cnt in summary['isolation_status'].value_counts().items():
        print(f"  {status:<22} {cnt:>4}")

    print(f"\nDedicated CSS account retailers: "
          f"{dedicated_months.notna().sum()} "
          f"(have at least one dedicated month)")

    print(f"\nTop unmatched by row count:")
    print(unmatched_df[['account_name', 'slug', 'campaign', 'row_count', 'months_seen']]
          .head(15)
          .to_string(index=False))

    print(f"\nOutputs written to:")
    print(f"  {summary_path}")
    print(f"  {unmatched_path}")
    print()


if __name__ == '__main__':
    main()
