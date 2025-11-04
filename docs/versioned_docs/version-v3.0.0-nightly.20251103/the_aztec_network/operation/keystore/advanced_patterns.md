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
      "attester": "0x1234567890123456789012345678901234567890",
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
      "attester": "0x1234567890123456789012345678901234567890",
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
        "0xSEQUENCER_1_PRIVATE_KEY",
        "0xSEQUENCER_2_PRIVATE_KEY"
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
      "attester": "0xSEQUENCER_1_PRIVATE_KEY",
      "publisher": ["0xPUBLISHER_1"],
      "coinbase": "0xCOINBASE_1",
      "feeRecipient": "0xFEE_RECIPIENT_1"
    },
    {
      "attester": "0xSEQUENCER_2_PRIVATE_KEY",
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
      "attester": "0xSEQUENCER_A_KEY",
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
      "attester": "0xSEQUENCER_B_KEY",
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
      "attester": "0xSEQUENCER_1_KEY",
      "publisher": ["0xPUBLISHER_1", "0xPUBLISHER_2"],
      "feeRecipient": "0xFEE_RECIPIENT_1"
    },
    {
      "attester": "0xSEQUENCER_2_KEY",
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

## Next steps

- See [Troubleshooting](./troubleshooting.md) for common issues
- Return to [Key Storage Methods](./storage_methods.md) for more options
