---
id: high_availability_sequencers
displayed_sidebar: operatorsSidebar
title: High Availability Sequencers
description: Learn how to run highly available sequencers across multiple nodes with database-backed coordination to prevent double-signing and ensure redundancy.
---

## Overview

This guide shows you how to set up high availability (HA) for your sequencer by running the same sequencer identity across multiple physical nodes with automatic coordination via a shared database. This configuration provides redundancy and resilience, ensuring your sequencer continues operating even if individual nodes fail.

**What is High Availability for sequencers?**

High availability means running multiple sequencer nodes that share the same attester identity but use different publisher addresses. The nodes coordinate through a shared PostgreSQL database to prevent double-signing across all validator duties. This allows your sequencer to:

- Continue performing validator duties even if one node goes offline
- Maintain uptime during maintenance windows and upgrades
- Protect against infrastructure failures
- Ensure you don't miss any validator duties
- Automatically prevent double-signing & slashable actions through distributed locking

## Prerequisites

Before setting up HA sequencers, ensure you have:

- Experience running a single sequencer node (see the [Sequencer Setup guide](./sequencer-setup.md))
- Understanding of basic keystore structure and configuration
- Access to multiple servers or VMs for running separate nodes
- Ability to securely distribute keys across infrastructure
- A PostgreSQL database accessible by all HA nodes (for coordination and slashing protection)

## How HA Signing Works

The HA signer uses a shared PostgreSQL database to coordinate signing across multiple nodes, preventing double-signing through distributed locking:

1. **Distributed Locking**: When a node needs to sign a duty (block proposal, checkpoint proposal, checkpoint attestation, governance vote, etc.), it first attempts to acquire a lock in the database for that specific duty (validator + slot + duty type) (+ block index within checkpoint for block proposals).

2. **First Node Wins**: The first node to acquire the lock proceeds with signing. Other nodes receive a `DutyAlreadySignedError`, which is expected and normal in HA setups.

3. **Slashing Protection**: If a node attempts to sign different data for the same duty, the database detects this and throws a `SlashingProtectionError`, preventing slashing conditions.

4. **Automatic Retry**: If a node fails mid-signing (crashes, network issue), the lock is automatically cleaned up after a timeout, allowing other nodes to retry.

5. **Background Cleanup**: The HA signer runs background tasks to clean up stuck duties (duties that were locked but never completed), ensuring the system remains healthy.

This coordination happens automatically when `VALIDATOR_HA_SIGNING_ENABLED=true` - no manual intervention is required.

:::warning Limitation: Post-Signature Failures
If a node successfully signs a duty but fails **after** signing (before broadcasting the signature to the network), the duty will be missed. HA signing cannot help in this scenario because the duty is already marked as "signed" in the database, preventing other nodes from retrying. This is why it's still important to have reliable infrastructure even with HA enabled - HA protects against double-signing, not against all failure modes.
:::

## What Duties Are Protected?

The HA signing system provides double-signing protection for all validator duties:

### Block Production Duties

1. **Block Proposals**: Individual block proposals built during your assigned slot. Each slot may contain multiple blocks, and each block proposal is tracked separately with its `blockIndexWithinCheckpoint` (0, 1, 2...).

2. **Checkpoint Proposals**: The aggregated proposal submitted at the end of a slot that bundles all blocks from that slot. This is what gets submitted to L1 along with attestations.

3. **Checkpoint Attestations**: Your validator's signature attesting to a checkpoint proposal. Validators attest to checkpoints after validating all blocks in a slot. This is the primary consensus mechanism.

4. **Attestations and Signers**: Extended attestation format that includes additional signer information for consensus coordination.

### Governance Duties

5. **Governance Votes**: Signatures on governance proposals for protocol upgrades and parameter changes. HA protection ensures you don't accidentally vote twice on the same proposal.

6. **Slashing Votes**: Signatures on votes to slash misbehaving validators. Critical for validator accountability without risking self-slashing from duplicate votes.

## Why High Availability?

### Benefits of HA Configuration

**1. Redundancy and Fault Tolerance**

If one node crashes, experiences network issues, or needs maintenance, the other node continues operating. You won't miss any validator duties during:

- Hardware failures
- Network outages
- Planned maintenance
- Software upgrades
- Infrastructure provider issues

**2. Improved Uptime**

