---
title: CLI Reference
tags: [sandbox]
sidebar_position: 2
---
import { AztecTestnetVersion } from '@site/src/components/Snippets/general_snippets';

This reference guide provides documentation for the Aztec CLI commands (`aztec`) and their options. The CLI is a powerful tool for interacting with the Aztec network, managing accounts, deploying contracts, and more.

Consider using the [`aztec-wallet`](./cli_wallet_reference.md) for account related or interacting with an existing network (e.g. testnet).

## Overview

The Aztec CLI provides commands for:

- **Starting and Testing**: Starting the Aztec Sandbox and running tests
- **Account Management**: Creating, deploying, and managing Aztec accounts
- **Contract Operations**: Deploying, interacting with, and managing smart contracts
- **Network Information**: Querying node and network status
- **Transaction Management**: Sending, canceling, and querying transactions
- **Data Retrieval**: Accessing logs and contract data
- **Development Tools**: Profiling, debugging, and code generation
- **L1 Integration**: Managing L1 contracts and bridges
- **Governance**: Participating in protocol governance
- **P2P Network**: Managing peer-to-peer network configuration
- **Utilities**: Various helper commands for development

Each command section includes detailed options and examples of usage. The documentation is organized to help you quickly find the commands you need for your specific use case.

Note: Most commands accept a `--rpc-url` option to specify the Aztec node URL, and many accept fee-related options for gas limit and price configuration.

## Common Commands

