---
title: Sandbox Reference
tags: [sandbox]
sidebar_position: 1
---

:::tip

For a quick start, follow the [guide](../../getting_started.md) to install the sandbox.

:::

## Environment Variables

There are various environment variables you can use when running the whole sandbox or when running on of the available modes.

**Sandbox**

```sh
LOG_LEVEL=debug # Options are 'fatal', 'error', 'warn', 'info', 'verbose', 'debug', 'trace'
HOST_WORKDIR='${PWD}' # The location to store log outputs. Will use ~/.aztec where the binaries are stored by default.
ETHEREUM_HOSTS=http://127.0.0.1:8545 # List of Ethereum JSON RPC URLs. We use an anvil instance that runs in parallel to the sandbox on docker by default.
ANVIL_PORT=8545 # The port that docker will forward to the anvil instance (default: 8545)
L1_CHAIN_ID=31337 # The Chain ID that the Ethereum host is using.
TEST_ACCOUNTS='true' # Option to deploy 3 test account when sandbox starts. (default: true)
MODE='sandbox' # Option to start the sandbox or a standalone part of the system. (default: sandbox)
PXE_PORT=8080 # The port that the PXE will be listening to (default: 8080)
AZTEC_NODE_PORT=8080 # The port that Aztec Node will be listening to (default: 8080)

## Polling intervals ##
ARCHIVER_POLLING_INTERVAL_MS=50
P2P_BLOCK_CHECK_INTERVAL_MS=50
SEQ_TX_POLLING_INTERVAL_MS=50
WS_BLOCK_CHECK_INTERVAL_MS=50
ARCHIVER_VIEM_POLLING_INTERVAL_MS=500
```

**Aztec Node**

Variables like `DEPLOY_AZTEC_CONTRACTS` & `AZTEC_NODE_PORT` are valid here as described above.
`TEST_ACCOUNTS` cannot be used here because the Aztec node does not control an Aztec account to deploy contracts from.

```sh
# P2P config #
# Configuration variables for connecting a Node to the Aztec Node P2P network. You'll need a running P2P-Bootstrap node to connect to.
P2P_ENABLED='false' # A flag to enable P2P networking for this node. (default: false)
P2P_BLOCK_CHECK_INTERVAL_MS=100 # The frequency in which to check for new L2 blocks.
P2P_PEER_CHECK_INTERVAL_MS=1000 # The frequency in which to check for peers.
P2P_L2_BLOCK_QUEUE_SIZE=1000 # Size of queue of L2 blocks to store.
P2P_IP='' # Announce IP of the peer. Defaults to working it out using discV5, otherwise set P2P_QUERY_FOR_IP if you are behind a NAT
P2P_LISTEN_ADDR=0.0.0.0 # The  address on which the P2P service should listen for connections.(default: 0.0.0.0)
P2P_PORT=40400 # The Port that will be used for sending & listening p2p messages (default: 40400)
PEER_ID_PRIVATE_KEY='' # An optional peer id private key. If blank, will generate a random key.
BOOTSTRAP_NODES='' # A list of bootstrap peers to connect to, separated by commas
P2P_ANNOUNCE_PORT='' # Port to announce to the p2p network
P2P_NAT_ENABLED='false' # Whether to enable NAT from libp2p
P2P_MAX_PEERS=100 # The maximum number of peers (a peer count above this will cause the node to refuse connection attempts)

## Aztec Contract Addresses ##
# When running a standalone node, you need to have deployed Aztec contracts on your Ethereum host, then declare their addresses as env variables.
REGISTRY_CONTRACT_ADDRESS=0x01234567890abcde01234567890abcde
INBOX_CONTRACT_ADDRESS=0x01234567890abcde01234567890abcde
OUTBOX_CONTRACT_ADDRESS=0x01234567890abcde01234567890abcde
ROLLUP_CONTRACT_ADDRESS=0x01234567890abcde01234567890abcde

## Sequencer variables ##
SEQ_PUBLISHER_PRIVATE_KEY=0x01234567890abcde01234567890abcde # Private key of an ethereum account that will be used by the sequencer to publish blocks.
SEQ_MAX_TX_PER_BLOCK=32 # Maximum txs to go on a block. (default: 32)
SEQ_MIN_TX_PER_BLOCK=1 # Minimum txs to go on a block. (default: 1)

## Validator variables ##
VALIDATOR_PRIVATE_KEY=0x01234567890abcde01234567890abcde  # Private key of the ethereum account that will be used to perform validator duties
```

