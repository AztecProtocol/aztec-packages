# Validator HA Signer

Distributed locking and slashing protection for Aztec validators running in high-availability configurations.

## Features

- **Distributed Locking**: Prevents multiple validator nodes from signing the same duty
- **Slashing Protection**: Blocks attempts to sign conflicting data for the same slot
- **Automatic Retry**: Failed signing attempts are cleared, allowing other nodes to retry
- **PostgreSQL Backend**: Shared database for coordination across nodes

## Quick Start

### Option 1: Automatic Migrations (Simplest)

```typescript
import { createHASigner } from '@aztec/validator-ha-signer/factory';

// Migrations run automatically on startup
const { signer, db } = await createHASigner({
  databaseUrl: process.env.DATABASE_URL,
  enabled: true,
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
  { slot: 100n, blockNumber: 50n, dutyType: 'BLOCK_PROPOSAL' },
  async root => localSigner.signMessage(root),
);

// Cleanup on shutdown
await signer.stop();
await db.close();
```

### Option 2: Manual Migrations (Recommended for Production)

```bash
# 1. Run migrations separately (once per deployment)
aztec migrate-ha-db up --database-url postgresql://user:pass@host:port/db
```

```typescript
// 2. Create signer (migrations already applied)
import { createHASigner } from '@aztec/validator-ha-signer/factory';

const { signer, db } = await createHASigner({
  databaseUrl: process.env.DATABASE_URL,
  enabled: true,
  nodeId: 'validator-node-1',
  pollingIntervalMs: 100,
  signingTimeoutMs: 3000,
});

// Start background cleanup tasks
signer.start();

// On shutdown
await signer.stop();
await db.close();
```

### Advanced: Custom Connection Pool

If you need custom pool configuration (e.g., max connections, idle timeout) or want to share a connection pool across multiple components:

> **Note**: You still need to run migrations separately before using this approach.
> See [Option 2](#option-2-manual-migrations-recommended-for-production) above.

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
  enabled: true,
  nodeId: 'validator-node-1',
  pollingIntervalMs: 100,
  signingTimeoutMs: 3000,
  maxStuckDutiesAgeMs: 72000,
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
- `SLASHING_PROTECTION_ENABLED`: Whether slashing protection is enabled (default: true)
- `SLASHING_PROTECTION_NODE_ID`: Unique identifier for this validator node
- `SLASHING_PROTECTION_POLLING_INTERVAL_MS`: How often to check duty status (default: 100)
- `SLASHING_PROTECTION_SIGNING_TIMEOUT_MS`: Max wait for in-progress signing (default: 3000)
- `SLASHING_PROTECTION_MAX_STUCK_DUTIES_AGE_MS`: Max age of stuck duties before cleanup (default: 72000)

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
3. If different data detected: `SlashingProtectionError` (likely for block builder signing)
4. Failed attempts are auto-cleaned, allowing retry

## Development

```bash
yarn build    # Build package
yarn test     # Run tests
yarn clean    # Clean build artifacts
```