With properly configured HA, your sequencer can achieve near-perfect uptime. You can perform rolling upgrades, switching nodes in and out of service without missing duties.

### The Core Concept

In an HA setup:

- **Attester identity is shared** across both nodes (same private key)
- **Publisher identity is unique** per node (different private keys)
- **Shared database coordinates signing** - prevents double-signing through distributed locking
- Both nodes run simultaneously and attempt to sign duties
- **First node wins** - the database ensures only one node signs each duty
- **Automatic failover** - if one node fails mid-signing, the other can retry
- Only one proposal is accepted per slot (enforced by L1)

The validator client automatically integrates with the HA signer when enabled, providing distributed locking and slashing protection without manual coordination.

## Setting Up High Availability Sequencers

### Infrastructure Requirements

**HA Setup (2 nodes):**

- 2 separate servers/VMs
- Each meeting the minimum sequencer requirements (see [Sequencer Setup](./sequencer-setup.md))
- Different physical locations or availability zones (recommended)
- Reliable network connectivity for both nodes
- Access to the same L1 infrastructure (or separate L1 endpoints)
- **PostgreSQL database** accessible by all nodes (for coordination)
- Monitoring and alerting for both nodes

**Database Requirements:**

- PostgreSQL 12 or later
- Network access from all validator nodes
- Sufficient connection pool capacity (default: 10 connections per node)
- Regular backups recommended for production

### Key Management

You'll need to generate:

1. **One shared attester key** - Your sequencer's identity (used by both nodes)
2. **One unique publisher key per node** - For submitting proposals
3. **Secure distribution method** - For safely deploying the shared attester key

:::warning Secure Key Distribution
The shared attester key must be distributed securely to both nodes. Consider using remote signers with:

- Encrypted secrets management (HashiCorp Vault, AWS Secrets Manager, etc.)
- Hardware security modules (HSMs) for production deployments

Never transmit private keys over unencrypted channels or store them in version control.
:::

### Step 1: Generate Keys

Generate a base keystore with multiple publishers using the Aztec CLI. This will create one attester identity with multiple publisher keys that can be distributed across your nodes.

```bash
# Generate base keystore with one attester and 3 publishers
aztec validator-keys new \
  --fee-recipient [YOUR_AZTEC_FEE_RECIPIENT_ADDRESS] \
  --gse-address 0xb6a38a51a6c1de9012f9d8ea9745ef957212eaac \
  --l1-rpc-urls $ETH_RPC \
  --mnemonic "your shared mnemonic phrase for key derivation" \
  --address-index 0 \
  --publisher-count 3 \
  --data-dir ~/ha-keys-temp
```


This command generates:

- **One attester** with both ETH and BLS keys (at derivation index 0)
- **Two publisher keys** (at derivation indices 1 and 2)
- All keys saved to `~/ha-keys-temp/key1.json`

The output will show the complete keystore JSON with all generated keys. **Save this output securely** as you'll need to extract keys from it for each node.

:::tip Managing Your Mnemonic
Store your mnemonic phrase securely in a password manager or hardware wallet. You'll need it to:

- Regenerate keys if lost
- Add more publishers later
- Recover your sequencer setup

Never commit mnemonics to version control or share them over insecure channels.
:::

### Step 2: Fund Publisher Accounts

Each publisher account needs ETH to pay for L1 gas when submitting proposals. You must maintain at least **0.1 ETH** in each publisher account.

**Get Sepolia ETH from faucets:**

