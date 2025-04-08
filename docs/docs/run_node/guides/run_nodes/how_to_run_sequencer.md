---
sidebar_position: 1
title: How to run a Sequencer Node
---

Starting a Sequencer node is not too different from starting a [sandbox](../../../developers/getting_started.md). While the sandbox starts all the components needed for local development, the Sequencer workflow is more focused on testnet and mainnet features and provides more flexibility to suit your own environment.

## Prerequisites

Before following this guide, make sure you:

- Have the `aztec` tool [installed](../../../run_node/index.md) and updated to the latest version
- Understand how [Provers and Sequencers](../../concepts/provers-and-sequencers/) work
- Are running a Linux or MacOS machine and you know how to use a terminal

## Getting started

The `aztec` CLI tool really is a one-stop-shop for pretty much everything, from a local dev environment to a prover node with multiple agents.

Running a sequencer is not more than "assembling" a basic command that will boot a docker container with the right services: node, sequencer, and optionally archiver.

### Grab your RPC URLs

Sequencing involves grabbing values from both L2 and L1. It is intended that you bring your own infrastructure, or subscribe to any service that will provide it for you. You will need:

- An Ethereum _execution_ node RPC. For example from [DRPC](https://drpc.org/chainlist/ethereum) or [Alchemy](https://www.alchemy.com/ethereum). This is where the new state will be sent and verified when you produce a block.
- An Ethereum _beacon_ node RPC. For example [DRPC](https://drpc.org/chainlist/eth-beacon-chain#eth-beacon-chain-sepolia) provides one. The beacon node is required in order to grab data from the blob space.

:::warning

The `free` route will likely get you rate-limited and you won't be able to sync. You will need to set up a paid plan or `pay-as-you-go`.

:::

### Run your node

The command to start the different modules is `aztec start`, and the different components are selected by passing different flags. For a basic sequencer, we need the following ones:

- `--network` \<network\> - Selects the docker image for the expected network (ex. `alpha-testnet`). This will setvalues such as contract addresses, bootnodes, L1 ChainID, and others.
- `--l1-rpc-urls` \<execution-node\> - The URL to use as the L1 execution node you've set up
- `--l1-consensus-host-url` \<beacon-node\> - The URL of the L1 beacon node you've set up
- `--l1-consensus-host-api-key-header` \<header-key\> - If your beacon RPC requires the API key to be set on a header, provide its key here (ex. "API-KEY: \<api-key\>"). Leave empty if your beacon RPC expects the key to be in the query parameters (ex. \<the-url\>/?key=\<api-key\>)
- `--l1-consensus-host-api-key` \<api-key\> - The beacon node API key. You can leave this empty if the URL already contains the key (ex. \<the-url\>/rest/\<api-key>/eth-beacon-chain-sepolia)
- `--archiver` - Starts the archiver service, which will store the synced blocks.
- `--node` - Starts the node service, which will grab the data from the L1 RPCs

An example command would be:

```bash
aztec start --network alpha-testnet --l1-rpc-urls https://eth-sepolia.g.alchemy.com/v2/your-key --l1-consensus-host-url https://lb.drpc.org/rest/your-key/eth-beacon-chain-sepolia --archiver --node
```

This will get you to connect to a bootnode, find other peers, get the contract addresses, and download previous blocks:

```bash
INFO: archiver Starting archiver sync to rollup contract... etc
INFO: archiver Downloaded L2 block 1... etc
```

## Run your sequencer

As of the alpha testnet, there's no fast sync, so your node will actually sync everything from the beginning of (Aztec) times, which _will_ take a few hours.

Feel free to leave it syncing as you get ready to restart it using the sequencer configuration.

:::info sparta

Sparta is a useful bot to get things done on the testnet. You'll need it to register yourself and to be part of the community. Head to the Aztec Discord and head to the `#this-is-spartaa` channel. Sparta tends to hang around alone there.

If you're syncing your node, this is a great time to use some Spartan energy. Type `/get-info`: the mighty Spartan will hopefully print out the latest stats, for example:

```md
Pending block: 11067
Proven block: 11043
Current epoch: 375
Current slot: 12023
Proposer now: 0x00000
```

You can look at your own logs and have a sense of how far away from the tip you are.

:::

### Flags and coffee

To boot up a sequencer, there are a few more flags needed:

- `--sequencer` - Self-explanatory, this starts the sequencer module.
- `--sequencer.validatorPrivateKey` - This is your sequencer's private key, the one signing attestations and blocks.
- `--p2p.p2pIp` - Your node's IP, so other nodes can connect. If your IP changes frequently, you can assign a fixed hostname (i.e. with [NoIp](https://www.noip.com/) or similar services)

You also need to __fund__ your sequencer. In short, it needs two types of funds:

- Sepolia ETH, in order to register and publish L1 blocks
- TST, known as the fee-paying asset, in order to stake.

You're expected to bring your own Sepolia ETH. Use services like [https://sepolia-faucet.pk910.de/](this PoW faucet) to get it. You can also drop a message on Discord and our kind community will hopefully drip you some (just make sure you do the same for others!).

As for the TST asset, you will mint it once you're synced and ready to register. For now, just grab a coffee. Or several.

### Sequencing

Stop your node and add a new module with the flags mentioned above. For example:

```bash
aztec start --network alpha-testnet --l1-rpc-urls https://eth-sepolia.g.alchemy.com/v2/your-key --l1-consensus-host-url https://lb.drpc.org/rest/your-key/eth-beacon-chain-sepolia --archiver --node --sequencer --sequencer.validatorPrivateKey \<your-private-key\> --p2p.p2pIp \<your-ip\>
```

It should sync any blocks you may have missed. Check with Sparta that you're at the tip before proceeding.

## Registering

Being a decentralized testnet means anyone can deposit TST and become a validator. To make our tester's life easier, Sparta will register your node on your behalf, as long as you pass a simple challenge: provide a proof that your node is synced with a recent block

Fire up a terminal and call your own node, like:

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"node_getL2Tips","params":[],"id":67}' "http://<your-node-ip>:<your-node-port>" | jq ".result.proven.number"
```

This will give you a block number. Now, get a proof you have that block number:

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"node_getArchiveSiblingPath","params":[11262,11262],"id":67}' "http://<your-node-ip>:<your-node-port>" | jq ".result"
```

It will return a long base64-encoded string. Note it down and head to Discord.

On the `#this-is-spartaa` discord channel, run `/validator register`. The Spartan will ask you for your node address (the one above), as well as the block number and the proof. Paste those. Done!

On your logs, you will eventually see shiny new blocks being made by you. The provernet will then listen and prove them for you.
