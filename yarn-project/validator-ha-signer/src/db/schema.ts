/**
 * SQL schema for the validator_duties table
 *
 * This table is used for distributed locking and slashing protection across multiple validator nodes.
 * The PRIMARY KEY constraint ensures that only one node can acquire the lock for a given validator,
 * slot, and duty type combination.
 */

/**
 * Current schema version
 */
export const SCHEMA_VERSION = 1;

/**
 * SQL to create the validator_duties table
 */
export const CREATE_VALIDATOR_DUTIES_TABLE = `
CREATE TABLE IF NOT EXISTS validator_duties (
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
);
`;

/**
 * SQL to create index on status and started_at for cleanup queries
 */
export const CREATE_STATUS_INDEX = `
CREATE INDEX IF NOT EXISTS idx_validator_duties_status
ON validator_duties(status, started_at);
`;

/**
 * SQL to create index for querying duties by node
 */
export const CREATE_NODE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_validator_duties_node
ON validator_duties(node_id, started_at);
`;

/**
 * SQL to create the schema_version table for tracking migrations
 */
export const CREATE_SCHEMA_VERSION_TABLE = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

/**
 * SQL to initialize schema version
 */
export const INSERT_SCHEMA_VERSION = `
INSERT INTO schema_version (version)
VALUES ($1)
ON CONFLICT (version) DO NOTHING;
`;

/**
 * Complete schema setup - all statements in order
 */
export const SCHEMA_SETUP = [
  CREATE_SCHEMA_VERSION_TABLE,
  CREATE_VALIDATOR_DUTIES_TABLE,
  CREATE_STATUS_INDEX,
  CREATE_NODE_INDEX,
] as const;

/**
 * Query to get current schema version
 */
export const GET_SCHEMA_VERSION = `
SELECT version FROM schema_version ORDER BY version DESC LIMIT 1;
`;

/**
 * Atomic insert-or-get query.
 * Tries to insert a new duty record. If a record already exists (conflict),
 * returns the existing record instead.
 *
 * Returns the record with an `is_new` flag indicating whether we inserted or got existing.
 *
 * Note: In high concurrency scenarios, if the INSERT conflicts and another transaction
 * just committed the row, there's a small window where the SELECT might not see it yet.
 * The application layer should retry if no rows are returned.
 */
export const INSERT_OR_GET_DUTY = `
WITH inserted AS (
  INSERT INTO validator_duties (
    rollup_address,
    validator_address,
    slot,
    block_number,
    block_index_within_checkpoint,
    duty_type,
    status,
    message_hash,
    node_id,
    lock_token,
    started_at
  ) VALUES ($1, $2, $3, $4, $5, $6, 'signing', $7, $8, $9, CURRENT_TIMESTAMP)
  ON CONFLICT (rollup_address, validator_address, slot, duty_type, block_index_within_checkpoint) DO NOTHING
  RETURNING
    rollup_address,
    validator_address,
    slot,
    block_number,
    block_index_within_checkpoint,
    duty_type,
    status,
    message_hash,
    signature,
    node_id,
    lock_token,
    started_at,
    completed_at,
    error_message,
    TRUE as is_new
)
SELECT * FROM inserted
UNION ALL
SELECT
  rollup_address,
  validator_address,
  slot,
  block_number,
  block_index_within_checkpoint,
  duty_type,
  status,
  message_hash,
  signature,
  node_id,
  '' as lock_token,
  started_at,
  completed_at,
  error_message,
  FALSE as is_new
FROM validator_duties
WHERE rollup_address = $1
  AND validator_address = $2
  AND slot = $3
  AND duty_type = $6
  AND block_index_within_checkpoint = $5
  AND NOT EXISTS (SELECT 1 FROM inserted);
`;

/**
 * Query to update a duty to 'signed' status
 */
export const UPDATE_DUTY_SIGNED = `
UPDATE validator_duties
SET status = 'signed',
    signature = $1,
    completed_at = CURRENT_TIMESTAMP
WHERE rollup_address = $2
  AND validator_address = $3
  AND slot = $4
  AND duty_type = $5
  AND block_index_within_checkpoint = $6
  AND status = 'signing'
  AND lock_token = $7;
`;

/**
 * Query to delete a duty
 * Only deletes if the lockToken matches
 */
export const DELETE_DUTY = `
DELETE FROM validator_duties
WHERE rollup_address = $1
  AND validator_address = $2
  AND slot = $3
  AND duty_type = $4
  AND block_index_within_checkpoint = $5
  AND status = 'signing'
  AND lock_token = $6;
`;

/**
 * Query to clean up old signed duties (for maintenance)
 * Removes signed duties older than a specified timestamp
 */
export const CLEANUP_OLD_SIGNED_DUTIES = `
DELETE FROM validator_duties
WHERE status = 'signed'
  AND completed_at < $1;
`;

/**
 * Query to clean up old duties (for maintenance)
 * Removes SIGNED duties older than a specified age (in milliseconds)
 */
export const CLEANUP_OLD_DUTIES = `
DELETE FROM validator_duties
WHERE status = 'signed'
  AND started_at < CURRENT_TIMESTAMP - ($1 || ' milliseconds')::INTERVAL;
`;

/**
 * Query to cleanup own stuck duties
 * Removes duties in 'signing' status for a specific node that are older than maxAgeMs
 * Uses DB's CURRENT_TIMESTAMP to avoid clock skew issues between nodes
 */
export const CLEANUP_OWN_STUCK_DUTIES = `
DELETE FROM validator_duties
WHERE node_id = $1
  AND status = 'signing'
  AND started_at < CURRENT_TIMESTAMP - ($2 || ' milliseconds')::INTERVAL;
`;

/**
 * Query to cleanup duties with outdated rollup address
 * Removes all duties where the rollup address doesn't match the current one
 * Used after a rollup upgrade to clean up duties for the old rollup
 */
export const CLEANUP_OUTDATED_ROLLUP_DUTIES = `
DELETE FROM validator_duties
WHERE rollup_address != $1;
`;

/**
 * SQL to drop the validator_duties table
 */
export const DROP_VALIDATOR_DUTIES_TABLE = `DROP TABLE IF EXISTS validator_duties;`;

/**
 * SQL to drop the schema_version table
 */
export const DROP_SCHEMA_VERSION_TABLE = `DROP TABLE IF EXISTS schema_version;`;

/**
 * Query to get stuck duties (for monitoring/alerting)
 * Returns duties in 'signing' status that have been stuck for too long
 */
export const GET_STUCK_DUTIES = `
SELECT
  rollup_address,
  validator_address,
  slot,
  block_number,
  block_index_within_checkpoint,
  duty_type,
  status,
  message_hash,
  node_id,
  started_at,
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) as age_seconds
FROM validator_duties
WHERE status = 'signing'
  AND started_at < $1
ORDER BY started_at ASC;
`;