**PXE**

Variables like `TEST_ACCOUNTS` & `PXE_PORT` are valid here as described above.

```sh
AZTEC_NODE_URL='http://localhost:8079' # The address of an Aztec Node URL that the PXE will connect to (default: http://localhost:8079)
PXE_PORT=8080 # The port that the PXE will be listening to (default: 8080)
TEST_ACCOUNTS='true' # Option to deploy 3 test account when sandbox starts. (default: true)
```

**P2P Bootstrap Node**

The P2P Bootstrap node is a standalone app whose purpose is to assist new P2P network participants in acquiring peers.

```sh
PEER_ID_PRIVATE_KEY='' # The private key to be used by the peer for secure communications with other peers. This key will also be used to derive the Peer ID.
P2P_IP='' # Announce IP of the peer. Defaults to working it out using discV5, otherwise set P2P_QUERY_FOR_IP if you are behind a NAT
P2P_LISTEN_ADDR=0.0.0.0 # The  address on which the P2P service should listen for connections.(default: 0.0.0.0)
P2P_PORT=40400 # The Port that will be used for sending & listening p2p messages (default: 40400)
```

## Cheat Codes

To help with testing, the sandbox is shipped with a set of cheatcodes.

Cheatcodes allow you to change the time of the Aztec block, load certain state or more easily manipulate Ethereum instead of having to write dedicated RPC calls to anvil or hardhat.

You can find the cheat code reference [here](./cheat_codes.md).

## Contracts

We have shipped a number of example contracts in the `@aztec/noir-contracts.js` [npm package](https://www.npmjs.com/package/@aztec/noir-contracts.js). This is included with the sandbox by default so you are able to use these contracts to test with.

```bash
AppSubscriptionContractArtifact
AuthContractArtifact
BenchmarkingContractArtifact
CardGameContractArtifact
ChildContractArtifact
ClaimContractArtifact
ContractClassRegistererContractArtifact
ContractInstanceDeployerContractArtifact
CounterContractArtifact
CrowdfundingContractArtifact
DocsExampleContractArtifact
EasyPrivateTokenContractArtifact
EasyPrivateVotingContractArtifact
EcdsaAccountContractArtifact
EscrowContractArtifact
FPCContractArtifact
FeeJuiceContractArtifact
ImportTestContractArtifact
LendingContractArtifact
MultiCallEntrypointContractArtifact
ParentContractArtifact
PendingNoteHashesContractArtifact
PriceFeedContractArtifact
ReaderContractArtifact
SchnorrAccountContractArtifact
SchnorrHardcodedAccountContractArtifact
SchnorrSingleKeyAccountContractArtifact
SlowTreeContractArtifact
StatefulTestContractArtifact
TestContractArtifact
TokenBlacklistContractArtifact
TokenBridgeContractArtifact
TokenContractArtifact
UniswapContractArtifact
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/master//yarn-project/end-to-end/src/composed/cli_docs_sandbox.test.ts#L95-L118" target="_blank" rel="noopener noreferrer">Source code: /yarn-project/end-to-end/src/composed/cli_docs_sandbox.test.ts#L95-L118</a></sub></sup>

You can see all of our example contracts in the monorepo [here (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts/contracts).

## Running Aztec PXE / Node / P2P-Bootstrap node individually

If you wish to run components of the Aztec network stack separately, you can use the `aztec start` command with various options for enabling components.

```bash
aztec start --node [nodeOptions] --pxe [pxeOptions] --archiver [archiverOptions] --sequencer [sequencerOptions] --prover [proverOptions] --p2p-bootstrap [p2pOptions]
```

Starting the aztec node alongside a PXE, sequencer or archiver, will attach the components to the node. Eg if you want to run a PXE separately to a node, you can [read this guide](../../guides/local_env/run_more_than_one_pxe_sandbox.md).

## Update the sandbox

To update the sandbox, run:

```bash
aztec-up
```
