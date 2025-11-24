---
id: high_availability_sequencers
sidebar_position: 3
title: High Availability Sequencers
description: Learn how to run highly available sequencers across multiple nodes for redundancy and improved reliability.
---

## Overview

This guide shows you how to set up high availability (HA) for your sequencer by running the same sequencer identity across multiple physical nodes. This configuration provides redundancy and resilience, ensuring your sequencer continues operating even if individual nodes fail.

**What is High Availability for sequencers?**

High availability means running multiple sequencer nodes that share the same attester identity but use different publisher addresses. This allows your sequencer to:
- Continue attesting even if one node goes offline
- Maintain uptime during maintenance windows and upgrades
- Protect against infrastructure failures
- Ensure you don't miss attestation duties

## Prerequisites

Before setting up HA sequencers, ensure you have:

- Experience running a single sequencer node (see the [Sequencer Management guide](../setup/sequencer_management.md))
- Understanding of basic keystore structure and configuration
- Access to multiple servers or VMs for running separate nodes
- Ability to securely distribute keys across infrastructure

## Why High Availability?

### Benefits of HA Configuration

**1. Redundancy and Fault Tolerance**

If one node crashes, experiences network issues, or needs maintenance, the other nodes continue operating. You won't miss attestations or proposals during:
- Hardware failures
- Network outages
- Planned maintenance
- Software upgrades
- Infrastructure provider issues

**2. Improved Uptime**

With properly configured HA, your sequencer can achieve near-perfect uptime. You can perform rolling upgrades, switching nodes in and out of service without missing duties.

### The Core Concept

In an HA setup:
- **Attester identity is shared** across all nodes (same private key)
- **Publisher identity is unique** per node (different private keys)
- All nodes run simultaneously and can attest independently
- Only one proposal is accepted per slot (enforced by L1)

## Setting Up High Availability Sequencers

### Infrastructure Requirements

**Minimum HA Setup (2 nodes):**
- 2 separate servers/VMs
- Each meeting the [minimum sequencer requirements](./sequencer_management.md#minimum-hardware-requirements)
- Different physical locations or availability zones (recommended)
- Reliable network connectivity for both nodes
- Access to the same L1 infrastructure (or separate L1 endpoints)

**Recommended HA Setup (3+ nodes):**
- 3 or more servers/VMs for better fault tolerance
- Distributed across multiple data centers or cloud regions
- Redundant L1 infrastructure per node
- Monitoring and alerting for all nodes

### Key Management

You'll need to generate:

1. **One shared attester key** - Your sequencer's identity (used by all nodes)
2. **One unique publisher key per node** - For submitting proposals
3. **Secure distribution method** - For safely deploying the shared attester key

:::warning Secure Key Distribution
The shared attester key must be distributed securely to all nodes. Consider using remote signers with:
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
  --mnemonic "your shared mnemonic phrase for key derivation" \
  --address-index 0 \
  --publisher-count 3 \
  --data-dir ~/ha-keys-temp
```

This command generates:
- **One attester** with both ETH and BLS keys (at derivation index 0)
- **Three publisher keys** (at derivation indices 1, 2, and 3)
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

Each publisher account needs ETH to pay for L1 gas when submitting proposals. You must maintain at least **0.1 ETH** in each publisher account to avoid slashing.

**Get Sepolia ETH from faucets:**

- [Sepolia Faucet](https://sepoliafaucet.com/)
- [Infura Sepolia Faucet](https://www.infura.io/faucet/sepolia)
- [Alchemy Sepolia Faucet](https://sepoliafaucet.com/)

**Check publisher balances:**

```bash
# Check balance for Publisher 1
cast balance [PUBLISHER_1_ADDRESS] --rpc-url [YOUR_RPC_URL]

# Check balance for Publisher 2
cast balance [PUBLISHER_2_ADDRESS] --rpc-url [YOUR_RPC_URL]
```

**Example:**
```bash
cast balance 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb --rpc-url https://sepolia.infura.io/v3/YOUR_API_KEY
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
        "eth": "0xABC...123",  // Shared attester ETH key
        "bls": "0xDEF...456"   // Shared attester BLS key
      },
      "publisher": [
        "0x111...AAA",  // Publisher 1 (for Node 1)
        "0x222...BBB",  // Publisher 2 (for Node 2)
        "0x333...CCC"   // Publisher 3 (for Node 3)
      ],
      "feeRecipient": "0xYOUR_FEE_RECIPIENT"
    }
  ]
}
```

You'll use:
- The **same attester keys** (both ETH and BLS) on all nodes
- A **different publisher key** for each node

### Step 4: Create Node-Specific Keystores

Create a separate keystore file for each node, using the same attester but different publishers:

**Node 1 Keystore** (`~/node1/keys/keystore.json`):

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0xABC...123",  // Same attester ETH key
        "bls": "0xDEF...456"   // Same attester BLS key
      },
      "publisher": "0x111...AAA",  // Publisher 1 only
      "feeRecipient": "0xYOUR_FEE_RECIPIENT"
    }
  ]
}
```

