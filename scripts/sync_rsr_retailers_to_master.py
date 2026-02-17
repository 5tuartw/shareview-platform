#!/usr/bin/env python3
"""
Sync retailer master data from RSR database to ShareView database.
Runs daily after CSV import to ensure retailer registry is current.

FUTURE: Implement change history tracking
When augmenting this script, consider adding:
  - retailer_master_history table to track all name/network changes
  - change_type: 'created', 'updated_name', 'updated_network', etc.
  - previous_values JSONB column to store what changed
  - This enables historical reconciliation and audit trails
  - See migration 20260217_create_retailer_master.sql for schema notes

Author: AI Assistant
Date: 2026-02-17
"""

import os
import logging
from datetime import datetime
import psycopg2
from psycopg2 import sql

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def sync_retailers():
    """Sync retailer master data from RSR to ShareView."""
    
    # Database connections
    rsr_conn = None
    sv_conn = None
    
    try:
        # Connect to RSR database (source)
        rsr_url = os.getenv('RSR_DATABASE_URL')
        if not rsr_url:
            raise ValueError('RSR_DATABASE_URL environment variable not set')
        
        rsr_conn = psycopg2.connect(rsr_url)
        rsr_cursor = rsr_conn.cursor()
        
        # Connect to ShareView database (destination)
        sv_url = os.getenv('SV_DATABASE_URL')
        if not sv_url:
            raise ValueError('SV_DATABASE_URL environment variable not set')
        
        sv_conn = psycopg2.connect(sv_url)
        sv_cursor = sv_conn.cursor()
        
        # Get unique retailers from RSR (de-duplicate by retailer_id)
        rsr_cursor.execute("""
            SELECT DISTINCT 
              retailer_id,
              retailer_name,
              network
            FROM retailer_metrics
            WHERE retailer_id IS NOT NULL
            ORDER BY retailer_id
        """)
        
        retailers = rsr_cursor.fetchall()
        logger.info(f'Found {len(retailers)} unique retailers in RSR')
        
        # Sync to ShareView
        inserted = 0
        updated = 0
        
        for retailer_id, retailer_name, network in retailers:
            # Upsert: insert new or update existing
            sv_cursor.execute(sql.SQL("""
                INSERT INTO retailer_master 
                  (retailer_id, retailer_name, network, first_seen_date, last_seen_date, last_sync_datetime)
                VALUES (%s, %s, %s, NOW(), NOW(), NOW())
                ON CONFLICT (retailer_id) DO UPDATE SET
                  retailer_name = EXCLUDED.retailer_name,
                  network = EXCLUDED.network,
                  last_seen_date = NOW(),
                  last_sync_datetime = NOW(),
                  updated_at = NOW()
                WHERE retailer_master.retailer_name != EXCLUDED.retailer_name
                  OR retailer_master.network IS DISTINCT FROM EXCLUDED.network
            """), (retailer_id, retailer_name, network))
            
            if sv_cursor.rowcount > 0:
                if 'INSERT' in sv_cursor.statusmessage or sv_cursor.rowcount == 1:
                    inserted += 1
                else:
                    updated += 1
        
        sv_conn.commit()
        logger.info(f'Sync complete: {inserted} inserted, {updated} updated')
        
        return True
        
    except Exception as e:
        logger.error(f'Error syncing retailers: {e}', exc_info=True)
        if sv_conn:
            sv_conn.rollback()
        return False
        
    finally:
        if rsr_cursor:
            rsr_cursor.close()
        if rsr_conn:
            rsr_conn.close()
        if sv_cursor:
            sv_cursor.close()
        if sv_conn:
            sv_conn.close()


if __name__ == '__main__':
    success = sync_retailers()
    exit(0 if success else 1)