- [`aztec get-node-info`](#get-node-info)
- [`aztec get-l1-addresses`](#get-l1-addresses)
- [`aztec get-block`](#get-block)
- [`aztec start --pxe`](#pxe-options)

Example usage:

```bash
# Start the sandbox
aztec start --sandbox

# Start with custom ports
aztec start --sandbox --port 8081

# Start specific components
aztec start --pxe

# Start with Ethereum options
aztec start --port 8081 --pxe --pxe.nodeUrl=$BOOTNODE --pxe.proverEnabled false --l1-chain-id 31337

# Start with storage options
aztec start --node --data-directory /path/to/data --data-store-map-size-kb 134217728 --registry-address <value>
```

## Starting

### start

Initiates various Aztec modules. It can be used to start individual components or the entire Aztec Sandbox.

```bash
aztec start [options]
```

Options:

#### Sandbox Options

- `-sb, --sandbox`: Starts the Aztec Sandbox.
- `--sandbox.noPXE [value]`: Do not expose PXE service on sandbox start. (default: false)

#### Network Options

- `--network <value>`: Network to run Aztec on, e.g. `alpha-testnet`. By default connects to sandbox (local network)

#### API Options

- `-p, --port <value>`: Port to run the Aztec Services on (default: 8080).
- `--admin-port <value>`: Port to run admin APIs of Aztec Services on (default: 8880).
- `--api-prefix <value>`: Prefix for API routes on any service that is started.

#### Ethereum Options

- `--l1-rpc-urls <value>`: List of URLs of Ethereum RPC nodes that services will connect to (comma separated) (default: http://localhost:8545).
- `--l1-chain-id <value>`: The L1 chain ID (default: 31337).
- `--l1-mnemonic <value>`: Mnemonic for L1 accounts. Will be used if no publisher private keys are provided (default: test test test test test test test test test test test junk).
- `--l1-consensus-host-urls <value>`: List of URLs of the Ethereum consensus nodes that services will connect to (comma separated).
- `--l1-consensus-host-api-keys <value>`: List of API keys for the corresponding Ethereum consensus nodes.
- `--l1-consensus-host-api-key-headers <value>`: List of API key headers for the corresponding Ethereum consensus nodes. If not set, the api key for the corresponding node will be appended to the URL as `?key=<api-key>`.

#### Storage Options

- `--data-directory <value>`: Where to store data for services. If not set, will store temporarily.
- `--data-store-map-size-kb <value>`: The maximum possible size of the data store DB in KB. Can be overridden by component-specific options.

#### L1 Contract Addresses

- `--rollup-address <value>`: The deployed L1 rollup contract address.
- `--registry-address <value>`: The deployed L1 registry contract address.
- `--inbox-address <value>`: The deployed L1 -> L2 inbox contract address.
- `--outbox-address <value>`: The deployed L2 -> L1 outbox contract address.
- `--fee-juice-address <value>`: The deployed L1 Fee Juice contract address.
- `--staking-asset-address <value>`: The deployed L1 Staking Asset contract address.
- `--fee-juice-portal-address <value>`: The deployed L1 Fee Juice portal contract address.

#### Aztec Node Options

- `--node`: Starts Aztec Node with options.
- `--node.archiver-url <value>`: URL for an archiver service.
- `--node.deploy-aztec-contracts`: Deploys L1 Aztec contracts before starting the node. Needs mnemonic or private key to be set.
- `--node.deploy-aztec-contracts-salt <value>`: Numeric salt for deploying L1 Aztec contracts before starting the node. Needs mnemonic or private key to be set. Implies --node.deploy-aztec-contracts.
- `--node.assume-proven-through-block-number <value>`: Cheats the rollup contract into assuming every block until this one is proven. Useful for speeding up bootstraps.
- `--node.publisher-private-key <value>`: Private key of account for publishing L1 contracts.
- `--node.world-state-block-check-interval-ms <value>`: Frequency in which to check for blocks in ms (default: 100).
- `--node.sync-mode <value>`: Set sync mode to `full` to always sync via L1, `snapshot` to download a snapshot if there is no local data, `force-snapshot` to download even if there is local data (default: snapshot).
- `--node.snapshots-url <value>`: Base URL for downloading snapshots for snapshot sync.

##### Example Usage

Here is an example of how to start a node that connects to the alpha-testnet.

```bash
aztec-up alpha-testnet

export DATA_DIRECTORY=/any/directory/to/store/node/data
export BLOB_SINK_URL=<blob-sink-url>
export LOG_LEVEL=info
export IP=Your_IP_address_here

aztec start --node --network alpha-testnet
    --l1-rpc-urls ...
    --l1-consensus-host-urls ...
    --l1-consensus-host-api-keys ...
    --l1-consensus-host-api-key-headers X...
    --p2p.p2pIp $IP
    --archiver
```

#### P2P Subsystem Options

- `--p2p-enabled [value]`: Enable P2P subsystem.
- `--p2p.block-check-interval-ms <value>`: The frequency in which to check for new L2 blocks (default: 100).
- `--p2p.debug-disable-colocation-penalty <value>`: DEBUG: Disable colocation penalty - NEVER set to true in production.
- `--p2p.peer-check-interval-ms <value>`: The frequency in which to check for new peers (default: 30000).
- `--p2p.l2-queue-size <value>`: Size of queue of L2 blocks to store (default: 1000).
- `--p2p.listen-address <value>`: The listen address. ipv4 address (default: 0.0.0.0).
- `--p2p.p2p-port <value>`: The port for the P2P service (default: 40400).
- `--p2p.p2p-ip <value>`: The IP address for the P2P service. ipv4 address.
- `--p2p.peer-id-private-key <value>`: An optional peer id private key. If blank, will generate a random key.
- `--p2p.peer-id-private-key-path <value>`: An optional path to store generated peer id private keys.
- `--p2p.bootstrap-nodes <value>`: A list of bootstrap peer ENRs to connect to. Separated by commas.
- `--p2p.bootstrap-node-enr-version-check <value>`: Whether to check the version of the bootstrap node ENR.
- `--p2p.bootstrap-nodes-as-full-peers <value>`: Whether to consider our configured bootnodes as full peers.
- `--p2p.max-peer-count <value>`: The maximum number of peers to connect to (default: 100).
- `--p2p.query-for-ip <value>`: If announceUdpAddress or announceTcpAddress are not provided, query for the IP address of the machine. Default is false.
- `--p2p.keep-proven-txs-in-pool-for <value>`: How many blocks have to pass after a block is proven before its txs are deleted (zero to delete immediately once proven).
- `--p2p.keep-attestations-in-pool-for <value>`: How many slots to keep attestations for (default: 96).
- `--p2p.gossipsub-interval <value>`: The interval of the gossipsub heartbeat to perform maintenance tasks (default: 700).
- `--p2p.gossipsub-d <value>`: The D parameter for the gossipsub protocol (default: 8).
- `--p2p.gossipsub-dlo <value>`: The Dlo parameter for the gossipsub protocol (default: 4).
- `--p2p.gossipsub-dhi <value>`: The Dhi parameter for the gossipsub protocol (default: 12).
- `--p2p.gossipsub-dlazy <value>`: The Dlazy parameter for the gossipsub protocol (default: 8).
- `--p2p.gossipsub-flood-publish <value>`: Whether to flood publish messages. - For testing purposes only (default: true).
- `--p2p.gossipsub-mcache-length <value>`: The number of gossipsub interval message cache windows to keep (default: 6).
- `--p2p.gossipsub-mcache-gossip <value>`: How many message cache windows to include when gossiping with other pears (default: 3).
- `--p2p.gossipsub-tx-topic-weight <value>`: The weight of the tx topic for the gossipsub protocol (default: 1).
- `--p2p.gossipsub-tx-invalid-message-deliveries-weight <value>`: The weight of the tx invalid message deliveries for the gossipsub protocol (default: -20).
- `--p2p.gossipsub-tx-invalid-message-deliveries-decay <value>`: Determines how quickly the penalty for invalid message deliveries decays over time. Between 0 and 1 (default: 0.5).
- `--p2p.peer-penalty-values <value>`: The values for the peer scoring system. Passed as a comma separated list of values in order: low, mid, high tolerance errors (default: 2,10,50).
- `--p2p.double-spend-severe-peer-penalty-window <value>`: The "age" (in L2 blocks) of a tx after which we heavily penalize a peer for sending it (default: 30).
- `--p2p.block-request-batch-size <value>`: The number of blocks to fetch in a single batch (default: 20).
- `--p2p.archived-tx-limit <value>`: The number of transactions that will be archived. If the limit is set to 0 then archiving will be disabled.
- `--p2p.trusted-peers <value>`: A list of trusted peers ENRs. Separated by commas.
- `--p2p.p2p-store-map-size-kb <value>`: The maximum possible size of the P2P DB in KB. Overwrites the general dataStoreMapSizeKB.
- `--p2p.tx-public-setup-allow-list <value>`: The list of functions calls allowed to run in setup.
- `--p2p.max-tx-pool-size <value>`: The maximum cumulative tx size of pending txs (in bytes) before evicting lower priority txs (default: 100000000).
- `--p2p.overall-request-timeout-ms <value>`: The overall timeout for a request response operation (default: 4000).
- `--p2p.individual-request-timeout-ms <value>`: The timeout for an individual request response peer interaction (default: 2000).
- `--p2p.rollup-version <value>`: The version of the rollup.

#### Telemetry Options

- `--tel.metrics-collector-url <value>`: The URL of the telemetry collector for metrics.
- `--tel.traces-collector-url <value>`: The URL of the telemetry collector for traces.
- `--tel.logs-collector-url <value>`: The URL of the telemetry collector for logs.
- `--tel.otel-collect-interval-ms <value>`: The interval at which to collect metrics (default: 60000).
- `--tel.otel-export-timeout-ms <value>`: The timeout for exporting metrics (default: 30000).
- `--tel.otel-exclude-metrics <value>`: A list of metric prefixes to exclude from export.

#### PXE Options

- `--pxe`: Starts Aztec PXE with options.
- `--pxe.data-store-map-size-kb <value>`: DB mapping size to be applied to all key/value stores (default: 134217728).
- `--pxe.rollup-version <value>`: The version of the rollup.
- `--pxe.l2-block-batch-size <value>`: Maximum amount of blocks to pull from the stream in one request when synchronizing (default: 200).
- `--pxe.bb-binary-path <value>`: Path to the BB binary.
- `--pxe.bb-working-directory <value>`: Working directory for the BB binary.
- `--pxe.bb-skip-cleanup <value>`: True to skip cleanup of temporary files for debugging purposes.
- `--pxe.prover-enabled <value>`: Enable real proofs (default: true).
- `--pxe.network <value>`: External Aztec network to connect to (e.g. devnet).
- `--pxe.api-key <value>`: API Key required by the external network's node.
- `--pxe.node-url <value>`: Custom Aztec Node URL to connect to.

##### Example Usage

```bash
aztec start --port 8081 --pxe --pxe.nodeUrl=$BOOTNODE --pxe.proverEnabled true --l1-chain-id $L1_CHAIN_ID
```

#### Archiver Options

- `--archiver`: Starts Aztec Archiver with options.
- `--archiver.blob-sink-url <value>`: The URL of the blob sink.
- `--archiver.archive-api-url <value>`: The URL of the archive API.
- `--archiver.archiver-polling-interval-ms <value>`: The polling interval in ms for retrieving new L2 blocks and encrypted logs (default: 500).
- `--archiver.archiver-batch-size <value>`: The number of L2 blocks the archiver will attempt to download at a time (default: 100).
- `--archiver.max-logs <value>`: The max number of logs that can be obtained in 1 "getPublicLogs" call (default: 1000).
- `--archiver.archiver-store-map-size-kb <value>`: The maximum possible size of the archiver DB in KB. Overwrites the general dataStoreMapSizeKB.
- `--archiver.rollup-version <value>`: The version of the rollup.
- `--archiver.viem-polling-interval-ms <value>`: The polling interval viem uses in ms (default: 1000).
- `--archiver.ethereum-slot-duration <value>`: How many seconds an L1 slot lasts (default: 12).
- `--archiver.aztec-slot-duration <value>`: How many seconds an L2 slots lasts (must be multiple of ethereum slot duration) (default: 24).
- `--archiver.aztec-epoch-duration <value>`: How many L2 slots an epoch lasts (maximum AZTEC_MAX_EPOCH_DURATION) (default: 16).
- `--archiver.aztec-target-committee-size <value>`: The target validator committee size (default: 48).
- `--archiver.aztec-proof-submission-window <value>`: The number of L2 slots that a proof for an epoch can be submitted in, starting from the beginning of the epoch (default: 31).
- `--archiver.minimum-stake <value>`: The minimum stake for a validator (default: 100000000000000000000).
- `--archiver.slashing-quorum <value>`: The slashing quorum (default: 6).
- `--archiver.slashing-round-size <value>`: The slashing round size (default: 10).
- `--archiver.governance-proposer-quorum <value>`: The governance proposing quorum (default: 51).
- `--archiver.governance-proposer-round-size <value>`: The governance proposing round size (default: 100).
- `--archiver.mana-target <value>`: The mana target for the rollup (default: 10000000000).
- `--archiver.proving-cost-per-mana <value>`: The proving cost per mana (default: 100).
- `--archiver.gas-limit-buffer-percentage <value>`: How much to increase calculated gas limit by (percentage) (default: 20).
- `--archiver.max-gwei <value>`: Maximum gas price in gwei (default: 500).
- `--archiver.max-blob-gwei <value>`: Maximum blob fee per gas in gwei (default: 1500).
- `--archiver.priority-fee-bump-percentage <value>`: How much to increase priority fee by each attempt (percentage) (default: 20).
- `--archiver.priority-fee-retry-bump-percentage <value>`: How much to increase priority fee by each retry attempt (percentage) (default: 50).
- `--archiver.fixed-priority-fee-per-gas <value>`: Fixed priority fee per gas in Gwei. Overrides any priority fee bump percentage.
- `--archiver.max-attempts <value>`: Maximum number of speed-up attempts (default: 3).
- `--archiver.check-interval-ms <value>`: How often to check tx status (default: 1000).
- `--archiver.stall-time-ms <value>`: How long before considering tx stalled (default: 45000).
- `--archiver.tx-timeout-ms <value>`: How long to wait for a tx to be mined before giving up. Set to 0 to disable (default: 300000).
- `--archiver.tx-propagation-max-query-attempts <value>`: How many attempts will be done to get a tx after it was sent (default: 3).

#### Sequencer Options

- `-n, --node [options]`: Starts the Aztec Node with specified options.
- `-px, --pxe [options]`: Starts the PXE (Private eXecution Environment) with specified options.
- `-a, --archiver [options]`: Starts the Archiver with specified options.
- `-s, --sequencer [options]`: Starts the Sequencer with specified options.
- `-r, --prover [options]`: Starts the Prover Agent with specified options.
- `-o, --prover-node [options]`: Starts the Prover Node with specified options.
- `-p2p, --p2p-bootstrap [options]`: Starts the P2P Bootstrap node with specified options.
- `-t, --txe [options]`: Starts the TXE (Transaction Execution Environment) with specified options.
- `--faucet [options]`: Starts the Aztec faucet service with specified options.
- `--sequencer.validator-private-key <value>`: The private key of the validator participating in attestation duties.
- `--sequencer.disable-validator <value>`: Do not run the validator.
- `--sequencer.attestation-polling-interval-ms <value>`: Interval between polling for new attestations (default: 200).
- `--sequencer.validator-reexecute <value>`: Re-execute transactions before attesting (default: true).
- `--sequencer.transaction-polling-interval-ms <value>`: The number of ms to wait between polling for pending txs (default: 500).
- `--sequencer.max-txs-per-block <value>`: The maximum number of txs to include in a block (default: 32).
- `--sequencer.min-txs-per-block <value>`: The minimum number of txs to include in a block (default: 1).
- `--sequencer.max-l2-block-gas <value>`: The maximum L2 block gas (default: 10000000000).
- `--sequencer.max-da-block-gas <value>`: The maximum DA block gas (default: 10000000000).
- `--sequencer.coinbase <value>`: Recipient of block reward.
- `--sequencer.fee-recipient <value>`: Address to receive fees.
- `--sequencer.acvm-working-directory <value>`: The working directory to use for simulation/proving.
- `--sequencer.acvm-binary-path <value>`: The path to the ACVM binary.
- `--sequencer.max-block-size-in-bytes <value>`: Max block size (default: 1048576).
- `--sequencer.enforce-time-table <value>`: Whether to enforce the time table when building blocks (default: true).
- `--sequencer.governance-proposer-payload <value>`: The address of the payload for the governanceProposer (default: 0x0000000000000000000000000000000000000000).
- `--sequencer.max-l1-tx-inclusion-time-into-slot <value>`: How many seconds into an L1 slot we can still send a tx and get it mined.
- `--sequencer.tx-public-setup-allow-list <value>`: The list of functions calls allowed to run in setup.
- `--sequencer.viem-polling-interval-ms <value>`: The polling interval viem uses in ms (default: 1000).
- `--sequencer.custom-forwarder-contract-address <value>`: The address of the custom forwarder contract (default: 0x0000000000000000000000000000000000000000).
- `--sequencer.publisher-private-key <value>`: The private key to be used by the publisher (default: 0x0000000000000000000000000000000000000000000000000000000000000000).
- `--sequencer.l1-publish-retry-interval-ms <value>`: The interval to wait between publish retries (default: 1000).
- `--sequencer.gas-limit-buffer-percentage <value>`: How much to increase calculated gas limit by (percentage) (default: 20).
- `--sequencer.max-gwei <value>`: Maximum gas price in gwei (default: 500).
- `--sequencer.max-blob-gwei <value>`: Maximum blob fee per gas in gwei (default: 1500).
- `--sequencer.priority-fee-bump-percentage <value>`: How much to increase priority fee by each attempt (percentage) (default: 20).
- `--sequencer.priority-fee-retry-bump-percentage <value>`: How much to increase priority fee by each retry attempt (percentage) (default: 50).
- `--sequencer.fixed-priority-fee-per-gas <value>`: Fixed priority fee per gas in Gwei. Overrides any priority fee bump percentage.
- `--sequencer.max-attempts <value>`: Maximum number of speed-up attempts (default: 3).
- `--sequencer.check-interval-ms <value>`: How often to check tx status (default: 1000).
- `--sequencer.stall-time-ms <value>`: How long before considering tx stalled (default: 45000).
- `--sequencer.tx-timeout-ms <value>`: How long to wait for a tx to be mined before giving up. Set to 0 to disable (default: 300000).
- `--sequencer.tx-propagation-max-query-attempts <value>`: How many attempts will be done to get a tx after it was sent (default: 3).
- `--sequencer.blob-sink-url <value>`: The URL of the blob sink.
- `--sequencer.archive-api-url <value>`: The URL of the archive API.
- `--sequencer.rollup-version <value>`: The version of the rollup.
- `--sequencer.ethereum-slot-duration <value>`: How many seconds an L1 slot lasts (default: 12).
- `--sequencer.aztec-slot-duration <value>`: How many seconds an L2 slots lasts (must be multiple of ethereum slot duration) (default: 24).
- `--sequencer.aztec-epoch-duration <value>`: How many L2 slots an epoch lasts (maximum AZTEC_MAX_EPOCH_DURATION) (default: 16).
- `--sequencer.aztec-proof-submission-window <value>`: The number of L2 slots that a proof for an epoch can be submitted in, starting from the beginning of the epoch (default: 31).

#### Example Usage

```bash
aztec start --network alpha-testnet --l1-rpc-urls https://example.com --l1-consensus-host-urls https://example.com --sequencer.blobSinkUrl http://34.82.117.158:5052  --sequencer.validatorPrivateKey 0xYourPrivateKey --sequencer.coinbase 0xYourAddress --p2p.p2pIp 999.99.999.99
```

#### Blob Sink Options

- `--blob-sink`: Starts Aztec Blob Sink with options.
- `--blob-sink.port <value>`: The port to run the blob sink server on.
- `--blob-sink.archive-api-url <value>`: The URL of the archive API.
- `--blob-sink.data-store-map-size-kb <value>`: DB mapping size to be applied to all key/value stores (default: 134217728).
- `--blob-sink.rollup-version <value>`: The version of the rollup.
- `--blob-sink.viem-polling-interval-ms <value>`: The polling interval viem uses in ms (default: 1000).

#### Prover Node Options

- `--prover-node`: Starts Aztec Prover Node with options.
- `--prover-node.archiver-url <value>`: URL for an archiver service.
- `--prover-node.acvm-working-directory <value>`: The working directory to use for simulation/proving.
- `--prover-node.acvm-binary-path <value>`: The path to the ACVM binary.
- `--prover-node.bb-working-directory <value>`: The working directory to use for proving.
- `--prover-node.bb-binary-path <value>`: The path to the bb binary.
- `--prover-node.bb-skip-cleanup <value>`: Whether to skip cleanup of bb temporary files.
- `--prover-node.node-url <value>`: The URL to the Aztec node to take proving jobs from.
- `--prover-node.prover-id <value>`: Hex value that identifies the prover. Defaults to the address used for submitting proofs if not set.
- `--prover-node.failed-proof-store <value>`: Store for failed proof inputs. Google cloud storage is only supported at the moment. Set this value as gs://bucket-name/path/to/store.
- `--prover-node.world-state-block-check-interval-ms <value>`: The frequency in which to check (default: 100).
- `--prover-node.world-state-proven-blocks-only <value>`: Whether to follow only the proven chain.
- `--prover-node.world-state-block-request-batch-size <value>`: Size of the batch for each get-blocks request from the synchronizer to the archiver.
- `--prover-node.world-state-db-map-size-kb <value>`: The maximum possible size of the world state DB in KB. Overwrites the general dataStoreMapSizeKB.
- `--prover-node.world-state-data-directory <value>`: Optional directory for the world state database.
- `--prover-node.world-state-block-history <value>`: The number of historic blocks to maintain. Values less than 1 mean all history is maintained (default: 64).
- `--prover-node.l1-publish-retry-interval-ms <value>`: The interval to wait between publish retries (default: 1000).
- `--prover-node.custom-forwarder-contract-address <value>`: The address of the custom forwarder contract (default: 0x0000000000000000000000000000000000000000).
- `--prover-node.publisher-private-key <value>`: The private key to be used by the publisher (default: 0x0000000000000000000000000000000000000000000000000000000000000000).
- `--prover-node.prover-coordination-node-url <value>`: The URL of the tx provider node.
- `--prover-node.prover-node-max-pending-jobs <value>`: The maximum number of pending jobs for the prover node (default: 10).
- `--prover-node.prover-node-polling-interval-ms <value>`: The interval in milliseconds to poll for new jobs (default: 1000).
- `--prover-node.prover-node-max-parallel-blocks-per-epoch <value>`: The Maximum number of blocks to process in parallel while proving an epoch (default: 32).
- `--prover-node.tx-gathering-timeout-ms <value>`: The maximum amount of time to wait for tx data to be available (default: 60000).
- `--prover-node.tx-gathering-interval-ms <value>`: How often to check that tx data is available (default: 1000).
- `--prover-node.tx-gathering-max-parallel-requests <value>`: How many txs to load up a time (default: 100).
- `--prover-node.test-accounts <value>`: Whether to populate the genesis state with initial fee juice for the test accounts.
- `--prover-node.sponsored-fpc <value>`: Whether to populate the genesis state with initial fee juice for the sponsored FPC.
- `--prover-node.sync-mode <value>`: Set sync mode to `full` to always sync via L1, `snapshot` to download a snapshot if there is no local data, `force-snapshot` to download even if there is local data (default: snapshot).
- `--prover-node.snapshots-url <value>`: Base URL for snapshots index.

#### Prover Broker Options

- `--prover-broker`: Starts Aztec proving job broker.
- `--prover-broker.prover-broker-job-timeout-ms <value>`: Jobs are retried if not kept alive for this long (default: 30000).
- `--prover-broker.prover-broker-poll-interval-ms <value>`: The interval to check job health status (default: 1000).
- `--prover-broker.prover-broker-job-max-retries <value>`: If starting a prover broker locally, the max number of retries per proving job (default: 3).
- `--prover-broker.prover-broker-batch-size <value>`: The prover broker writes jobs to disk in batches (default: 100).
- `--prover-broker.prover-broker-batch-interval-ms <value>`: How often to flush batches to disk (default: 50).
- `--prover-broker.prover-broker-max-epochs-to-keep-results-for <value>`: The maximum number of epochs to keep results for (default: 1).
- `--prover-broker.prover-broker-store-map-size-kb <value>`: The size of the prover broker's database. Will override the dataStoreMapSizeKB if set.
- `--prover-broker.data-store-map-size-kb <value>`: DB mapping size to be applied to all key/value stores (default: 134217728).
- `--prover-broker.viem-polling-interval-ms <value>`: The polling interval viem uses in ms (default: 1000).
- `--prover-broker.rollup-version <value>`: The version of the rollup.

#### Prover Agent Options

- `--prover-agent`: Starts Aztec Prover Agent with options.
- `--prover-agent.prover-agent-count <value>`: Whether this prover has a local prover agent (default: 1).
- `--prover-agent.prover-agent-poll-interval-ms <value>`: The interval agents poll for jobs at (default: 100).
- `--prover-agent.prover-agent-proof-types <value>`: The types of proofs the prover agent can generate.
- `--prover-agent.prover-broker-url <value>`: The URL where this agent takes jobs from.
- `--prover-agent.real-proofs <value>`: Whether to construct real proofs (default: true).
- `--prover-agent.prover-test-delay-type <value>`: The type of artificial delay to introduce (default: fixed).
- `--prover-agent.prover-test-delay-ms <value>`: Artificial delay to introduce to all operations to the test prover.
- `--prover-agent.prover-test-delay-factor <value>`: If using realistic delays, what percentage of realistic times to apply (default: 1).

#### P2P Bootstrap Options

- `--p2p-bootstrap`: Starts Aztec P2P Bootstrap with options.
- `--p2p-bootstrap.peer-id-private-key-path <value>`: An optional path to store generated peer id private keys.
- `--p2p-bootstrap.data-store-map-size-kb <value>`: DB mapping size to be applied to all key/value stores (default: 134217728).

#### Bot Options

- `--bot`: Starts Aztec Bot with options.
- `--bot.node-url <value>`: The URL to the Aztec node to check for tx pool status.
- `--bot.node-admin-url <value>`: The URL to the Aztec node admin API to force-flush txs if configured.
- `--bot.pxe-url <value>`: URL to the PXE for sending txs, or undefined if an in-proc PXE is used.
- `--bot.l1-mnemonic <value>`: The mnemonic for the account to bridge fee juice from L1.
- `--bot.l1-private-key <value>`: The private key for the account to bridge fee juice from L1.
- `--bot.sender-private-key <value>`: Signing private key for the sender account.
- `--bot.sender-salt <value>`: The salt to use to deploys the sender account.
- `--bot.recipient-encryption-secret <value>`: Encryption secret for a recipient account (default: 0x00000000000000000000000000000000000000000000000000000000cafecafe).
- `--bot.token-salt <value>`: Salt for the token contract deployment (default: 0x0000000000000000000000000000000000000000000000000000000000000001).
- `--bot.tx-interval-seconds <value>`: Every how many seconds should a new tx be sent (default: 60).
- `--bot.private-transfers-per-tx <value>`: How many private token transfers are executed per tx (default: 1).
- `--bot.public-transfers-per-tx <value>`: How many public token transfers are executed per tx (default: 1).
- `--bot.fee-payment-method <value>`: How to handle fee payments. (Options: fee_juice) (default: fee_juice).
- `--bot.no-start <value>`: True to not automatically setup or start the bot on initialization.
- `--bot.tx-mined-wait-seconds <value>`: How long to wait for a tx to be mined before reporting an error (default: 180).
- `--bot.follow-chain <value>`: Which chain the bot follows (default: NONE).
- `--bot.max-pending-txs <value>`: Do not send a tx if the node's tx pool already has this many pending txs (default: 128).
- `--bot.flush-setup-transactions <value>`: Make a request for the sequencer to build a block after each setup transaction.
- `--bot.skip-public-simulation <value>`: Whether to skip public simulation of txs before sending them.
- `--bot.l2-gas-limit <value>`: L2 gas limit for the tx (empty to have the bot trigger an estimate gas).
- `--bot.da-gas-limit <value>`: DA gas limit for the tx (empty to have the bot trigger an estimate gas).
- `--bot.contract <value>`: Token contract to use (default: TokenContract).
- `--bot.max-consecutive-errors <value>`: The maximum number of consecutive errors before the bot shuts down.
- `--bot.stop-when-unhealthy <value>`: Stops the bot if service becomes unhealthy.
- `--bot.amm-txs <value>`: Deploy an AMM and send swaps to it.

#### TXE Options

- `--txe`: Starts Aztec TXE with options.

#### Faucet Options

- `--faucet`: Starts the Aztec faucet.
- `--faucet.api-server`: Starts a simple HTTP server to access the faucet (default: true).
- `--faucet.api-server-port <value>`: The port on which to start the api server on (default: 8080).
- `--faucet.viem-polling-interval-ms <value>`: The polling interval viem uses in ms (default: 1000).
- `--faucet.l1-mnemonic <value>`: The mnemonic for the faucet account.
- `--faucet.mnemonic-account-index <value>`: The account to use.
- `--faucet.interval <value>`: How often the faucet can be dripped (default: 3600000).
- `--faucet.eth-amount <value>`: How much eth the faucet should drip per call (default: 1.0).
- `--faucet.l1-assets <value>`: Which other L1 assets the faucet is able to drip.

### Test

Runs tests written in contracts.

```bash
aztec test [options]
```

Options:

- `-e, --env <key=value>`: Set environment variables (can be used multiple times).
- `--no-tty`: Run the container without a TTY.
- `--rm`: Automatically remove the container when it exits.
- `-i, --interactive`: Keep STDIN open even if not attached.
- `-t, --tty`: Allocate a pseudo-TTY.

## Account Management

Consider using the [`aztec-wallet`](./cli_wallet_reference.md) for account management (or contract interaction) related actions, since it has a PXE internally and manages aliases to get you started quicker.

`aztec` cli requires you to have a PXE running already (either as part of when you run the sandbox by default or just a separate PXE)

### create-account

Creates an Aztec account for sending transactions.

```bash
aztec create-account [options]
```

Options:

- `--skip-initialization`: Skip initializing the account contract. Useful for publicly deploying an existing account.
- `--public-deploy`: Publicly deploys the account and registers the class if needed.
- `-p, --public-key <string>`: Public key that identifies a private signing key stored outside of the wallet. Used for ECDSA SSH accounts over the secp256r1 curve.
- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: PXE_URL)
- `-sk, --secret-key <string>`: Secret key for account. Uses random by default. (env: SECRET_KEY)
- `-t, --type <string>`: Type of account to create (choices: "schnorr", "ecdsasecp256r1", "ecdsasecp256r1ssh", "ecdsasecp256k1", default: "schnorr")
- `--register-only`: Just register the account on the PXE. Do not deploy or initialize the account contract.
- `--json`: Emit output as json
- `--no-wait`: Skip waiting for the contract to be deployed. Print the hash of deployment transaction
- `--payment <options>`: Fee payment method and arguments.
  Parameters:
  - `method`: Valid values: "fee_juice", "fpc-public", "fpc-private", "fpc-sponsored" Default: fee_juice
  - `feePayer`: The account paying the fee.
  - `asset`: The asset used for fee payment. Required for "fpc-public" and "fpc-private".
  - `fpc`: The FPC contract that pays in fee juice. Not required for the "fee_juice" method.
  - `claim`: Whether to use a previously stored claim to bridge fee juice.
  - `claimSecret`: The secret to claim fee juice on L1.
  - `claimAmount`: The amount of fee juice to be claimed.
  - `messageLeafIndex`: The index of the claim in the l1toL2Message tree.
  - `feeRecipient`: Recipient of the fee.
  - Format: --payment method=name,feePayer=address,asset=address ...
- `--gas-limits <da=100,l2=100,teardownDA=10,teardownL2=10>`: Gas limits for the tx.
- `--max-fees-per-gas <da=100,l2=100>`: Maximum fees per gas unit for DA and L2 computation.
- `--max-priority-fees-per-gas <da=0,l2=0>`: Maximum priority fees per gas unit for DA and L2 computation.
- `--no-estimate-gas`: Whether to automatically estimate gas limits for the tx.
- `--estimate-gas-only`: Only report gas estimation for the tx, do not send it.

### deploy-account

Deploys an already registered aztec account that can be used for sending transactions.

```bash
aztec deploy-account [options]
```

Options:

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: PXE_URL)
- `--json`: Emit output as json
- `--no-wait`: Skip waiting for the contract to be deployed. Print the hash of deployment transaction
- `--register-class`: Register the contract class (useful for when the contract class has not been deployed yet).
- `--payment <options>`: Fee payment method and arguments.
  Parameters:
  - `method`: Valid values: "fee_juice", "fpc-public", "fpc-private", "fpc-sponsored" Default: fee_juice
  - `feePayer`: The account paying the fee.
  - `asset`: The asset used for fee payment. Required for "fpc-public" and "fpc-private".
  - `fpc`: The FPC contract that pays in fee juice. Not required for the "fee_juice" method.
  - `claim`: Whether to use a previously stored claim to bridge fee juice.
  - `claimSecret`: The secret to claim fee juice on L1.
  - `claimAmount`: The amount of fee juice to be claimed.
  - `messageLeafIndex`: The index of the claim in the l1toL2Message tree.
  - `feeRecipient`: Recipient of the fee.
  - Format: --payment method=name,feePayer=address,asset=address ...
- `--gas-limits <da=100,l2=100,teardownDA=10,teardownL2=10>`: Gas limits for the tx.
- `--max-fees-per-gas <da=100,l2=100>`: Maximum fees per gas unit for DA and L2 computation.
- `--max-priority-fees-per-gas <da=0,l2=0>`: Maximum priority fees per gas unit for DA and L2 computation.
- `--no-estimate-gas`: Whether to automatically estimate gas limits for the tx.
- `--estimate-gas-only`: Only report gas estimation for the tx, do not send it.

### get-accounts

Retrieves all Aztec accounts stored in the PXE.

```bash
aztec get-accounts [options]
```

Options:

- `--json`: Emit output as JSON.

### get-account

Retrieves an account given its Aztec address.

```bash
aztec get-account <address> [options]
```

Arguments:

- `address`: The Aztec address to get account for

Options:

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: PXE_URL)

### register-sender

Registers a sender's address in the wallet, so the note synching process will look for notes sent by them.

```bash
aztec register-sender [options] [address]
```

Arguments:

- `address`: The address of the sender to register

Options:

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: PXE_URL)

### create-authwit

Creates an authorization witness that can be privately sent to a caller so they can perform an action on behalf of the provided account.

```bash
aztec create-authwit [options] <functionName> <caller>
```

Arguments:

- `functionName`: Name of function to authorize
- `caller`: Account to be authorized to perform the action

Options:

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: PXE_URL)
- `--args [args...]`: Function arguments (default: [])
- `-ca, --contract-address <address>`: Aztec address of the contract.
- `-c, --contract-artifact <fileLocation>`: Path to a compiled Aztec contract's artifact in JSON format. If executed inside a nargo workspace, a package and contract name can be specified as package@contract
- `-sk, --secret-key <string>`: The sender's secret key (env: SECRET_KEY)