- [Sepolia Faucet](https://sepoliafaucet.com/)
- [Infura Sepolia Faucet](https://www.infura.io/faucet/sepolia)
- [Alchemy Sepolia Faucet](https://sepoliafaucet.com/)

**Check publisher balances:**

```bash
# Check balance for Publisher 1
cast balance [PUBLISHER_1_ADDRESS] --rpc-url $ETH_RPC

# Check balance for Publisher 2
cast balance [PUBLISHER_2_ADDRESS] --rpc-url $ETH_RPC
```

**Example:**

```bash
cast balance 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb --rpc-url $ETH_RPC
# Output: 100000000000000000 (0.1 ETH in wei)
```

:::warning Balance Monitoring
Monitor these balances regularly to ensure they don't drop below 0.1 ETH. Falling below this threshold risks slashing. Consider setting up automated alerts when balances drop below 0.15 ETH.
:::

### Step 3: Extract Keys from Generated Keystore

Open the generated keystore file (`~/ha-keys-temp/key1.json`) and extract the keys. The file will look something like this:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0xABC...123", // Shared attester ETH key
        "bls": "0xDEF...456" // Shared attester BLS key
      },
      "publisher": [
        "0x111...AAA", // Publisher 1 (for Node 1)
        "0x222...BBB" // Publisher 2 (for Node 2)
      ],
      "feeRecipient": "0x0000000000000000000000000000000000000000000000000000000000000000"
    }
  ]
}
```

You'll use:

- The **same attester keys** (both ETH and BLS) on both nodes
- A **different publisher key** for each node

### Step 4: Create Node-Specific Keystores

Create a separate keystore file for each node, using the same attester but different publishers:

**Node 1 Keystore** (`~/node1/keys/keystore.json`):

Use the same attester ETH and BLS keys, but only Publisher 1:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0xABC...123",
        "bls": "0xDEF...456"
      },
      "publisher": ["0x111...AAA"],
      "feeRecipient": "0x0000000000000000000000000000000000000000000000000000000000000000"
    }
  ]
}
```

**Node 2 Keystore** (`~/node2/keys/keystore.json`):

Use the same attester ETH and BLS keys, but only Publisher 2:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0xABC...123",
        "bls": "0xDEF...456"
      },
      "publisher": ["0x222...BBB"],
      "feeRecipient": "0x0000000000000000000000000000000000000000000000000000000000000000"
    }
  ]
}
```

:::warning Security Best Practice
After creating node-specific keystores, **securely delete** the base keystore file (`~/ha-keys-temp/key1.json`) that contains all publishers together. Each node should only have access to its own publisher key.
:::

### Step 5: Deploy Keystores to Nodes

Securely transfer each keystore to its respective node:

```bash
# Example: Copy keystores to remote nodes via SCP
scp ~/node1/keys/keystore.json user@node1-server:~/aztec/keys/
scp ~/node2/keys/keystore.json user@node2-server:~/aztec/keys/
```

Ensure proper file permissions on each node:

```bash
chmod 600 ~/aztec/keys/keystore.json
```

### Step 6: Set Up the HA Database

Before starting your nodes, you need a PostgreSQL database that all HA nodes can access for coordination.

**1. Provision a PostgreSQL database:**

For production HA setups, we recommend using a managed database service with built-in high availability:

- **AWS RDS PostgreSQL** with Multi-AZ for automatic failover
- **Google Cloud SQL for PostgreSQL** with high availability configuration
- **Azure Database for PostgreSQL** with zone redundancy
- **Self-hosted PostgreSQL** with streaming replication and automatic failover (if you manage your own infrastructure)

:::danger Critical: All Nodes Must Connect to the Same Primary Database
The HA signing system relies on atomic database operations for distributed locking. **All validator nodes MUST connect to the SAME PRIMARY database instance**. The configurations above are safe because they use automatic failover to a single primary.

**DO NOT use:**

- Read replicas (replication lag breaks consistency)
- Multi-master or active-active configurations (breaks distributed locking)
- Different database instances per node (defeats the purpose of HA coordination)

All validator nodes must use the same database connection string that points to the current primary.
:::

The key requirements are:

- PostgreSQL 12 or later
- **Single primary database** that all validator nodes connect to
- Network accessible from all validator nodes
- Sufficient connection pool capacity (default: 10 connections per node)
- A database created for the HA signer (e.g., `validator_ha`)
- Automatic failover is good (keeps high availability), but only one primary at a time

**Example using psql** (if manually creating the database):

```bash
# Connect to your PostgreSQL instance
psql -h your-db-host -U postgres

# Create the database
CREATE DATABASE validator_ha;

# Exit psql
\q
```

**2. Run database migrations:**

The HA signer uses database migrations to set up the required tables. Run migrations **once** before starting your nodes:

```bash
aztec migrate-ha-db up \
  --database-url postgresql://user:password@host:port/validator_ha
```

:::tip Migration Safety
Migrations are idempotent and safe to run concurrently, but for cleaner logs, run them once before starting nodes. You can also run migrations from an init container or separate migration job in Kubernetes.
:::

**3. Verify the database setup:**

Check that the required tables were created:

```bash
# Using psql
psql postgresql://user:password@host:port/validator_ha -c "\dt"

