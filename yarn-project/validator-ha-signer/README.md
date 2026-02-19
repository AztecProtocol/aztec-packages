# Validator HA Signer

Distributed locking and slashing protection for Aztec validators running in high-availability configurations.

## Features

- **Distributed Locking**: Prevents multiple validator nodes from signing the same duty
- **Slashing Protection**: Blocks attempts to sign conflicting data for the same slot
- **Automatic Retry**: Failed signing attempts are cleared, allowing other nodes to retry
- **PostgreSQL Backend**: Shared database for coordination across nodes

## Integration with Validator Client

The HA signer is automatically integrated into the validator client when `VALIDATOR_HA_SIGNING_ENABLED=true` is set. The validator client will:

1. Create the HA signer using `createHASigner()` from the factory
2. Wrap the base keystore with `HAKeyStore` to provide HA-protected signing
3. Automatically start/stop the signer lifecycle

No manual integration is required when using the validator client.

## Manual Usage

For advanced use cases or testing, you can use the HA signer directly. **Note**: Database migrations must be run separately before creating the signer (see [Database Migrations](#database-migrations) below).

### Basic Usage

```bash
# 1. Run migrations separately (once per deployment)
aztec migrate-ha-db up --database-url postgresql://user:pass@host:port/db
```

```typescript
// 2. Create signer (migrations already applied)
import { createHASigner } from '@aztec/validator-ha-signer/factory';

const { signer, db } = await createHASigner({
  databaseUrl: process.env.DATABASE_URL,
  haSigningEnabled: true,
  nodeId: 'validator-node-1',
  pollingIntervalMs: 100,
  signingTimeoutMs: 3000,
});

// Start background cleanup tasks
signer.start();

// Sign with protection
const signature = await signer.signWithProtection(
  validatorAddress,
  messageHash,
  { slot: 100n, blockNumber: 50n, blockIndexWithinCheckpoint: 0, dutyType: 'BLOCK_PROPOSAL' },
  async root => localSigner.signMessage(root),
);

// On shutdown
await signer.stop();
await db.close();
```

### Advanced: Custom Connection Pool

If you need custom pool configuration (e.g., max connections, idle timeout) or want to share a connection pool across multiple components:

> **Note**: You still need to run migrations separately before using this approach.
> See [Database Migrations](#database-migrations) below.

```typescript
import { PostgresSlashingProtectionDatabase } from '@aztec/validator-ha-signer/db';
import { ValidatorHASigner } from '@aztec/validator-ha-signer/validator-ha-signer';

import { Pool } from 'pg';

// Custom pool configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum connections
  idleTimeoutMillis: 30000,
});
const db = new PostgresSlashingProtectionDatabase(pool);
await db.initialize();

const signer = new ValidatorHASigner(db, {
  haSigningEnabled: true,
  nodeId: 'validator-node-1',
  pollingIntervalMs: 100,
  signingTimeoutMs: 3000,
  maxStuckDutiesAgeMs: 144000,
});

// Start background cleanup tasks
signer.start();

// On shutdown
await signer.stop();
await pool.end(); // You manage the pool lifecycle
```

## Configuration

Set via environment variables or config object:

- `VALIDATOR_HA_DATABASE_URL`: PostgreSQL connection string (e.g., `postgresql://user:pass@host:port/db`)
- `VALIDATOR_HA_SIGNING_ENABLED`: Whether HA signing / slashing protection is enabled (default: false)
- `VALIDATOR_HA_NODE_ID`: Unique identifier for this validator node (required when enabled)
- `VALIDATOR_HA_POLLING_INTERVAL_MS`: How often to check duty status (default: 100)
- `VALIDATOR_HA_SIGNING_TIMEOUT_MS`: Max wait for in-progress signing (default: 3000)
- `VALIDATOR_HA_MAX_STUCK_DUTIES_AGE_MS`: Max age of stuck duties before cleanup (default: 2 \* aztecSlotDuration)
- `VALIDATOR_HA_POOL_MAX`: Maximum number of connections in the pool (default: 10)
- `VALIDATOR_HA_POOL_MIN`: Minimum number of connections in the pool (default: 0)
- `VALIDATOR_HA_POOL_IDLE_TIMEOUT_MS`: Idle timeout for pool connections (default: 10000)
- `VALIDATOR_HA_POOL_CONNECTION_TIMEOUT_MS`: Connection timeout (default: 0, no timeout)

## Database Migrations

This package uses `node-pg-migrate` for database schema management.

### Migration Commands

```bash
# Run pending migrations
aztec migrate-ha-db up --database-url postgresql://...

# Rollback last migration
aztec migrate-ha-db down --database-url postgresql://...
```

### Creating New Migrations

```bash
# Generate a new migration file
npx node-pg-migrate create my-migration-name
```

### Production Deployment

Run migrations before starting your application:

```yaml
# Kubernetes example
apiVersion: batch/v1
kind: Job
metadata:
  name: validator-db-migrate
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: aztecprotocol/aztec:<image_tag>
          command: ['node', '--no-warnings', '/usr/src/yarn-project/aztec/dest/bin/index.js', 'migrate-ha-db', 'up']
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: url
      restartPolicy: OnFailure
```

## How It Works

When multiple validator nodes attempt to sign:

1. First node acquires lock and signs
2. Other nodes receive `DutyAlreadySignedError` (expected)
3. If different data detected: `SlashingProtectionError` (prevents slashing)
4. Failed attempts are auto-cleaned, allowing retry

### Signing Context

All signing operations require a `SigningContext` that includes:

- `slot`: The slot number
- `blockNumber`: The block number within the checkpoint
- `blockIndexWithinCheckpoint`: The index of the block within the checkpoint (use `-1` for N/A contexts)
- `dutyType`: The type of duty (e.g., `BLOCK_PROPOSAL`, `CHECKPOINT_ATTESTATION`, `AUTH_REQUEST`)

Note: `AUTH_REQUEST` duties bypass HA protection since signing multiple times is safe for authentication requests.

## Important Limitations

### Database Isolation Per Rollup Version

**You cannot use the same database to provide slashing protection for validator nodes running on different rollup versions** (e.g., current rollup and old rollup simultaneously).

When the HA signer performs background cleanup via `cleanupOutdatedRollupDuties()`, it removes all duties where the rollup address doesn't match the current rollup address. If two validators running on different rollup versions share the same database, they will delete each other's duties during cleanup.

**Solution**: Use separate databases for validators running on different rollup versions. Each rollup version requires its own isolated slashing protection database.

## Development

```bash
yarn build    # Build package
yarn test     # Run tests
yarn clean    # Clean build artifacts
```