### authorize-action

Authorizes a public call on the caller, so they can perform an action on behalf of the provided account.

```bash
aztec authorize-action [options] <functionName> <caller>
```

Arguments:

- `functionName`: Name of function to authorize
- `caller`: Account to be authorized to perform the action

Options:

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: PXE_URL)
- `--args [args...]`: Function arguments (default: [])
- `-ca, --contract-address <address>`: Aztec address of the contract.
- `-c, --contract-artifact <fileLocation>`: Path to a compiled Aztec contract's artifact in JSON format. If executed inside a nargo workspace, a package and contract name can be specified as package@contract
- `-sk, --secret-key <string>`: The sender's secret key (env: SECRET_KEY)

## Contract Deployment and Interaction

### deploy

Deploys a compiled Aztec.nr contract to Aztec.

```bash
aztec deploy <artifact> [options]
```

Arguments:

- `artifact`: Path to a compiled Aztec contract's artifact in JSON format. If executed inside a nargo workspace, a package and contract name can be specified as package@contract

Options:

- `--init <string>`: The contract initializer function to call (default: "constructor").
- `--no-init`: Leave the contract uninitialized.
- `-a, --args <constructorArgs...>`: Contract constructor arguments.
- `-k, --public-key <string>`: Optional encryption public key for this address.
- `-s, --salt <hex string>`: Optional deployment salt for generating the deployment address.
- `-sk, --secret-key <string>`: The sender's secret key (env: SECRET_KEY)
- `--universal`: Do not mix the sender address into the deployment.
- `--json`: Emit output as JSON.
- `--no-wait`: Skip waiting for the contract deployment.
- `--no-class-registration`: Don't register this contract class.
- `--no-public-deployment`: Don't emit this contract's public bytecode.
- `--payment <options>`: Fee payment method and arguments.
  Parameters:
  - `method`: Valid values: "fee_juice", "fpc-public", "fpc-private", "fpc-sponsored" Default: fee_juice
  - `feePayer`: The account paying the fee.
  - `asset`: The asset used for fee payment. Required for "fpc-public" and "fpc-private".
  - `fpc`: The FPC contract that pays in fee juice. Not required for the "fee_juice" method.
  - `claim`: Whether to use a previously stored claim to bridge fee juice.
  - `claimSecret`: The secret to claim fee juice on L1.
  - `claimAmount`: The amount of fee juice to be claimed.
  - `messageLeafIndex`: The index of the claim in the l1toL2Message tree.
  - `feeRecipient`: Recipient of the fee.
  - Format: --payment method=name,feePayer=address,asset=address ...