# Or using your cloud provider's database console
```

You should see tables like `validator_duties`, `schema_version` and `pmigrations`.

### Step 7: Configure HA Signing

Configure each node with HA signing enabled. Set these environment variables on **each node**:

```bash
# Enable HA signing
export VALIDATOR_HA_SIGNING_ENABLED=true

# PostgreSQL connection string (same database for all nodes)
export VALIDATOR_HA_DATABASE_URL=postgresql://user:password@host:port/validator_ha

# Unique node identifier (different for each node)
export VALIDATOR_HA_NODE_ID=validator-node-1  # Use validator-node-2 for second node

# Optional: Tune polling and timeout settings
export VALIDATOR_HA_POLLING_INTERVAL_MS=100      # Default: 100ms
export VALIDATOR_HA_SIGNING_TIMEOUT_MS=3000      # Default: 3000ms
```

**Required Environment Variables:**

| Variable                       | Description                                | Example                               |
| ------------------------------ | ------------------------------------------ | ------------------------------------- |
| `VALIDATOR_HA_SIGNING_ENABLED` | Enable HA signing (required)               | `true`                                |
| `VALIDATOR_HA_DATABASE_URL`    | PostgreSQL connection string (required)    | `postgresql://user:pass@host:5432/db` |
| `VALIDATOR_HA_NODE_ID`         | Unique identifier for this node (required) | `validator-node-1`                    |

**Optional Tuning Variables:**

| Variable                               | Description                                      | Default            |
| -------------------------------------- | ------------------------------------------------ | ------------------ |
| `VALIDATOR_HA_POLLING_INTERVAL_MS`     | How often to check duty status                   | `100`              |
| `VALIDATOR_HA_SIGNING_TIMEOUT_MS`      | Max wait for in-progress signing                 | `3000`             |
| `VALIDATOR_HA_MAX_STUCK_DUTIES_AGE_MS` | Max age before cleanup                           | `2 * slotDuration` |
| `VALIDATOR_HA_POOL_MAX`                | Max database connections                         | `10`               |
| `VALIDATOR_HA_POOL_MIN`                | Min database connections                         | `0`                |
| `VALIDATOR_HA_OLD_DUTIES_MAX_AGE_H`    | Clean up old signed duties after this many hours | N/A                |


When `VALIDATOR_HA_SIGNING_ENABLED=true`, the validator client automatically:

- Creates an HA signer using the provided configuration
- Wraps the base keystore with `HAKeyStore` for HA-protected signing
- Coordinates signing across nodes via PostgreSQL to prevent double-signing
- Provides slashing protection to block conflicting signatures

### Step 8: Start All Nodes

Start each node (assuming you are using Docker Compose):

```bash
# On each server
docker compose up -d
```

Ensure both nodes are configured with:

- The same network (`--network testnet`)
- Proper L1 endpoints
- Correct P2P configuration
- **HA signing enabled** with the same database URL
- **Unique node IDs** for each node
- Adequate resources

## Verification and Monitoring

### Verify Your HA Setup

**1. Check that both nodes are running:**

```bash
# On each server
curl http://localhost:8080/status

# Or for Docker
docker compose logs -f aztec-sequencer
```

**2. Confirm nodes recognize the shared attester:**

Check logs for messages indicating the attester address is loaded correctly. Both nodes should show the same attester address.

**3. Verify HA signer is active:**

Look for log messages indicating HA signer initialization:

```
HAKeyStore initialized { nodeId: 'validator-node-1' }
```

**4. Verify different publishers:**

Each node's logs should show a different publisher address being used for submitting transactions.

**5. Monitor attestations:**

Watch L1 for attestations from your sequencer's attester address. You should see attestations being submitted even if one node goes offline.

**6. Check database coordination:**

Query the database to see which node signed recent duties:

```sql
SELECT
  validator_address,
  slot,
  duty_type,
  node_id,
  status,
  started_at
FROM validator_duties
ORDER BY started_at DESC
LIMIT 10;
```

You should see duties distributed across both nodes, with only one node signing each duty.

**7. Check duty type distribution:**

View the distribution of different duty types across your nodes:

