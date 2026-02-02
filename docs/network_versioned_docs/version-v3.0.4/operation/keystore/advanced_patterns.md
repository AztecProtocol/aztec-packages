---
title: Sample configuration patterns
description: Learn about advanced keystore patterns including multiple publishers, multiple sequencers, and infrastructure provider scenarios.
---

## Overview

This guide covers advanced keystore configuration patterns for complex deployments, including multi-publisher setups, running multiple sequencers, and infrastructure provider scenarios.

## Multiple publishers

Multiple publisher accounts provide:
- **Load distribution**: Spread L1 transaction costs across accounts
- **Parallelization**: Submit multiple transactions simultaneously
- **Resilience**: Continue operating if one publisher runs out of gas

**Array of publishers:**

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0xATTESTER_ETH_PRIVATE_KEY",
        "bls": "0xATTESTER_BLS_PRIVATE_KEY"
      },
      "publisher": [
        "0xPUBLISHER_1_PRIVATE_KEY",
        "0xPUBLISHER_2_PRIVATE_KEY",
        "0xPUBLISHER_3_PRIVATE_KEY"
      ],
      "feeRecipient": "0x1234567890123456789012345678901234567890123456789012345678901234"
    }
  ]
}
```

**Mixed storage methods:**

```json
{
  "schemaVersion": 1,
  "remoteSigner": "https://signer1.example.com:8080",
  "validators": [
    {
      "attester": {
        "eth": "0xATTESTER_ETH_PRIVATE_KEY",
        "bls": "0xATTESTER_BLS_PRIVATE_KEY"
      },
      "publisher": [
        "0xLOCAL_PRIVATE_KEY",
        "0xREMOTE_SIGNER_ADDRESS_1",
        {
          "address": "0xREMOTE_SIGNER_ADDRESS_2",
          "remoteSignerUrl": "https://signer2.example.com:8080"
        },
        {
          "mnemonic": "test test test test test test test test test test test junk",
          "addressCount": 2
        }
      ],
      "feeRecipient": "0x1234567890123456789012345678901234567890123456789012345678901234"
    }
  ]
}
```

This creates 5 publishers:
1. Local private key
2. Address in default remote signer (signer1.example.com)
3. Address in alternative remote signer (signer2.example.com)
4. Two mnemonic-derived addresses

:::warning Publisher Funding Required
All publisher accounts must be funded with ETH. Monitor balances to avoid missed proposals or proofs.
:::

## Multiple sequencers

Run multiple sequencer identities in a single node. This is useful when you operate multiple sequencers but want to consolidate infrastructure.

:::info High Availability Across Nodes
If you want to run the **same** sequencer across multiple nodes for redundancy and high availability, see the [High Availability Sequencers guide](../../setup/high_availability_sequencers.md). That guide covers running one sequencer identity on multiple physical nodes.

This section covers running **multiple different sequencer identities** on a single node.
:::

**When to use multiple sequencers per node:**
- You have multiple sequencer identities (different attester addresses)
- You want to consolidate infrastructure and reduce operational overhead
- You're running sequencers for multiple entities or clients
- You want to simplify management of several sequencers

**Use two approaches:**

**Option 1: Shared configuration**

Multiple attesters sharing the same publisher, coinbase, and fee recipient:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": [
        {
          "eth": "0xSEQUENCER_1_ETH_KEY",
          "bls": "0xSEQUENCER_1_BLS_KEY"
        },
        {
          "eth": "0xSEQUENCER_2_ETH_KEY",
          "bls": "0xSEQUENCER_2_BLS_KEY"
        }
      ],
      "publisher": ["0xSHARED_PUBLISHER"],
      "coinbase": "0xSHARED_COINBASE",
      "feeRecipient": "0xSHARED_FEE_RECIPIENT"
    }
  ]
}
```

**Option 2: Separate configurations**

