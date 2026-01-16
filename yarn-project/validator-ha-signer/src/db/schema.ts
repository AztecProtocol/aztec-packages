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
  validator_address VARCHAR(42) NOT NULL,
  slot BIGINT NOT NULL,
  block_number BIGINT NOT NULL,
  duty_type VARCHAR(30) NOT NULL CHECK (duty_type IN ('BLOCK_PROPOSAL', 'ATTESTATION', 'ATTESTATIONS_AND_SIGNERS')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('signing', 'signed', 'failed')),
  message_hash VARCHAR(66) NOT NULL,
  signature VARCHAR(132),
  node_id VARCHAR(255) NOT NULL,
  lock_token VARCHAR(64) NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,

  PRIMARY KEY (validator_address, slot, duty_type),
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
 */
export const INSERT_OR_GET_DUTY = `
WITH inserted AS (
  INSERT INTO validator_duties (
    validator_address,
    slot,
    block_number,
    duty_type,
    status,
    message_hash,
    node_id,
    lock_token,
    started_at
  ) VALUES ($1, $2, $3, $4, 'signing', $5, $6, $7, CURRENT_TIMESTAMP)
  ON CONFLICT (validator_address, slot, duty_type) DO NOTHING
  RETURNING
    validator_address,
    slot,
    block_number,
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
  validator_address,
  slot,
  block_number,
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
WHERE validator_address = $1
  AND slot = $2
  AND duty_type = $4
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
WHERE validator_address = $2
  AND slot = $3
  AND duty_type = $4
  AND status = 'signing'
  AND lock_token = $5;
`;

/**
 * Query to delete a duty
 * Only deletes if the lockToken matches
 */
export const DELETE_DUTY = `
DELETE FROM validator_duties
WHERE validator_address = $1
  AND slot = $2
  AND duty_type = $3
  AND status = 'signing'
  AND lock_token = $4;
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
 * Removes duties older than a specified timestamp
 */
export const CLEANUP_OLD_DUTIES = `
DELETE FROM validator_duties
WHERE status IN ('signing', 'signed', 'failed')
  AND started_at < $1;
`;

/**
 * Query to cleanup own stuck duties
 * Removes duties in 'signing' status for a specific node that are older than maxAgeMs
 */
export const CLEANUP_OWN_STUCK_DUTIES = `
DELETE FROM validator_duties
WHERE node_id = $1
  AND status = 'signing'
  AND started_at < $2;
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
  validator_address,
  slot,
  block_number,
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