```sql
SELECT
  duty_type,
  node_id,
  COUNT(*) as duty_count,
  COUNT(CASE WHEN status = 'signed' THEN 1 END) as signed_count
FROM validator_duties
WHERE started_at > NOW() - INTERVAL '1 hour'
GROUP BY duty_type, node_id
ORDER BY duty_type, node_id;
```

This helps verify that both nodes are handling all types of validator duties (block proposals, checkpoint proposals, attestations, votes, etc.).

### Testing Failover

To verify HA is working correctly:

1. **Monitor baseline**: Note the duty completion rate with both nodes running
2. **Check database**: Verify both nodes are signing duties (query `validator_duties` table)
3. **Stop one node**: `docker compose down` on one server
4. **Verify continuity**: Check that the remaining node continues handling all validator duties
5. **Check logs**: The remaining node should show normal operation without errors
6. **Monitor database**: The remaining node should continue signing all duty types
7. **Restart the stopped node**: Verify it rejoins seamlessly and resumes signing

If validator duties stop when you stop one node, check:

- Database connectivity from the remaining node
- HA signing is enabled (`VALIDATOR_HA_SIGNING_ENABLED=true`)
- Node ID is correctly configured
- Database migrations were run successfully

## Operational Best Practices

### Load Balancing L1 Access

If possible, configure each node with its own L1 infrastructure:

- **Node 1**: L1 endpoints in Region A
- **Node 2**: L1 endpoints in Region B

This protects against L1 provider outages affecting both nodes simultaneously.

### Geographic Distribution

For maximum resilience, distribute nodes across:

- Multiple data centers
- Different cloud providers
- Different geographic regions
- Different network availability zones

This protects against regional failures, provider outages, and network issues.

### Regular Testing

Periodically test your HA setup:

- Simulate node failures (stop nodes intentionally)
- Test network partitions (firewall rules)
- Test database connectivity issues (temporarily block database access)
- Verify monitoring and alerting
- Practice recovery procedures
- Test rolling upgrades
- Verify database cleanup of stuck duties

### Production Deployment Considerations

**Database High Availability:**

For production, your coordination database should also be highly available:

- Use a managed PostgreSQL service (AWS RDS, Google Cloud SQL, Azure Database) with automatic failover
- Enable automatic failover to standby replicas (single primary with hot standby)
- **Do not use read replicas** for HA signing connections (all nodes must connect to primary)
- Configure connection pooling appropriately (`VALIDATOR_HA_POOL_MAX`)
- Monitor database performance and connection counts
- Set up database backups and point-in-time recovery
- Ensure all validator nodes use the same connection string pointing to the primary

**Migration Strategy:**

Run database migrations before deploying new validator nodes:

```bash
# Option 1: Run migrations in CI/CD pipeline
aztec migrate-ha-db up --database-url $VALIDATOR_HA_DATABASE_URL

# Option 2: Use Kubernetes init container (see validator-ha-signer README)
# Option 3: Use separate migration job
```

**Monitoring:**

Monitor these key metrics:

- Database connection pool usage
- Signing success/failure rates per node and per duty type
- `DutyAlreadySignedError` frequency (expected in HA)
- Database query latency
- Stuck duty cleanup frequency
- Distribution of duty types across nodes (should be relatively even over time)

## Troubleshooting

### Both Nodes Stopped Performing Duties

**Issue**: No attestations, proposals, or other validator duties from either node.

**Solutions**:

- Verify both nodes aren't simultaneously offline
- Check L1 connectivity from each node
- Verify the shared attester key is correct in both keystores
- Check that the sequencer is still registered and active on L1
- Review logs for errors on both nodes
- **Verify database connectivity** - check that both nodes can connect to PostgreSQL
- **Check HA signing is enabled** - verify `VALIDATOR_HA_SIGNING_ENABLED=true` on both nodes
- **Review database logs** - check for connection errors or timeouts
- **Query validator_duties table** - check if duties are being attempted but failing

### Database Connection Issues

**Issue**: Nodes can't connect to the database or signing fails with database errors.

**Solutions**:

- Verify database is running and accessible from both nodes
- Check network connectivity: `psql $VALIDATOR_HA_DATABASE_URL -c "SELECT 1;"`
- Verify connection string format: `postgresql://user:password@host:port/database`
- Check firewall rules allow connections from validator nodes
- Verify database credentials are correct
- Check connection pool limits (increase `VALIDATOR_HA_POOL_MAX` if needed)
- Review database logs for connection errors