- `--gas-limits <da=100,l2=100,teardownDA=10,teardownL2=10>`: Gas limits for the tx.
- `--max-fees-per-gas <da=100,l2=100>`: Maximum fees per gas unit for DA and L2 computation.
- `--max-priority-fees-per-gas <da=0,l2=0>`: Maximum priority fees per gas unit for DA and L2 computation.
- `--no-estimate-gas`: Whether to automatically estimate gas limits for the tx.
- `--estimate-gas-only`: Only report gas estimation for the tx, do not send it.

### send

Calls a function on an Aztec contract.

```bash
aztec send <functionName> [options]
```

Arguments:

- `functionName`: Name of function to execute

Options:

- `-a, --args [functionArgs...]`: Function arguments.
- `-c, --contract-artifact <fileLocation>`: Compiled Aztec.nr contract's ABI.
- `-ca, --contract-address <address>`: Aztec address of the contract.
- `-sk, --secret-key <string>`: The sender's secret key (env: SECRET_KEY)
- `--no-wait`: Print transaction hash without waiting for it to be mined.
- `--payment <options>`: Fee payment method and arguments.
  Parameters:
  - `method`: Valid values: "fee_juice", "fpc-public", "fpc-private", "fpc-sponsored" Default: fee_juice
  - `feePayer`: The account paying the fee.
  - `asset`: The asset used for fee payment. Required for "fpc-public" and "fpc-private".
  - `fpc`: The FPC contract that pays in fee juice. Not required for the "fee_juice" method.
  - `claim`: Whether to use a previously stored claim to bridge fee juice.
  - `claimSecret`: The secret to claim fee juice on L1.
  - `claimAmount`: The amount of fee juice to be claimed.
  - `messageLeafIndex`: The index of the claim in the l1toL2Message tree.
  - `feeRecipient`: Recipient of the fee.
  - Format: --payment method=name,feePayer=address,asset=address ...
