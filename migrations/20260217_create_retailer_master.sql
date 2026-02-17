-- Migration: Create retailer_master table
-- Purpose: Centralized retailer registry for ShareView, synced from RSR data
-- Deployed: 2026-02-17

CREATE TABLE retailer_master (
  retailer_id TEXT PRIMARY KEY,
  retailer_name TEXT NOT NULL,
  network TEXT,
  
  -- Data lineage and tracking
  primary_source TEXT DEFAULT 'rsr-csv',  -- rsr-csv, api, manual, etc.
  first_seen_date TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen_date TIMESTAMP NOT NULL DEFAULT NOW(),
  last_sync_datetime TIMESTAMP,  -- When this record was last updated from source
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata for future use (extensible without schema changes)
  metadata JSONB,
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_retailer_master_active ON retailer_master(is_active);
CREATE INDEX idx_retailer_master_network ON retailer_master(network);
CREATE INDEX idx_retailer_master_last_seen ON retailer_master(last_seen_date DESC);

-- FUTURE: Implement retailer_master_history table for change tracking
-- This would capture all updates to name/network/status with timestamps and sources
-- See documentation in sync_rsr_retailers_to_master.py for design notes
-- Schema would include:
--   id, retailer_id, change_type, previous_values, new_values, changed_at, changed_by
