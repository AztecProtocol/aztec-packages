---
sidebar_position: 4
title: FAQs & Common Issues/Resolutions
description: Frequently asked questions and common issues that a node operators may face, and how to resolve them.
keywords: [aztec, sequencer, node, validator, setup]
tags:
  - sequencer
  - node
  - tutorial
  - infrastructure
---

Here is a list of common issues node operators may face. If you don't find your issue here, please check the [Aztec discord server](https://discord.gg/aztec), namely the `# operator | faq` channel.

## "Error getting slot number"

If it is regarding a beacon call, it has failed to the beacon rpc call. If it is regarding the execution endpoint, then it is likely just reporting.

## Update aztec alpha-testnet version

To make sure you're using the latest version, run: `aztec-up alpha-testnet`, then restart your node.

## "rpc rate", "quota limit"

Registering with your rpc url provider will give you a token that may permit more requests.

## "No blob bodies found", "Unable to get blob sidecar, Gateway Time-out (504)"

Check `L1_CONSENSUS_HOST_URLS` (for the beacon chain), if you see it regularly likely also a rate/limit issue.

## "Insufficient L1 funds"

EOA needs sepolia eth, use faucet.

## "CodeError: stream reset"

Seen occasionally in logs. Reason: ...
Ignore.

## "SYNC_BLOCK failed"

`ERROR: world-state:database Call SYNC_BLOCK failed: Error: Can't synch block: block state does not match world state`

- Stop aztec
- Delete current snapshot: `rm -rf ~/.aztec/#include_testnet_version/data/archiver`
- Update to latest version: `aztec-up -v latest`
- Start aztec