- `--gas-limits <da=100,l2=100,teardownDA=10,teardownL2=10>`: Gas limits for the tx.
- `--max-fees-per-gas <da=100,l2=100>`: Maximum fees per gas unit for DA and L2 computation.
- `--max-priority-fees-per-gas <da=0,l2=0>`: Maximum priority fees per gas unit for DA and L2 computation.
- `--no-estimate-gas`: Whether to automatically estimate gas limits for the tx.
- `--estimate-gas-only`: Only report gas estimation for the tx, do not send it.

### simulate

Simulates the execution of a function on an Aztec contract.

```bash
aztec simulate <functionName> [options]
```

Arguments:

- `functionName`: Name of function to simulate

Options:

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: PXE_URL)
- `--args [args...]`: Function arguments (default: [])
- `-ca, --contract-address <address>`: Aztec address of the contract.
- `-c, --contract-artifact <fileLocation>`: Path to a compiled Aztec contract's artifact in JSON format. If executed
  inside a nargo workspace, a package and contract name can be specified as
- `-sk, --secret-key <string>`: The sender's secret key (env: SECRET_KEY)

### add-contract

Adds an existing contract to the PXE. This is useful if you have deployed a contract outside of the PXE and want to use it with the PXE.

```bash
aztec add-contract [options]
```

