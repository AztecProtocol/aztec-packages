---
sidebar_position: 5
title: Useful Commands
description: Learn about useful commands for interacting with the Aztec network.
---

These commands are useful to sequencer operators. If you're trying to do something that is not listed here, ask in the appropriate discord channel.

## Prerequisites

- You'll need a way to query the L1 contracts, this guide assumes you have `foundry` installed.
- Have the `aztec` tool [installed](../../developers/getting_started_on_sandbox.md#install-the-sandbox)
- Ethereum EL RPC endpoint

## Basics

### Get the Registry contract address

The Registry contract is your entrypoint into almost all other contracts for a particular deployment of the Aztec Network. Armed with this address, you can retrieve almost all other useful contracts.

Assume there are two "deployments" of Aztec i.e. an `testnet` and a `ignition-testnet`. Then each deployment will have a unique Registry contract that does not change with upgrades. If a governance upgrade on `testnet` deploys a new rollup contract, the Registry contract for the `testnet` deployment will not change.

<!-- The Registry contract for a particular deployment can be retrieved from the [Chain Info](../..link) page. -->

### Get the Rollup contract

Run

```bash
cast call <RegistryContractAddress> "getCanonicalRollup()" --rpc-url https://example.com
```

:::info
The rest of the guide will omit the `--rpc-url` flag for legibility.
:::

## Query the Sequencer Set

### Retrieve a list of all sequencers

Run

```bash
cast call <RollupAddress> "getAttesters()" --rpc-url
```

### What is the status of a particular sequencer?

Run

```bash
cast call <RollupAddress> "getInfo(address)" <SequencerAddress>
```

This will return in order: 1) the sequencer's balance 2) their `withdrawer` address 3) their `proposer` address and 4) their current status.

| Status | Meaning                                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| 0      | The sequencer is not in the sequencer set                                                                            |
| 1      | The sequencer is currently in the sequencer set.                                                                     |
| 2      | The sequencer is not active in the set. This could mean that they initiated a withdrawal and are awaiting final exit |
| 3      | The sequencer has completed their exit delay and can be exited from the sequencer set                                |

## Governance Upgrades

### Get the GovernanceProposer contract

First get the Governance contract from the Registry, and query it for the GovernanceProposer contract.

```bash
cast call <RegistryAddress> "getGovernance()"
cast call <GovernanceAddress> "governanceProposer()"
```

### Check what the governance quorums are

Run

```bash
cast call <GovernanceProposerAddress> "M()" # The size of any signalling round in L2 blocks.
cast call <GovernanceProposerAddress> "N()" # The number of signals that must be received in any single signalling round.
```

### Check how many signals a payload has received

You can check how many signals a `payload` has received in a specific round. To do so, you need the rollup address, the payload address and the round number. To find the round number at a specific point in time, you can compute it using an L2 slot number.

```bash
cast call <GovernanceProposerAddress> "computeRound(uint256)" <SlotNumber> # returns a round number (in hex)
cast call <GovernanceProposerAddress> "yeaCount(address,uint256,address)" <RollupAddress> <RoundNumber> <PayloadAddress> # round number should is an integer
```