Each sequencer with its own publisher, coinbase, and fee recipient:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0xSEQUENCER_1_ETH_KEY",
        "bls": "0xSEQUENCER_1_BLS_KEY"
      },
      "publisher": ["0xPUBLISHER_1"],
      "coinbase": "0xCOINBASE_1",
      "feeRecipient": "0xFEE_RECIPIENT_1"
    },
    {
      "attester": {
        "eth": "0xSEQUENCER_2_ETH_KEY",
        "bls": "0xSEQUENCER_2_BLS_KEY"
      },
      "publisher": ["0xPUBLISHER_2"],
      "coinbase": "0xCOINBASE_2",
      "feeRecipient": "0xFEE_RECIPIENT_2"
    }
  ]
}
```

For high availability configurations where you run the same sequencer across multiple nodes, see the [High Availability Sequencers guide](../../setup/high_availability_sequencers.md).

## Infrastructure provider scenarios

### Scenario 1: Multiple sequencers with isolation

For sequencers requiring complete separation, use separate keystore files:

**keystore-sequencer-a.json:**
```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0xSEQUENCER_A_ETH_KEY",
        "bls": "0xSEQUENCER_A_BLS_KEY"
      },
      "feeRecipient": "0xFEE_RECIPIENT_A"
    }
  ]
}
```

**keystore-sequencer-b.json:**
```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0xSEQUENCER_B_ETH_KEY",
        "bls": "0xSEQUENCER_B_BLS_KEY"
      },
      "feeRecipient": "0xFEE_RECIPIENT_B"
    }
  ]
}
```

Point `KEY_STORE_DIRECTORY` to the directory containing both files.

### Scenario 2: Shared publisher infrastructure

Multiple sequencers sharing a publisher pool for simplified gas management:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "0xSEQUENCER_1_ETH_KEY",
        "bls": "0xSEQUENCER_1_BLS_KEY"
      },
      "publisher": ["0xPUBLISHER_1", "0xPUBLISHER_2"],
      "feeRecipient": "0xFEE_RECIPIENT_1"
    },
    {
      "attester": {
        "eth": "0xSEQUENCER_2_ETH_KEY",
        "bls": "0xSEQUENCER_2_BLS_KEY"
      },
      "publisher": ["0xPUBLISHER_1", "0xPUBLISHER_2"],
      "feeRecipient": "0xFEE_RECIPIENT_2"
    }
  ]
}
```

Both sequencers share publishers while maintaining separate identities and fee recipients.

## Prover configurations

**Simple prover** (uses same key for identity and publishing):

```json
{
  "schemaVersion": 1,
  "prover": "0xPROVER_PRIVATE_KEY"
}
```

**Prover with dedicated publishers:**

```json
{
  "schemaVersion": 1,
  "prover": {
    "id": "0xPROVER_IDENTITY_ADDRESS",
    "publisher": [
      "0xPUBLISHER_1_PRIVATE_KEY",
      "0xPUBLISHER_2_PRIVATE_KEY"
    ]
  }
}
```

The `id` receives prover rewards while `publisher` accounts submit proofs.

## Complete Configuration Examples

### High Availability Sequencer Setup

Creating keystores for running the same sequencer across multiple nodes:

```bash
# Step 1: Generate a base keystore with your attester and multiple publishers
aztec validator-keys new \
  --fee-recipient [YOUR_FEE_RECIPIENT] \
  --mnemonic "your shared mnemonic..." \
  --address-index 0 \
  --publisher-count 3 \
  --data-dir ~/keys-temp

# This generates ONE keystore with:
# - Attester keys (ETH and BLS) at derivation index 0
# - Three publisher keys at indices 1, 2, and 3
```

After generation, you'll have a keystore with one attester and multiple publishers. Create separate keystores for each node by copying the base keystore and editing each to use only one publisher:

**Node 1** - Uses publisher at index 1
**Node 2** - Uses publisher at index 2
**Node 3** - Uses publisher at index 3

Each node's keystore will have the **same attester keys** (both ETH and BLS) but a **different publisher key**.

For detailed step-by-step HA setup instructions, see the [High Availability Sequencers guide](../../setup/high_availability_sequencers.md).

## Next steps

- See [Troubleshooting](./troubleshooting.md) for common issues
- Return to [Key Storage Methods](./storage_methods.md) for more options
- Start with basics at [Creating Keystores](./creating_keystores.md)