Required options:

- `-c, --contract-artifact <fileLocation>`: Compiled Aztec.nr contract's ABI.
- `-ca, --contract-address <address>`: Aztec address of the contract.
- `--init-hash <init hash>`: Initialization hash.

Optional:

- `--salt <salt>`: Optional deployment salt.
- `-p, --public-key <public key>`: Optional public key for this contract.
- `--portal-address <address>`: Optional address to a portal contract on L1.
- `--deployer-address <address>`: Optional address of the contract deployer.

### register-contract

Registers a contract in this wallet's PXE.

```bash
aztec register-contract [options] [address] [artifact]
```

Arguments:

- `address`: The address of the contract to register
- `artifact`: Path to a compiled Aztec contract's artifact in JSON format. If executed inside a nargo
  workspace, a package and contract name can be specified as package@contract

Options:

- `--init <string>`: The contract initializer function to call (default: "constructor")
- `-k, --public-key <string>`: Optional encryption public key for this address. Set this value only if this contract is
  expected to receive private notes, which will be encrypted using this public key.
- `-s, --salt <hex string>`: Optional deployment salt as a hex string for generating the deployment address.
- `--deployer <string>`: The address of the account that deployed the contract
- `--args [args...]`: Constructor arguments (default: [])

### inspect-contract

Shows a list of external callable functions for a contract.

```bash
aztec inspect-contract <contractArtifactFile>
```

Arguments:

- `contractArtifactFile`: A compiled Noir contract's artifact in JSON format or name of a contract artifact exported by
  @aztec/noir-contracts.js

### parse-parameter-struct

Helper for parsing an encoded string into a contract's parameter struct.

```bash
aztec parse-parameter-struct <encodedString> [options]
```

Arguments:

- `encodedString`: The encoded hex string

Required options:

- `-c, --contract-artifact <fileLocation>`: Compiled Aztec.nr contract's ABI.
- `-p, --parameter <parameterName>`: The name of the struct parameter to decode into.

## Network and Node Information

### get-node-info

Retrieves information about an Aztec node at a URL.

```bash
aztec get-node-info [options]
```

Options:

- `--node-url <string>`: URL of the node.
- `--json`: Emit output as JSON.

### get-pxe-info

Retrieves information about a PXE at a URL.

```bash
aztec get-pxe-info [options]
```

### block-number

Retrieves the current Aztec L2 block number.

```bash
aztec block-number [options]
```

### get-contract-data

Gets information about the Aztec contract deployed at the specified address.

```bash
aztec get-contract-data <contractAddress> [options]
```

Arguments:

- `contractAddress`: Aztec address of the contract.

Options:

- `-b, --include-bytecode`: Include the contract's public function bytecode, if any.

## Transaction and Block Querying

### get-tx

Retrieves the receipt for a specified transaction hash.

```bash
aztec get-tx <txHash> [options]
```

Arguments:

- `txHash`: A transaction hash to get the receipt for.

Options:

- `-u, --rpc-url <string>` URL of the PXE (default: "http://host.docker.internal:8080", env: PXE_URL)
- `-p, --page <number>` The page number to display (default: 1)
  `-s, --page-size <number>` The number of transactions to display per page (default: 10)
- `-h, --help` display help for command

### cancel-tx

Cancels a pending tx by reusing its nonce with a higher fee and an empty payload.

```bash
aztec cancel-tx [options] <txHash>
```

Arguments:

- `txHash`: A transaction hash to cancel.

Options:

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: PXE_URL)
- `-sk, --secret-key <string>`: The sender's secret key (env: SECRET_KEY)
- `--payment <options>`: Fee payment method and arguments.
  Parameters:
  - `method`: Valid values: "fee_juice", "fpc-public", "fpc-private", "fpc-sponsored" Default: fee_juice
  - `asset`: The asset used for fee payment. Required for "fpc-public" and "fpc-private".
  - `fpc`: The FPC contract that pays in fee juice. Not required for the "fee_juice" method.
  - `claim`: Whether to use a previously stored claim to bridge fee juice.
  - `claimSecret`: The secret to claim fee juice on L1.
  - `claimAmount`: The amount of fee juice to be claimed.
  - `messageLeafIndex`: The index of the claim in the l1toL2Message tree.
  - `feeRecipient`: Recipient of the fee.
  - Format: --payment method=name,asset=address,fpc=address ... (default: "method=fee_juice")
