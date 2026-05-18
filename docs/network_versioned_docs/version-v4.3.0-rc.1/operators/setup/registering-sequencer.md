---
id: registering_sequencer
displayed_sidebar: operatorsSidebar
title: Registering a Sequencer
description: Learn how to register your sequencer on the Aztec network using the staking dashboard for self-staking.
---

## Overview

This guide covers registering your sequencer on the Aztec network through the staking dashboard for **self-staking**. This is one of two ways to participate as a sequencer:

1. **Self-staking** (this guide): You provide your own stake via the staking dashboard
2. **Delegated staking**: You receive stake from delegators (see [Running as a Staking Provider](./staking-provider.md))

Before proceeding, ensure you have completed the [Sequencer Setup Guide](./sequencer-setup.md) and your node is running.

## Prerequisites

- Completed sequencer node setup with keystore generated
- Access to your **public keystore** file (`keyN_staker_output.json`)
- Sufficient ATP/ATV tokens for staking
- Wallet with ETH for gas fees
- Web browser for accessing the staking dashboard

## Understanding Your Keystore

When you generated your sequencer keys, two files were automatically created:

1. **Private keystore** (`~/.aztec/keystore/keyN.json`) - Contains private keys, used by your sequencer node. Keep this secure and never share it.
2. **Public keystore** (`~/.aztec/keystore/keyN_staker_output.json`) - Contains only public information, used for registration via the staking dashboard.

### Public Keystore Structure

The public keystore contains the following information needed for registration:

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

**Fields explained:**
- **`attester`**: Your Ethereum attester address (sequencer identifier)
- **`publicKeyG1`**: BLS public key on the G1 curve (x, y coordinates)
- **`publicKeyG2`**: BLS public key on the G2 curve (x0, x1, y0, y1 coordinates)
- **`proofOfPossession`**: Cryptographic proof to prevent rogue key attacks

:::tip
The public keystore contains no private keys and is safe to share with the staking dashboard or other parties.
:::

## Preparing Your Keystore File

### Single Sequencer

If you're registering one sequencer, simply use the `keyN_staker_output.json` file that was generated when you created your keys.

### Multiple Sequencers

If you're registering multiple sequencers in a single transaction, combine the individual keystore files into a single JSON array. Each object in the array represents one sequencer.

**Example for two sequencers:**

```json
[
  {
    "attester": "0xATTESTER_ADDRESS_1",
    "publicKeyG1": {
      "x": "0x...",
      "y": "0x..."
    },
    "publicKeyG2": {
      "x0": "0x...",
      "x1": "0x...",
      "y0": "0x...",
      "y1": "0x..."
    },
    "proofOfPossession": {
      "x": "0x...",
      "y": "0x..."
    }
  },
  {
    "attester": "0xATTESTER_ADDRESS_2",
    "publicKeyG1": {
      "x": "0x...",
      "y": "0x..."
    },
    "publicKeyG2": {
      "x0": "0x...",
      "x1": "0x...",
      "y0": "0x...",
      "y1": "0x..."
    },
    "proofOfPossession": {
      "x": "0x...",
      "y": "0x..."
    }
  }
]
```

Simply copy the contents of each `keyN_staker_output.json` file and combine them into a single array.

## Registration Steps

Follow these steps to register your sequencer(s) through the staking dashboard:

1. **Navigate to the staking dashboard** at https://stake.aztec.network

2. **Connect your wallet** with the account that holds your ATP/ATV tokens

3. **Click "Stake"**

   ![Staking dashboard home](/img/staking_dashboard_1.png)

4. **Select "Run your own Sequencer"**

   ![Select sequencer option](/img/staking_dashboard_2.png)

5. **Click through "Start Registration"** after reviewing the requirements

6. **Select the ATP/ATV tokens you want to stake**

7. **Upload your keystore JSON file** (either single or combined multi-sequencer file)

   ![Upload keystore file](/img/staking_dashboard_3.png)

8. **Confirm your attester/sequencer addresses**

   ![Confirm addresses](/img/staking_dashboard_4.png)

9. **Approve token spend** in your wallet

   ![Approve tokens](/img/staking_dashboard_5.png)

10. **Add staking for all sequencers to the queue**

    ![Add to queue](/img/staking_dashboard_6.png)

11. **Execute transactions** in the dashboard

    ![Execute transactions](/img/staking_dashboard_7.png)

12. **Confirm each transaction** in your wallet

13. **Click "Complete"** when all transactions are confirmed

14. **Verification**: Your sequencers have entered the queue. You can verify this at https://dashtec.xyz/queue

## Verification

After registration, verify your sequencer is properly registered:

### Via Staking Dashboard

Use the staking dashboard to:
- View your sequencer's registration status
- Monitor your stake amount
- Track sequencer performance metrics

### Via Blockchain Explorer

You can verify your sequencers are in the queue at https://dashtec.xyz/queue

### Via Smart Contract

You can also query the status directly using the Rollup contract. See [Useful Commands](../sequencer-management/useful-commands.md) for detailed instructions.

## Next Steps

After registering your sequencer:

1. **Monitor performance**: Track your sequencer's attestation rate and block proposals via the staking dashboard
2. **Maintain uptime**: Keep your sequencer node running with high availability
3. **Monitor your stake**: Ensure your stake remains above the ejection threshold
4. **Stay informed**: Join the [Aztec Discord](https://discord.gg/aztec) for operator support and network updates

## Alternative: Running with Delegated Stake

If you prefer to run a sequencer backed by delegated stake instead of self-staking, see the [Becoming a Staking Provider](./staking-provider.md) guide.
