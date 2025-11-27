---
id: registering_sequencer
sidebar_position: 3
title: Registering a Sequencer (Self-Staking)
description: Learn how to register your sequencer on the Aztec network using the staking dashboard for self-staking.
---

## Overview

This guide covers registering your sequencer on the Aztec network through the staking dashboard for **self-staking**. This is one of two ways to participate as a sequencer:

1. **Self-staking** (this guide): You provide your own stake via the staking dashboard
2. **Delegated staking**: You receive stake from delegators (see [Running with Delegated Stake](./running_delegated_stake.md))

Before proceeding, ensure you have completed the [Sequencer Setup Guide](../../setup/sequencer_management.md) and your node is running.

## Prerequisites

- Completed sequencer node setup with keystore generated
- Access to your **public keystore** file (`keyN_staker_output.json`)
- Sufficient stake tokens for registration
- Funded Ethereum account for gas fees (optional, for CLI registration)

## Registration Methods

You have two options for registering your sequencer:

### Option 1: Staking Dashboard (Recommended)

The staking dashboard provides a user-friendly interface for sequencer registration.

**Steps:**

1. Navigate to the Aztec staking dashboard
2. Connect your wallet
3. Upload your **public keystore** file (`keyN_staker_output.json`)
4. Follow the dashboard prompts to complete registration and staking

The public keystore contains all the information needed for the staking dashboard. It was automatically generated when you created your keys (see [Generating Keys](../../setup/sequencer_management.md#generating-keys)).

### Option 2: CLI Registration (Advanced)

For advanced users or automated setups, you can register via the Aztec CLI.

**What you need:**

- Your attester address (from your private keystore at `validators[0].attester.eth`)
- A withdrawer address (typically the same as your attester address)
- Your BLS private key (from your private keystore at `validators[0].attester.bls`)
- An L1 RPC endpoint
- A funded Ethereum account to pay for the registration transaction
- The rollup contract address for your network

**Register your sequencer:**

```bash
aztec add-l1-validator \
  --l1-rpc-urls [YOUR_L1_RPC_URL] \
  --network [NETWORK_NAME] \
  --private-key [FUNDING_PRIVATE_KEY] \
  --attester [YOUR_ATTESTER_ADDRESS] \
  --withdrawer [YOUR_WITHDRAWER_ADDRESS] \
  --bls-secret-key [YOUR_BLS_PRIVATE_KEY] \
  --rollup [ROLLUP_CONTRACT_ADDRESS]
```

**Parameter descriptions:**

- `--l1-rpc-urls`: Your Ethereum L1 RPC endpoint
- `--network`: Network identifier (e.g., `testnet`, `staging-public`)
- `--private-key`: Private key of an Ethereum account with ETH to pay for gas (this is NOT your sequencer key)
- `--attester`: Your sequencer's attester address from the private keystore
- `--withdrawer`: Ethereum address that can withdraw your stake (typically same as attester)
- `--bls-secret-key`: Your BLS private key from the private keystore (`validators[0].attester.bls`)
- `--rollup`: The rollup contract address for your network

**Extract values from your private keystore:**

```bash
# Get your attester address
jq -r '.validators[0].attester.eth' aztec-sequencer/keys/keystore.json

# Get your BLS private key (this will be used for --bls-secret-key)
jq -r '.validators[0].attester.bls' aztec-sequencer/keys/keystore.json
```

:::warning Funding Account vs Sequencer Keys
The `--private-key` parameter is for a **funding account** that pays for the registration transaction gas fees. This should NOT be your sequencer's attester or publisher key. Use a separate account with ETH specifically for funding this transaction.
:::

Your sequencer will be added to the validator set once the transaction is confirmed onchain.

## Understanding the Public Keystore

When you generated your keys, the command automatically created two files:

1. **Private keystore** (`~/.aztec/keystore/keyN.json`) - Contains private keys, used by your sequencer node
2. **Public keystore** (`~/.aztec/keystore/keyN_staker_output.json`) - Contains only public information, used for the staking dashboard

The public keystore contains all the information needed for the staking dashboard:

```json
[
  {
    "attester": "0xYOUR_ATTESTER_ADDRESS",
    "publicKeyG1": {
      "x": "FIELD_ELEMENT_AS_DECIMAL_STRING",
      "y": "FIELD_ELEMENT_AS_DECIMAL_STRING"
    },
    "publicKeyG2": {
      "x0": "FIELD_ELEMENT_AS_DECIMAL_STRING",
      "x1": "FIELD_ELEMENT_AS_DECIMAL_STRING",
      "y0": "FIELD_ELEMENT_AS_DECIMAL_STRING",
      "y1": "FIELD_ELEMENT_AS_DECIMAL_STRING"
    },
    "proofOfPossession": {
      "x": "FIELD_ELEMENT_AS_DECIMAL_STRING",
      "y": "FIELD_ELEMENT_AS_DECIMAL_STRING"
    }
  }
]
```

The public keystore can be safely shared and uploaded to the staking dashboard for sequencer registration. It contains only public information:
- **`attester`**: Your Ethereum attester address (sequencer identifier)
- **`publicKeyG1`**: BLS public key on the G1 curve (x, y coordinates)
- **`publicKeyG2`**: BLS public key on the G2 curve (x0, x1, y0, y1 coordinates)
- **`proofOfPossession`**: Cryptographic proof to prevent rogue key attacks

:::tip
The public keystore contains no private keys and is safe to share with the staking dashboard or other parties.
:::

## Verification

After registration, verify your sequencer is properly registered:

### Check Registration Status

Use the staking dashboard to:
- View your sequencer's registration status
- Monitor your stake amount
- Track sequencer performance metrics

### Query Onchain Status

You can also query the status using the Rollup contract. See [Monitoring Sequencer Status](../../setup/sequencer_management.md#monitoring-sequencer-status) for detailed instructions.

## Next Steps

After registering your sequencer:

1. **Monitor performance**: Track your sequencer's attestation rate and block proposals via the staking dashboard
2. **Maintain uptime**: Keep your sequencer node running with high availability
3. **Monitor your stake**: Ensure your stake remains above the ejection threshold
4. **Stay informed**: Join the [Aztec Discord](https://discord.gg/aztec) for operator support and network updates

## Alternative: Running with Delegated Stake

If you prefer to run a sequencer backed by delegated stake instead of self-staking, see the [Running with Delegated Stake](./running_delegated_stake.md) guide.