**Node 2 Keystore** (`~/node2/keys/keystore.json`):

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0xABC...123",  // Same attester ETH key
        "bls": "0xDEF...456"   // Same attester BLS key
      },
      "publisher": "0x222...BBB",  // Publisher 2 only
      "feeRecipient": "0xYOUR_FEE_RECIPIENT"
    }
  ]
}
```

**Node 3 Keystore** (`~/node3/keys/keystore.json`):

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0xABC...123",  // Same attester ETH key
        "bls": "0xDEF...456"   // Same attester BLS key
      },
      "publisher": "0x333...CCC",  // Publisher 3 only
      "feeRecipient": "0xYOUR_FEE_RECIPIENT"
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
scp ~/node3/keys/keystore.json user@node3-server:~/aztec/keys/
```

Ensure proper file permissions on each node:

```bash
chmod 600 ~/aztec/keys/keystore.json
```

### Step 6: Start All Nodes

Start each node (assuming you are using Docker Compose):

```bash
# On each server
docker compose up -d
```

Ensure all nodes are configured with:
- The same network (`--network testnet`)
- Proper L1 endpoints
- Correct P2P configuration
- Adequate resources

## Verification and Monitoring

### Verify Your HA Setup

**1. Check that all nodes are running:**

```bash
# On each server
curl http://localhost:8080/status

# Or for Docker
docker compose logs -f aztec-sequencer
```

**2. Confirm nodes recognize the shared attester:**

Check logs for messages indicating the attester address is loaded correctly. All nodes should show the same attester address.

**3. Verify different publishers:**

Each node's logs should show a different publisher address being used for submitting transactions.

**4. Monitor attestations:**

Watch L1 for attestations from your sequencer's attester address. You should see attestations being submitted even if individual nodes go offline.

### Testing Failover

To verify HA is working correctly:

1. **Monitor baseline**: Note the attestation rate with all nodes running
2. **Stop one node**: `docker compose down` on one server
3. **Verify continuity**: Check that attestations continue from the remaining nodes
4. **Check logs**: Remaining nodes should show normal operation
5. **Restart the stopped node**: Verify it rejoins seamlessly

If attestations stop when you stop one node, your HA configuration is not working correctly.

## Operational Best Practices

### Load Balancing L1 Access

If possible, configure each node with its own L1 infrastructure:

- **Node 1**: L1 endpoints in Region A
- **Node 2**: L1 endpoints in Region B
- **Node 3**: L1 endpoints in Region C

This protects against L1 provider outages affecting all your nodes simultaneously.

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
- Verify monitoring and alerting
- Practice recovery procedures
- Test rolling upgrades

## Troubleshooting

### All Nodes Stopped Attesting

**Issue**: No attestations from any node.

**Solutions**:
- Verify all nodes aren't simultaneously offline
- Check L1 connectivity from each node
- Verify the shared attester key is correct in all keystores
- Check that the sequencer is still registered and active on L1
- Review logs for errors on all nodes

### Duplicate Proposals Appearing

**Issue**: Seeing multiple proposals for the same slot from your sequencer.

**Solutions**:
- Verify each node has a unique publisher key
- Check that publisher keys aren't duplicated across keystores
- Ensure nodes aren't sharing the same keystore file
- Review keystore configuration on each node

### One Node Not Contributing

**Issue**: One node running but not attesting/proposing.

**Solutions**:
- Check that node's sync status
- Verify keystore is loaded correctly
- Check network connectivity to L1
- Review logs for specific errors
- Confirm publisher account has sufficient ETH

### Keystore Loading Failures

**Issue**: Node fails to load the keystore.

**Solutions**:
- Verify keystore.json syntax is valid
- Check file permissions (readable by the node process)
- Ensure the keystore path is correct
- Validate all private keys are properly formatted
- Review the [Keystore Troubleshooting guide](../operation/keystore/troubleshooting.md)

## Related Guides

:::tip Running Multiple Sequencers Per Node
Want to run multiple sequencer identities on a **single node** instead? See the [Advanced Keystore Patterns guide](../operation/keystore/advanced_patterns.md#multiple-validators)—that's a different use case from HA.
:::

## Next Steps

- Review the [Advanced Keystore Patterns guide](../operation/keystore/advanced_patterns.md) for multiple sequencers per node
- Set up [monitoring and observability](../operation/monitoring.md) for your HA infrastructure
- Learn about [governance participation](../operation/sequencer_management/creating_and_voting_on_proposals.md) as a sequencer
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support and best practices