### Duplicate Signatures Appearing

**Issue**: Seeing duplicate signatures for the same duty (proposals, attestations, votes) from your sequencer.

**Solutions**:

- Verify each node has a unique publisher key
- Check that publisher keys aren't duplicated across keystores
- Ensure nodes aren't sharing the same keystore file
- Review keystore configuration on each node
- **Verify HA signing is enabled** - duplicate signatures shouldn't occur with HA enabled
- **Check database configuration** - see "Incorrect Database Configuration" below
- **Check database** - query `validator_duties` to see if both nodes attempted to sign the same duty
- **Review logs** for `DutyAlreadySignedError` (expected) or `SlashingProtectionError` (indicates issue)
- **Check duty type** - different duty types (block proposals vs checkpoint proposals vs attestations) should be tracked separately

### Incorrect Database Configuration

**Issue**: Duplicate signatures despite HA being enabled, or inconsistent behavior across nodes.

**Root Cause**: Nodes may be connecting to different database instances or read replicas instead of the same primary database.

**Solutions**:

- **Verify all nodes use the same connection string** - check `VALIDATOR_HA_DATABASE_URL` on all nodes
- **Confirm connecting to primary** - ensure connection string points to the primary database, not a read replica
- **Check for multi-master setup** - multi-master or active-active database configurations will break distributed locking
- **Test database connectivity** - from each node, run:
  ```bash
  psql $VALIDATOR_HA_DATABASE_URL -c "SELECT pg_is_in_recovery();"
  ```
  Should return `f` (false) for all nodes, indicating connection to the primary
- **Review database failover events** - if using managed services, check if recent failover caused connection issues
- **Verify no load balancing to replicas** - ensure database connection pooling or load balancers don't route to read replicas

:::danger Critical
If nodes connect to different database instances or read replicas, the distributed locking will fail and you **will** double-sign, leading to slashing. All nodes must connect to the same primary database.
:::

### One Node Not Contributing

**Issue**: One node running but not performing validator duties.

**Solutions**:

- Check that node's sync status
- Verify keystore is loaded correctly
- Check network connectivity to L1
- Review logs for specific errors
- Confirm publisher account has sufficient ETH
- **Verify HA configuration** - check `VALIDATOR_HA_SIGNING_ENABLED`, `VALIDATOR_HA_DATABASE_URL`, and `VALIDATOR_HA_NODE_ID`
- **Check database** - query to see if the node is attempting to sign duties
- **Review logs for HA errors** - look for `DutyAlreadySignedError` (normal) or database connection errors
- **Verify node ID is unique** - both nodes must have different `VALIDATOR_HA_NODE_ID` values
- **Check duty distribution** - use the duty type distribution query from the verification section

### Keystore Loading Failures

**Issue**: Node fails to load the keystore.

**Solutions**:

- Verify keystore.json syntax is valid
- Check file permissions (readable by the node process)
- Ensure the keystore path is correct
- Validate all private keys are properly formatted
- Review the [Keystore Troubleshooting guide](../keystore/troubleshooting.md)

### Database Migration Issues

**Issue**: Migrations fail or nodes can't start due to missing tables.

**Solutions**:

- Verify migrations were run: `aztec migrate-ha-db up --database-url $VALIDATOR_HA_DATABASE_URL`
- Check database permissions - the user needs CREATE TABLE privileges
- Review migration logs for specific errors
- Verify database version is PostgreSQL 12 or later
- Check that the `validator_duties`, `schema_version` and `pmigrations` (created by node-pg-migrate) tables exist

## Related Guides

:::tip Running Multiple Sequencers Per Node
Want to run multiple sequencer identities on a **single node** instead? See the [Advanced Keystore Patterns guide](../keystore/advanced-patterns.md#multiple-sequencers)—that's a different use case from HA.
:::

## Next Steps

- Review the [Advanced Keystore Patterns guide](../keystore/advanced-patterns.md) for multiple sequencers per node
- Set up [monitoring and observability](../monitoring/index.md) for your HA infrastructure
- Learn about [governance participation](../sequencer-management/governance-participation.md) as a sequencer
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support and best practices