- `-i, --increased-fees <da=1,l2=1>`: The amounts by which the fees are increased (default: "feePerDaGas":"0x0000000000000000000000000000000000000000000000000000000000000001","feePerL2Gas":"0x0000000000000000000000000000000000000000000000000000000000000001")
- `--max-fees-per-gas <da=100,l2=100>`: Maximum fees per gas unit for DA and L2 computation.

### get-block

Retrieves information for a given block or the latest block.

```bash
aztec get-block [blockNumber] [options]
```

Arguments:

- `blockNumber`: Block height

Options:

- `-f, --follow`: Keep polling for new blocks.

## Logging and Data Retrieval

### get-logs

Retrieves unencrypted logs based on filter parameters.

```bash
aztec get-logs [options]
```

Options:

- `-tx, --tx-hash <txHash>`: Transaction hash to get the receipt for.
- `-fb, --from-block <blockNum>`: Initial block number for getting logs.
- `-tb, --to-block <blockNum>`: Up to which block to fetch logs.
- `-al --after-log <logId>`: ID of a log after which to fetch the logs.
- `-ca, --contract-address <address>`: Contract address to filter logs by.
- `--follow`: Keep polling for new logs until interrupted.

## Development and Debugging Tools

### flamegraph

Generates a flamegraph of the gate counts of a private function call.

```bash
[SERVE=1] aztec flamegraph <artifact_path> <function_name>
```

### codegen

Validates and generates an Aztec Contract ABI from Noir ABI.

```bash
aztec codegen [options] <noir-abi-path>
```

Arguments:

- `noir-abi-path`: Path to the Noir ABI or project dir.

Options:

- `-o, --outdir <path>`: Output folder for the generated code.
- `-f, --force`: Force code generation even when the contract has not changed.

### update

Updates Nodejs and Noir dependencies.

```bash
aztec update [projectPath] [options]
```

Arguments:

- `projectPath`: Path to the project directory (default: "/home/josh")

Options:

- `--contract [paths...]`: Paths to contracts to update dependencies.
- `--aztec-version <semver>`: The version to update Aztec packages to (default: latest).

### profile

Profiles a private function by counting the unconditional operations in its execution steps.

```bash
aztec profile [options] <functionName>
```

Arguments:

- `functionName`: Name of function to simulate

Options:

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: PXE_URL)
- `--args [args...]`: Function arguments (default: [])
- `-ca, --contract-address <address>`: Aztec address of the contract.
- `-c, --contract-artifact <fileLocation>`: Path to a compiled Aztec contract's artifact in JSON format. If executed inside a nargo workspace, a package and contract name can be specified as package@contract
- `--debug-execution-steps-dir <address>`: Directory to write execution step artifacts for bb profiling/debugging.
- `-sk, --secret-key <string>`: The sender's secret key (env: SECRET_KEY)

### generate-secret-and-hash

Generates an arbitrary secret (Fr), and its hash (using aztec-nr defaults).

```bash
aztec generate-secret-and-hash
```

## L1 Contract Management

### deploy-l1-contracts

Deploys all necessary Ethereum contracts for Aztec.

```bash
aztec deploy-l1-contracts [options]
```

Options:

- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated) (default: ["http://host.docker.internal:8545"], env: ETHEREUM_HOSTS)
- `-pk, --private-key <string>`: The private key to use for deployment
- `--validators <string>`: Comma separated list of validators
- `-m, --mnemonic <string>`: The mnemonic to use in deployment (default: "test test test test test test test test test test test junk")
- `-i, --mnemonic-index <number>`: The index of the mnemonic to use in deployment (default: 0)
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: L1_CHAIN_ID)
- `--salt <number>`: The optional salt to use in deployment
- `--json`: Output the contract addresses in JSON format
- `--test-accounts`: Populate genesis state with initial fee juice for test accounts
- `--sponsored-fpc`: Populate genesis state with a testing sponsored FPC contract
- `--accelerated-test-deployments`: Fire and forget deployment transactions, use in testing only (default: false)

### deploy-l1-verifier

Deploys the rollup verifier contract.

```bash
aztec deploy-l1-verifier [options]
```

Options:

- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated) (default: ["http://host.docker.internal:8545"], env: ETHEREUM_HOSTS)
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: L1_CHAIN_ID)
- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: PXE_URL)
- `--rollup-address <string>`: The address of the rollup contract (env: ROLLUP_CONTRACT_ADDRESS)
- `--l1-private-key <string>`: The L1 private key to use for deployment
- `-m, --mnemonic <string>`: The mnemonic to use in deployment (default: "test test test test test test test test test test test junk")
- `--verifier <verifier>`: Either mock or real (default: "real")

### deploy-new-rollup

Deploys a new rollup contract and adds it to the registry (if you are the owner).

```bash
aztec deploy-new-rollup [options]
```

Options:

- `-r, --registry-address <string>`: The address of the registry contract
- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated) (default: ["http://host.docker.internal:8545"], env: ETHEREUM_HOSTS)
- `-pk, --private-key <string>`: The private key to use for deployment
- `--validators <string>`: Comma separated list of validators
- `-m, --mnemonic <string>`: The mnemonic to use in deployment (default: "test test test test test test test test test test test junk")
- `-i, --mnemonic-index <number>`: The index of the mnemonic to use in deployment (default: 0)
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: L1_CHAIN_ID)
- `--salt <number>`: The optional salt to use in deployment
- `--json`: Output the contract addresses in JSON format
- `--test-accounts`: Populate genesis state with initial fee juice for test accounts
- `--sponsored-fpc`: Populate genesis state with a testing sponsored FPC contract

### get-l1-addresses

Gets the addresses of the L1 contracts.

```bash
aztec get-l1-addresses [options]
```

Options:

- `-r, --registry-address <string>`: The address of the registry contract
- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated) (default: ["http://host.docker.internal:8545"], env: ETHEREUM_HOSTS)
- `-v, --rollup-version <number>`: The version of the rollup
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: L1_CHAIN_ID)
- `--json`: Output the addresses in JSON format

### get-l1-balance

Gets the balance of an ERC token in L1 for the given Ethereum address.

```bash
aztec get-l1-balance [options] <who>
```

Arguments:

- `who`: Ethereum address to check.

Options:

- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated) (default: ["http://host.docker.internal:8545"], env: ETHEREUM_HOSTS)
- `-t, --token <string>`: The address of the token to check the balance of
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: L1_CHAIN_ID)
- `--json`: Output the balance in JSON format

### debug-rollup

Debugs the rollup contract.

```bash
aztec debug-rollup [options]
```

Options:

- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated) (default: ["http://host.docker.internal:8545"], env: ETHEREUM_HOSTS)
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: L1_CHAIN_ID)
- `--rollup <address>`: ethereum address of the rollup contract

### prune-rollup

Prunes the pending chain on the rollup contract.

```bash
aztec prune-rollup [options]
```

Options:

- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated) (default: ["http://host.docker.internal:8545"], env: ETHEREUM_HOSTS)
- `-pk, --private-key <string>`: The private key to use for deployment
- `-m, --mnemonic <string>`: The mnemonic to use in deployment (default: "test test test test test test test test test test test junk")
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: L1_CHAIN_ID)
- `--rollup <address>`: ethereum address of the rollup contract

## Governance Commands

### deposit-governance-tokens

Deposits governance tokens to the governance contract.

```bash
aztec deposit-governance-tokens [options]
```

Options:

