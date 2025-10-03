---
id: advanced_sequencer_setup
sidebar_position: 3
title: Advanced sequencer setup
description: Learn how to run highly available sequencers and multiple sequencers within a single node for improved reliability.
---

## Overview

This guide covers advanced sequencer configurations, including running highly available sequencers and operating multiple sequencers within a single node.

## Prerequisites

Before proceeding, you should:

- Be comfortable running a sequencer node
- Understand the basic keystore structure from the sequencer setup guide

## Running highly available sequencers

A highly available sequencer setup runs multiple sequencer nodes with the same attester identity but different publisher identities. This configuration provides two key benefits:

1. **Redundancy**: Protects against missed attestations and proposals if any single sequencer node goes offline
2. **Duplicate prevention**: Prevents duplicate proposals from being sent from the same publisher address

The keystore structure for a standard sequencer looks like this:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": ["ETH_PRIVATE_KEY_0"],
      "publisher": ["ETH_PRIVATE_KEY_1"],
      "coinbase": "ETH_ADDRESS_2",
      "feeRecipient": "AZTEC_ADDRESS_0"
    }
  ]
}
```

### Setting up high availability

To run a highly available sequencer with the attester identity `ETH_PRIVATE_KEY_0`:

1. Run your first sequencer node using the keystore shown above
2. Run a second sequencer node on a different machine with this modified keystore:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": ["ETH_PRIVATE_KEY_0"],
      "publisher": ["ETH_PRIVATE_KEY_2"],
      "coinbase": "ETH_ADDRESS_2",
      "feeRecipient": "AZTEC_ADDRESS_0"
    }
  ]
}
```

**Key differences:**
- The `attester` value remains the same (`ETH_PRIVATE_KEY_0`)
- The `publisher` value is different (`ETH_PRIVATE_KEY_2` instead of `ETH_PRIVATE_KEY_1`)
- The `coinbase` and `feeRecipient` values remain the same

Duplicate attestations from the same attester identity will not result in slashing, so it's safe to use the same attester key across multiple nodes.

## Running multiple sequencers in one sequencer node

Similar to how a single Ethereum validator node can run multiple validators, an Aztec sequencer node can operate multiple sequencers. Use this setup when you have multiple sequencer identities but don't want to maintain separate infrastructure for each one.

There are two approaches to configure this, both using the keystore:

### Option 1: Shared configuration with multiple attesters

Start with the standard keystore structure:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": ["ETH_PRIVATE_KEY_0"],
      "publisher": ["ETH_PRIVATE_KEY_1"],
      "coinbase": "ETH_ADDRESS_2",
      "feeRecipient": "AZTEC_ADDRESS_0"
    }
  ]
}
```

To run multiple sequencers with shared publisher, coinbase, and fee recipient values, add additional attester identities to the array. For example, to add a second sequencer with identity `ETH_PRIVATE_KEY_5`:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": ["ETH_PRIVATE_KEY_0", "ETH_PRIVATE_KEY_5"],
      "publisher": ["ETH_PRIVATE_KEY_1"],
      "coinbase": "ETH_ADDRESS_2",
      "feeRecipient": "AZTEC_ADDRESS_0"
    }
  ]
}
```

This configuration runs both sequencer identities (`ETH_PRIVATE_KEY_0` and `ETH_PRIVATE_KEY_5`) while sharing the same publisher, coinbase, and fee recipient values.

### Option 2: Separate configurations for each sequencer

If you want each sequencer to have its own publisher, coinbase, and fee recipient, create separate entries in the `validators` array:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": ["ETH_PRIVATE_KEY_0"],
      "publisher": ["ETH_PRIVATE_KEY_1"],
      "coinbase": "ETH_ADDRESS_2",
      "feeRecipient": "AZTEC_ADDRESS_0"
    },
    {
      "attester": ["ETH_PRIVATE_KEY_5"],
      "publisher": ["ETH_PRIVATE_KEY_4"],
      "coinbase": "ETH_ADDRESS_3",
      "feeRecipient": "AZTEC_ADDRESS_1"
    }
  ]
}
```

This creates two separate validator entries, each with:
- Its own attester identity (`ETH_PRIVATE_KEY_0` and `ETH_PRIVATE_KEY_5`)
- Its own publisher identity (`ETH_PRIVATE_KEY_1` and `ETH_PRIVATE_KEY_4`)
- Its own coinbase address (`ETH_ADDRESS_2` and `ETH_ADDRESS_3`)
- Its own fee recipient (`AZTEC_ADDRESS_0` and `AZTEC_ADDRESS_1`)

## Verification

To verify your setup is working correctly:

1. **Check node logs**: Confirm that all configured sequencer identities are loaded and active
2. **Monitor attestations**: Verify that attestations are being submitted from the expected attester addresses
3. **Track proposals**: For highly available setups, confirm that proposals are being sent from different publisher addresses
4. **Test failover**: For HA configurations, stop one node and verify the other continues operating

## Troubleshooting

### Sequencer identities not loading

**Issue**: The sequencer node doesn't recognize all configured identities.

**Solution**: Verify that your keystore JSON syntax is valid and all private keys are properly formatted.

### Duplicate proposal errors

**Issue**: Receiving errors about duplicate proposals.

**Solution**: Ensure each sequencer node in an HA setup has a unique publisher identity. The attester can be the same, but publishers must differ.

### Performance degradation with multiple sequencers

**Issue**: Node performance decreases with multiple sequencers configured.

**Solution**: Consider the resource requirements for each sequencer identity. You may need to upgrade your infrastructure or distribute sequencers across multiple nodes.

## Next Steps

- Monitor your sequencer performance and adjust configurations as needed
- Review the main sequencer setup guide for additional operational guidance
- Consider implementing monitoring and alerting for your sequencer infrastructure
