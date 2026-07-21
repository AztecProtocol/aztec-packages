/**
 * Initial schema for validator HA slashing protection
 *
 * Note: this migration contains a fixed snapshot of the schema at the time it was created.
 * It must NOT import from schema.ts, which evolves over time and would cause this migration
 * to produce different results on fresh runs vs. re-runs.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

import { DROP_SCHEMA_VERSION_TABLE, DROP_VALIDATOR_DUTIES_TABLE } from '../schema.js';

// Snapshot of the initial schema — does NOT include checkpoint_number (added in migration 2).
const INITIAL_SCHEMA_SETUP = [
  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS validator_duties (
    rollup_address VARCHAR(42) NOT NULL,
    validator_address VARCHAR(42) NOT NULL,
    slot BIGINT NOT NULL,
    block_number BIGINT NOT NULL,
    block_index_within_checkpoint INTEGER NOT NULL DEFAULT 0,
    duty_type VARCHAR(30) NOT NULL CHECK (duty_type IN ('BLOCK_PROPOSAL', 'CHECKPOINT_PROPOSAL', 'ATTESTATION', 'ATTESTATIONS_AND_SIGNERS', 'GOVERNANCE_VOTE', 'SLASHING_VOTE')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('signing', 'signed')),
    message_hash VARCHAR(66) NOT NULL,
    signature VARCHAR(132),
    node_id VARCHAR(255) NOT NULL,
    lock_token VARCHAR(64) NOT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,

    PRIMARY KEY (rollup_address, validator_address, slot, duty_type, block_index_within_checkpoint),
    CHECK (completed_at IS NULL OR completed_at >= started_at)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_validator_duties_status ON validator_duties(status, started_at);`,
  `CREATE INDEX IF NOT EXISTS idx_validator_duties_node ON validator_duties(node_id, started_at);`,
] as const;

export function up(pgm: MigrationBuilder): void {
  for (const statement of INITIAL_SCHEMA_SETUP) {
    pgm.sql(statement);
  }

  // Insert initial schema version
  pgm.sql(`
    INSERT INTO schema_version (version)
    VALUES (1)
    ON CONFLICT (version) DO NOTHING;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(DROP_VALIDATOR_DUTIES_TABLE);
  pgm.sql(DROP_SCHEMA_VERSION_TABLE);
}