- `-r, --registry-address <string>`: The address of the registry contract
- `--recipient <string>`: The recipient of the tokens
- `-a, --amount <string>`: The amount of tokens to deposit
- `--mint`: Mint the tokens on L1 (default: false)
- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated) (default: ["http://host.docker.internal:8545"], env: ETHEREUM_HOSTS)
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: L1_CHAIN_ID)
- `-p, --private-key <string>`: The private key to use to deposit
- `-m, --mnemonic <string>`: The mnemonic to use to deposit (default: "test test test test test test test test test test test junk")
- `-i, --mnemonic-index <number>`: The index of the mnemonic to use to deposit (default: 0)

### execute-governance-proposal

Executes a governance proposal.

```bash
aztec execute-governance-proposal [options]
```

Options:

- `-p, --proposal-id <string>`: The ID of the proposal
- `-r, --registry-address <string>`: The address of the registry contract
- `--wait <boolean>`: Whether to wait until the proposal is executable
- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated) (default: ["http://host.docker.internal:8545"], env: ETHEREUM_HOSTS)
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: L1_CHAIN_ID)
- `-pk, --private-key <string>`: The private key to use to vote
- `-m, --mnemonic <string>`: The mnemonic to use to vote (default: "test test test test test test test test test test test junk")
- `-i, --mnemonic-index <number>`: The index of the mnemonic to use to vote (default: 0)

### propose-with-lock

Makes a proposal to governance with a lock.

```bash
aztec propose-with-lock [options]
```

Options:

- `-r, --registry-address <string>`: The address of the registry contract
- `-p, --payload-address <string>`: The address of the payload contract
- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated) (default: ["http://host.docker.internal:8545"], env: ETHEREUM_HOSTS)
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: L1_CHAIN_ID)
- `-pk, --private-key <string>`: The private key to use to propose
- `-m, --mnemonic <string>`: The mnemonic to use to propose (default: "test test test test test test test test test test test junk")
- `-i, --mnemonic-index <number>`: The index of the mnemonic to use to propose (default: 0)
- `--json`: Output the proposal ID in JSON format

### vote-on-governance-proposal

Votes on a governance proposal.

```bash
aztec vote-on-governance-proposal [options]
```

Options:

- `-p, --proposal-id <string>`: The ID of the proposal
- `-a, --vote-amount <string>`: The amount of tokens to vote
- `--in-favor <boolean>`: Whether to vote in favor of the proposal. Use "yea" for true, any other value for false.
- `--wait <boolean>`: Whether to wait until the proposal is active
- `-r, --registry-address <string>`: The address of the registry contract
- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated) (default: ["http://host.docker.internal:8545"], env: ETHEREUM_HOSTS)
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: L1_CHAIN_ID)
- `-pk, --private-key <string>`: The private key to use to vote
- `-m, --mnemonic <string>`: The mnemonic to use to vote (default: "test test test test test test test test test test test junk")
- `-i, --mnemonic-index <number>`: The index of the mnemonic to use to vote (default: 0)

## L1-L2 Bridge Commands

### bridge-erc20

Bridges ERC20 tokens to L2.

```bash
aztec bridge-erc20 [options] <amount> <recipient>
```

Arguments:

- `amount`: The amount of Fee Juice to mint and bridge.
- `recipient`: Aztec address of the recipient.

Options:

- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated) (default: ["http://host.docker.internal:8545"], env: ETHEREUM_HOSTS)
- `-m, --mnemonic <string>`: The mnemonic to use for deriving the Ethereum address that will mint and bridge (default: "test test test test test test test test test test test junk")
- `--mint`: Mint the tokens on L1 (default: false)
- `--private`: If the bridge should use the private flow (default: false)
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: L1_CHAIN_ID)
- `-t, --token <string>`: The address of the token to bridge
- `-p, --portal <string>`: The address of the portal contract
- `-f, --faucet <string>`: The address of the faucet contract (only used if minting)
- `--l1-private-key <string>`: The private key to use for deployment
- `--json`: Output the claim in JSON format

### bridge-fee-juice

Mints L1 Fee Juice and bridges them to L2.

```bash
aztec bridge-fee-juice [options] <amount> <recipient>
```

Arguments:

- `amount`: The amount of Fee Juice to mint and bridge.
- `recipient`: Aztec address of the recipient.

Options:

- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated) (default: ["http://host.docker.internal:8545"])
- `-m, --mnemonic <string>`: The mnemonic to use for deriving the Ethereum address that will mint and bridge (default: "test test test test test test test test test test test junk")
- `--mint`: Mint the tokens on L1 (default: false)
- `--l1-private-key <string>`: The private key to the eth account bridging
- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: PXE_URL)
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: L1_CHAIN_ID)
- `--json`: Output the claim in JSON format
- `--no-wait`: Wait for the bridged funds to be available in L2, polling every 60 seconds
- `--interval <number>`: The polling interval in seconds for the bridged funds (default: "60")

### get-l1-to-l2-message-witness

Gets a L1 to L2 message witness.

```bash
aztec get-l1-to-l2-message-witness [options]
```

Options:

- `-ca, --contract-address <address>`: Aztec address of the contract.
- `--message-hash <messageHash>`: The L1 to L2 message hash.
- `--secret <secret>`: The secret used to claim the L1 to L2 message
- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: PXE_URL)

## P2P Network Commands

### generate-p2p-private-key

Generates a LibP2P peer private key.

```bash
aztec generate-p2p-private-key
```

### generate-bootnode-enr

Generates the encoded ENR record for a bootnode.

```bash
aztec generate-bootnode-enr [options] <privateKey> <p2pIp> <p2pPort>
```

### decode-enr

Decodes an ENR record.

```bash
aztec decode-enr [options] <enr>
```

Arguments:

- `enr`: The encoded ENR string

## Utility Commands

### generate-keys

Generates encryption and signing private keys.

```bash
aztec generate-keys [options]
```

Option:

- `-m, --mnemonic`: Optional mnemonic string for private key generation.

### example-contracts

Lists the example contracts available to deploy from @aztec/noir-contracts.js.

```bash
aztec example-contracts
```

### compute-selector

Computes a selector for a given function signature.

```bash
aztec compute-selector [options] <functionSignature>
```

Arguments:

- `functionSignature`: Function signature to compute selector for e.g. foo(Field)

### setup-protocol-contracts

Bootstrap the blockchain by initializing all the protocol contracts.

```bash
aztec setup-protocol-contracts [options]
```

Options:

- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: PXE_URL)
- `--testAccounts`: Deploy funded test accounts.
- `--sponsoredFPC`: Deploy a sponsored FPC.
- `--json`: Output the contract addresses in JSON format
- `--skipProofWait`: Don't wait for proofs to land.

### sequencers

Manages or queries registered sequencers on the L1 rollup contract.

```bash
aztec sequencers [options] <command> [who]
```

Arguments:

- `command`: Command to run: list, add, remove, who-next
- `who`: Who to add/remove

Options:

- `--l1-rpc-urls <string>`: List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated) (default: ["http://host.docker.internal:8545"])
- `-m, --mnemonic <string>`: The mnemonic for the sender of the tx (default: "test test test test test test test test test test test junk")
- `--block-number <number>`: Block number to query next sequencer for
- `-u, --rpc-url <string>`: URL of the PXE (default: "http://host.docker.internal:8080", env: PXE_URL)
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: L1_CHAIN_ID)

### import-test-accounts

Import test accounts from pxe.

```bash
aztec import-test-accounts [options]
```

### preload-crs

Preload the points data needed for proving and verifying.

```bash
aztec preload-crs
```

### get-canonical-sponsored-fpc-address

Gets the canonical SponsoredFPC address for current testnet running on the same version as this CLI.

```bash
aztec get-canonical-sponsored-fpc-address
```

### get-current-base-fee

Gets the current base fee.

```bash
aztec get-current-base-fee [options]
```
