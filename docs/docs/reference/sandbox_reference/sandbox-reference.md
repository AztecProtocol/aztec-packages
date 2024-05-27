---
title: Sandbox Reference
---

:::tip

For a quick start, follow the [guide](../../getting_started.md) to install the sandbox.

:::

## Manual Install

You can manually install the sandbox via the underlying script used in the [Aztec Boxes](getting_started.md#run-the-npx-script).

### Prerequisites

- Node.js >= v18 (recommend installing with [nvm](https://github.com/nvm-sh/nvm))
- Docker (visit [this page of the Docker docs](https://docs.docker.com/get-docker/) on how to install it)

### Install the sandbox

To install the latest Sandbox version, run:

```bash
bash -i <(curl -s install.aztec.network)
```

This will install the following tools:

- **aztec** - launches various infrastructure subsystems (sequencer, prover, pxe, etc).
- **aztec-nargo** - aztec's build of nargo, the noir compiler toolchain.
- **aztec-sandbox** - a wrapper around docker-compose that launches services needed for sandbox testing.
- **aztec-up** - a tool to upgrade the aztec toolchain to the latest, or specific versions.
- **aztec-builder** - A useful tool for projects to generate ABIs and update their dependencies.

Once these have been installed, to start the sandbox, run:

```bash
aztec-sandbox
```

### Have fun!

**Congratulations, you have just installed and run the Aztec Sandbox!**

```bash
     /\        | |
    /  \    ___| |_ ___  ___
   / /\ \  |_  / __/ _ \/ __|
  / ____ \  / /| ||  __/ (__
 /_/___ \_\/___|\__\___|\___|

```

In the terminal, you will see some logs:

1. Sandbox version
2. Contract addresses of rollup contracts
3. PXE (private execution environment) setup logs
4. Initial accounts that are shipped with the sandbox and can be used in tests

## Running Aztec PXE / Node / P2P-Bootstrap node

If you wish to run components of the Aztec network stack separately, you can use the `aztec start` command with various options for enabling components.

```bash
aztec start --node [nodeOptions] --pxe [pxeOptions] --archiver [archiverOptions] --sequencer [sequencerOptions] --prover [proverOptions] ----p2p-bootstrap [p2pOptions]
```

Starting the aztec node alongside a PXE, sequencer or archiver, will attach the components to the node.Eg if you want to run a PXE separately to a node, you can [read this guide](../../aztec/concepts/pxe/index.md)/

## Environment Variables

There are various environment variables you can use when running the whole sandbox or when running on of the available modes.

To change them, you can open `~/.aztec/docker-compose.yml` and edit them directly.

**Sandbox**

```sh
DEBUG=aztec:* # The level of debugging logs to be displayed. using "aztec:*" will log everything.
HOST_WORKDIR='${PWD}' # The location to store log outpus. Will use ~/.aztec where the docker-compose.yml file is stored by default.
ETHEREUM_HOST=http://ethereum:8545 # The Ethereum JSON RPC URL. We use an anvil instance that runs in parallel to the sandbox on docker by default.
CHAIN_ID=31337 # The Chain ID that the Ethereum host is using.
TEST_ACCOUNTS='true' # Option to deploy 3 test account when sandbox starts. (default: true)
MODE='sandbox' # Option to start the sandbox or a standalone part of the system. (default: sandbox)
PXE_PORT=8080 # The port that the PXE will be listening to (default: 8080)
AZTEC_NODE_PORT=8080 # The port that Aztec Node will be listening to (default: 8080)

# Ethereum Forking (Optional: not enabled by default) #
FORK_BLOCK_NUMBER=0 # The block number to fork from
FORK_URL="" # The URL of the Ethereum node to fork from

## Polling intervals ##
ARCHIVER_POLLING_INTERVAL_MS=50
P2P_BLOCK_CHECK_INTERVAL_MS=50
SEQ_TX_POLLING_INTERVAL_MS=50
WS_BLOCK_CHECK_INTERVAL_MS=50
PXE_BLOCK_POLLING_INTERVAL_MS=50
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
P2P_TCP_LISTEN_PORT=40400 # The tcp port on which the P2P service should listen for connections.
P2P_TCP_LISTEN_IP= #The tcp IP on which the P2P service should listen for connections.
PEER_ID_PRIVATE_KEY='' # An optional peer id private key. If blank, will generate a random key.
BOOTSTRAP_NODES='' # A list of bootstrap peers to connect to, separated by commas
P2P_ANNOUNCE_HOSTNAME='' # Hostname to announce to the p2p network
P2P_ANNOUNCE_PORT='' # Port to announce to the p2p network
P2P_NAT_ENABLED='false' # Whether to enable NAT from libp2p
P2P_MIN_PEERS=10 # The minimum number of peers (a peer count below this will cause the node to look for more peers)
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
```

**PXE**

Variables like `TEST_ACCOUNTS` & `PXE_PORT` are valid here as described above.

```sh
AZTEC_NODE_URL='http://localhost:8079' # The address of an Aztec Node URL that the PXE will connect to (default: http://localhost:8079)
PXE_PORT=8080 # The port that the PXE will be listening to (default: 8080)
TEST_ACCOUNTS='true' # Option to deploy 3 test account when sandbox starts. (default: true)
PXE_BLOCK_POLLING_INTERVAL_MS=50 # Interval to check for new L2 blocks. (default: 50)
PXE_L2_STARTING_BLOCK=1 # L2 Block to start synching the PXE from (default: 1)
```

**P2P Bootstrap Node**

The P2P Bootstrap node is a standalone app whose purpose is to assist new P2P network participants in acquiring peers.

```sh
P2P_TCP_LISTEN_IP='0.0.0.0' # The IP Address on which to listen for connections.
P2P_TCP_LISTEN_PORT=40400 # The port on which to listen for connections.
PEER_ID_PRIVATE_KEY='' # The private key to be used by the peer for secure communications with other peers. This key will also be used to derive the Peer ID.
P2P_ANNOUNCE_HOSTNAME='' # The IPAddress/Hostname that other peers should use to connect to this node, this may be different to P2P_TCP_LISTEN_IP if e.g. the node is behind a NAT.
P2P_ANNOUNCE_PORT='' # The port that other peers should use to connect to this node, this may be different to P2P_TCP_LISTEN_PORT if e.g. the node is behind a NAT.
```

## Cheat Codes

To help with testing, the sandbox is shipped with a set of cheatcodes.

Cheatcodes allow you to change the time of the Aztec block, load certain state or more easily manipulate Ethereum instead of having to write dedicated RPC calls to anvil or hardhat.

You can find the cheat code reference [here](cheat_codes.md).

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
DelegatedOnContractArtifact
DelegatorContractArtifact
DocsExampleContractArtifact
EasyPrivateTokenContractArtifact
EasyPrivateVotingContractArtifact
EcdsaAccountContractArtifact
EscrowContractArtifact
FPCContractArtifact
GasTokenContractArtifact
ImportTestContractArtifact
InclusionProofsContractArtifact
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

You can see all of our example contracts in the monorepo [here](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts/contracts).
