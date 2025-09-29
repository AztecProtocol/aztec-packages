---
title: CLI Reference
description: Comprehensive reference for the Aztec command-line interface (CLI).
tags: [sandbox]
sidebar_position: 2
---

import { AztecTestnetVersion } from '@site/src/components/Snippets/general_snippets';

This reference guide provides documentation for the Aztec CLI commands (`aztec`) and their options. The CLI is a powerful tool for interacting with the Aztec network.

If you want to deploy contracts and manage accounts you will need to use [`aztec-wallet`](./cli_wallet_reference.md).

## Overview

The Aztec CLI provides commands for:

- **Starting and Testing**: Starting the Aztec Sandbox and running tests
- **Contract Operations**: Deploying, interacting with, and managing smart contracts
- **Network Information**: Querying node and network status
- **Data Retrieval**: Accessing logs and contract data
- **Development Tools**: Profiling, debugging, and code generation
- **L1 Integration**: Managing L1 contracts and bridges
- **Governance**: Participating in protocol governance
- **P2P Network**: Managing peer-to-peer network configuration
- **Utilities**: Various helper commands for development

Each command section includes detailed options and examples of usage. The documentation is organized to help you quickly find the commands you need for your specific use case.

Note: Most commands accept a `--node-url` option to specify the Aztec node URL, and many accept fee-related options for gas limit and price configuration.

## Common Commands

- [`aztec get-node-info`](#get-node-info)
- [`aztec get-l1-addresses`](#get-l1-addresses)
- [`aztec get-block`](#get-block)

Example usage:

```bash
# Start the sandbox
aztec start --sandbox

# Start with custom ports
aztec start --sandbox --port 8081

# Start specific components
aztec start --node

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

#### Misc Options

- `--network <value>`: Network to run Aztec on.
- `--auto-update <value>`: The auto update mode for this node (default: disabled).
- `--auto-update-url <value>`: Base URL to check for updates.
- `--sync-mode <value>`: Set sync mode to `full` to always sync via L1, `snapshot` to download a snapshot if there is no local data, `force-snapshot` to download even if there is local data (default: snapshot).
- `--snapshots-url <value>`: Base URL for snapshots index.

#### Sandbox Options

- `--sandbox`: Starts Aztec Sandbox.
- `--sandbox.noPXE`: Do not expose PXE service on sandbox start.
- `--sandbox.l1Mnemonic <value>`: Mnemonic for L1 accounts. Will be used (default: test test test test test test test test test test test junk).
- `--sandbox.deployAztecContractsSalt <value>`: Numeric salt for deploying L1 Aztec contracts before starting the sandbox. Needs mnemonic or private key to be set.

#### API Options

- `--port <value>`: Port to run the Aztec Services on (default: 8080).
- `--admin-port <value>`: Port to run admin APIs of Aztec Services on (default: 8880).
- `--api-prefix <value>`: Prefix for API routes on any service that is started.

#### Ethereum Options

- `--l1-chain-id <value>`: The chain ID of the ethereum host.
- `--l1-rpc-urls <value>`: List of URLs of Ethereum RPC nodes that services will connect to (comma separated).
- `--l1-consensus-host-urls <value>`: List of URLs of the Ethereum consensus nodes that services will connect to (comma separated).
- `--l1-consensus-host-api-keys <value>`: List of API keys for the corresponding L1 consensus clients, if needed. Added to the end of the corresponding URL as `?key=<api-key>` unless a header is defined.
- `--l1-consensus-host-api-key-headers <value>`: List of header names for the corresponding L1 consensus client API keys, if needed. Added to the corresponding request as `<api-key-header>: <api-key>`.

#### L1 Contract Addresses

- `--registry-address <value>`: The deployed L1 registry contract address.
- `--rollup-version <value>`: The version of the rollup.

#### Storage Options

- `--data-directory <value>`: Optional dir to store data. If omitted will store in memory.
- `--data-store-map-size-kb <value>`: The maximum possible size of a data store DB in KB. Can be overridden by component-specific options (default: 134217728).

#### World State Options

- `--world-state-data-directory <value>`: Optional directory for the world state database.
- `--world-state-db-map-size-kb <value>`: The maximum possible size of the world state DB in KB. Overwrites the general dataStoreMapSizeKB.
- `--world-state-block-history <value>`: The number of historic blocks to maintain. Values less than 1 mean all history is maintained (default: 64).

#### Aztec Node Options

- `--node`: Starts Aztec Node with options.

##### Example Usage

Here is an example of how to start a node that connects to the testnet.

```bash
aztec-up latest

export DATA_DIRECTORY=/any/directory/to/store/node/data
export BLOB_SINK_URL=<blob-sink-url>
export LOG_LEVEL=info
export IP=Your_IP_address_here

aztec start --node --network testnet
    --l1-rpc-urls ...
    --l1-consensus-host-urls ...
    --l1-consensus-host-api-keys ...
    --l1-consensus-host-api-key-headers X...
    --p2p.p2pIp $IP
    --archiver
```

##### Example Usage

```bash
aztec start --port 8081 --pxe --pxe.nodeUrl=$BOOTNODE --pxe.proverEnabled true --l1-chain-id $L1_CHAIN_ID
```

#### Archiver Options

- `--archiver`: Starts Aztec Archiver with options.
- `--archiver.blobSinkUrl <value>`: The URL of the blob sink.
- `--archiver.blobSinkMapSizeKb <value>`: The maximum possible size of the blob sink DB in KB. Overwrites the general dataStoreMapSizeKB.
- `--archiver.archiveApiUrl <value>`: The URL of the archive API.
- `--archiver.archiverPollingIntervalMS <value>`: The polling interval in ms for retrieving new L2 blocks and encrypted logs (default: 500).
- `--archiver.archiverBatchSize <value>`: The number of L2 blocks the archiver will attempt to download at a time (default: 100).
- `--archiver.maxLogs <value>`: The max number of logs that can be obtained in 1 "getPublicLogs" call (default: 1000).
- `--archiver.archiverStoreMapSizeKb <value>`: The maximum possible size of the archiver DB in KB. Overwrites the general dataStoreMapSizeKB.
- `--archiver.skipValidateBlockAttestations <value>`: Whether to skip validating block attestations (use only for testing).

#### Sequencer Options

- `--sequencer`: Starts Aztec Sequencer with options.
- `--sequencer.validatorPrivateKeys <value>`: List of private keys of the validators participating in attestation duties.
- `--sequencer.validatorAddresses <value>`: List of addresses of the validators to use with remote signers.
- `--sequencer.disableValidator <value>`: Do not run the validator.
- `--sequencer.disabledValidators <value>`: Temporarily disable these specific validator addresses.
- `--sequencer.attestationPollingIntervalMs <value>`: Interval between polling for new attestations (default: 200).
- `--sequencer.validatorReexecute <value>`: Re-execute transactions before attesting (default: true).
- `--sequencer.validatorReexecuteDeadlineMs <value>`: Will re-execute until this many milliseconds are left in the slot (default: 6000).
- `--sequencer.alwaysReexecuteBlockProposals <value>`: Whether to always reexecute block proposals, even for non-validator nodes (useful for monitoring network status).
- `--sequencer.transactionPollingIntervalMS <value>`: The number of ms to wait between polling for pending txs (default: 500).
- `--sequencer.maxTxsPerBlock <value>`: The maximum number of txs to include in a block (default: 32).
- `--sequencer.minTxsPerBlock <value>`: The minimum number of txs to include in a block (default: 1).
- `--sequencer.publishTxsWithProposals <value>`:  Whether to publish txs with proposals.
- `--sequencer.maxL2BlockGas <value>`: The maximum L2 block gas (default: 10000000000).
- `--sequencer.maxDABlockGas <value>`: The maximum DA block gas (default: 10000000000).
- `--sequencer.coinbase <value>`: Recipient of block reward.
- `--sequencer.feeRecipient <value>`: Address to receive fees.
- `--sequencer.acvmWorkingDirectory <value>`: The working directory to use for simulation/proving.
- `--sequencer.acvmBinaryPath <value>`: The path to the ACVM binary.
- `--sequencer.maxBlockSizeInBytes <value>`: Max block size (default: 1048576).
- `--sequencer.enforceTimeTable <value>`: Whether to enforce the time table when building blocks (default: true).
- `--sequencer.governanceProposerPayload <value>`: The address of the payload for the governanceProposer (default: 0x0000000000000000000000000000000000000000).
- `--sequencer.maxL1TxInclusionTimeIntoSlot <value>`: How many seconds into an L1 slot we can still send a tx and get it mined.
- `--sequencer.attestationPropagationTime <value>`: How many seconds it takes for proposals and attestations to travel across the p2p layer (one-way) (default: 2).
- `--sequencer.secondsBeforeInvalidatingBlockAsCommitteeMember <value>`: How many seconds to wait before trying to invalidate a block from the pending chain as a committee member (zero to never invalidate). The next proposer is expected to invalidate, so the committee acts as a fallback (default: 144).
- `--sequencer.secondsBeforeInvalidatingBlockAsNonCommitteeMember <value>`: How many seconds to wait before trying to invalidate a block from the pending chain as a non-committee member (zero to never invalidate). The next proposer is expected to invalidate, then the committee, so other sequencers act as a fallback (default: 432).
- `--sequencer.txPublicSetupAllowList <value>`: The list of functions calls allowed to run in setup.
- `--sequencer.keyStoreDirectory <value>`: Location of key store directory.
- `--sequencer.publisherPrivateKeys <value>`: The private keys to be used by the publisher.
- `--sequencer.publisherAddresses <value>`: The addresses of the publishers to use with remote signers.
- `--sequencer.l1PublishRetryIntervalMS <value>`: The interval to wait between publish retries (default: 1000).
- `--sequencer.publisherAllowInvalidStates <value>`: True to use publishers in invalid states (timed out, cancelled, etc) if no other is available.
- `--sequencer.blobSinkUrl <value>`: The URL of the blob sink.
- `--sequencer.archiveApiUrl <value>`: The URL of the archive API.

#### Example Usage

```bash
aztec start --network testnet --l1-rpc-urls https://example.com --l1-consensus-host-urls https://example.com --sequencer.blobSinkUrl http://34.82.117.158:5052  --sequencer.validatorPrivateKeys 0xYourPrivateKey --sequencer.coinbase 0xYourAddress --p2p.p2pIp 999.99.999.99
```

#### Blob Sink Options

- `--blob-sink`: Starts Aztec Blob Sink with options.
- `--blobSink.port <value>`: The port to run the blob sink server on.
- `--blobSink.blobSinkMapSizeKb <value>`: The maximum possible size of the blob sink DB in KB. Overwrites the general dataStoreMapSizeKB.
- `--blobSink.archiveApiUrl <value>`: The URL of the archive API.

#### Prover Node Options

- `--prover-node`: Starts Aztec Prover Node with options.
- `--proverNode.keystoreDirectory <value>`: Location of key store directory.
- `--proverNode.acvmWorkingDirectory <value>`: The working directory to use for simulation/proving.
- `--proverNode.acvmBinaryPath <value>`: The path to the ACVM binary.
- `--proverNode.bbWorkingDirectory <value>`: The working directory to use for proving.
- `--proverNode.bbBinaryPath <value>`: The path to the bb binary.
- `--proverNode.bbSkipCleanup <value>`: Whether to skip cleanup of bb temporary files.
- `--proverNode.numConcurrentIVCVerifiers <value>`: Max number of client IVC verifiers to run concurrently (default: 8).
- `--proverNode.bbIVCConcurrency <value>`: Number of threads to use for IVC verification (default: 1).
- `--proverNode.nodeUrl <value>`: The URL to the Aztec node to take proving jobs from.
- `--proverNode.proverId <value>`: Hex value that identifies the prover. Defaults to the address used for submitting proofs if not set.
- `--proverNode.failedProofStore <value>`: Store for failed proof inputs. Google cloud storage is only supported at the moment. Set this value as gs://bucket-name/path/to/store.
- `--proverNode.l1PublishRetryIntervalMS <value>`: The interval to wait between publish retries (default: 1000).
- `--proverNode.publisherAllowInvalidStates <value>`: True to use publishers in invalid states (timed out, cancelled, etc) if no other is available.
- `--proverNode.publisherPrivateKeys <value>`: The private keys to be used by the publisher.
- `--proverNode.publisherAddresses <value>`: The addresses of the publishers to use with remote signers.
- `--proverNode.proverNodeMaxPendingJobs <value>`: The maximum number of pending jobs for the prover node (default: 10).
- `--proverNode.proverNodePollingIntervalMs <value>`: The interval in milliseconds to poll for new jobs (default: 1000).
- `--proverNode.proverNodeMaxParallelBlocksPerEpoch <value>`: The Maximum number of blocks to process in parallel while proving an epoch (default: 32).
- `--proverNode.proverNodeFailedEpochStore <value>`: File store where to upload node state when an epoch fails to be proven.
- `--proverNode.proverNodeEpochProvingDelayMs <value>`: Optional delay in milliseconds to wait before proving a new epoch.
- `--proverNode.txGatheringIntervalMs <value>`: How often to check that tx data is available (default: 1000).
- `--proverNode.txGatheringBatchSize <value>`: How many transactions to gather from a node in a single request (default: 10).
- `--proverNode.txGatheringMaxParallelRequestsPerNode <value>`: How many tx requests to make in parallel to each node (default: 100).
- `--proverNode.txGatheringTimeoutMs <value>`: How long to wait for tx data to be available before giving up (default: 120000).

#### Prover Broker Options

- `--prover-broker`: Starts Aztec proving job broker.
- `--proverBroker.proverBrokerJobTimeoutMs <value>`: Jobs are retried if not kept alive for this long (default: 30000).
- `--proverBroker.proverBrokerPollIntervalMs <value>`: The interval to check job health status (default: 1000).
- `--proverBroker.proverBrokerJobMaxRetries <value>`: If starting a prover broker locally, the max number of retries per proving job (default: 3).
- `--proverBroker.proverBrokerBatchSize <value>`: The prover broker writes jobs to disk in batches (default: 100).
- `--proverBroker.proverBrokerBatchIntervalMs <value>`: How often to flush batches to disk (default: 50).
- `--proverBroker.proverBrokerMaxEpochsToKeepResultsFor <value>`: The maximum number of epochs to keep results for (default: 1).
- `--proverBroker.proverBrokerStoreMapSizeKb <value>`: The size of the prover broker's database. Will override the dataStoreMapSizeKB if set.

#### Prover Agent Options

- `--prover-agent`: Starts Aztec Prover Agent with options.
- `--proverAgent.proverAgentCount <value>`: Whether this prover has a local prover agent (default: 1).
- `--proverAgent.proverAgentPollIntervalMs <value>`: The interval agents poll for jobs at (default: 1000).
- `--proverAgent.proverAgentProofTypes <value>`: The types of proofs the prover agent can generate.
- `--proverAgent.proverBrokerUrl <value>`: The URL where this agent takes jobs from.
- `--proverAgent.realProofs <value>`: Whether to construct real proofs (default: true).
- `--proverAgent.proverTestDelayType <value>`: The type of artificial delay to introduce (default: fixed).
- `--proverAgent.proverTestDelayMs <value>`: Artificial delay to introduce to all operations to the test prover.
- `--proverAgent.proverTestDelayFactor <value>`: If using realistic delays, what percentage of realistic times to apply (default: 1).

#### P2P Subsystem Options

- `--p2p-enabled`: Enable P2P subsystem.
- `--p2p.p2pDiscoveryDisabled`: A flag dictating whether the P2P discovery system should be disabled.
- `--p2p.blockCheckIntervalMS <value>`: The frequency in which to check for new L2 blocks (default: 100).
- `--p2p.debugDisableColocationPenalty <value>`: DEBUG: Disable colocation penalty - NEVER set to true in production.
- `--p2p.peerCheckIntervalMS <value>`: The frequency in which to check for new peers (default: 30000).
- `--p2p.l2QueueSize <value>`: Size of queue of L2 blocks to store (default: 1000).
- `--p2p.listenAddress <value>`: The listen address. ipv4 address (default: 0.0.0.0).
- `--p2p.p2pPort <value>`: The port for the P2P service (default: 40400).
- `--p2p.p2pBroadcastPort <value>`: The port to broadcast the P2P service on (included in the node's ENR). Defaults to P2P_PORT.
- `--p2p.p2pIp <value>`: The IP address for the P2P service. ipv4 address.
- `--p2p.peerIdPrivateKey <value>`: An optional peer id private key. If blank, will generate a random key.
- `--p2p.peerIdPrivateKeyPath <value>`: An optional path to store generated peer id private keys.
- `--p2p.bootstrapNodes <value>`: A list of bootstrap peer ENRs to connect to. Separated by commas.
- `--p2p.bootstrapNodeEnrVersionCheck <value>`: Whether to check the version of the bootstrap node ENR.
- `--p2p.bootstrapNodesAsFullPeers <value>`: Whether to consider our configured bootnodes as full peers.
- `--p2p.maxPeerCount <value>`: The maximum number of peers to connect to (default: 100).
- `--p2p.queryForIp <value>`: If announceUdpAddress or announceTcpAddress are not provided, query for the IP address of the machine. Default is false.
- `--p2p.gossipsubInterval <value>`: The interval of the gossipsub heartbeat to perform maintenance tasks (default: 700).
- `--p2p.gossipsubD <value>`: The D parameter for the gossipsub protocol (default: 8).
- `--p2p.gossipsubDlo <value>`: The Dlo parameter for the gossipsub protocol (default: 4).
- `--p2p.gossipsubDhi <value>`: The Dhi parameter for the gossipsub protocol (default: 12).
- `--p2p.gossipsubDLazy <value>`: The Dlazy parameter for the gossipsub protocol (default: 8).
- `--p2p.gossipsubFloodPublish <value>`: Whether to flood publish messages. - For testing purposes only.
- `--p2p.gossipsubMcacheLength <value>`: The number of gossipsub interval message cache windows to keep (default: 6).
- `--p2p.gossipsubMcacheGossip <value>`: How many message cache windows to include when gossiping with other peers (default: 3).
- `--p2p.gossipsubSeenTTL <value>`: How long to keep message IDs in the seen cache (default: 1200000).
- `--p2p.gossipsubTxTopicWeight <value>`: The weight of the tx topic for the gossipsub protocol (default: 1).
- `--p2p.gossipsubTxInvalidMessageDeliveriesWeight <value>`: The weight of the tx invalid message deliveries for the gossipsub protocol (default: -20).
- `--p2p.gossipsubTxInvalidMessageDeliveriesDecay <value>`: Determines how quickly the penalty for invalid message deliveries decays over time. Between 0 and 1 (default: 0.5).
- `--p2p.peerPenaltyValues <value>`: The values for the peer scoring system. Passed as a comma separated list of values in order: low, mid, high tolerance errors (default: 2,10,50).
- `--p2p.doubleSpendSeverePeerPenaltyWindow <value>`: The "age" (in L2 blocks) of a tx after which we heavily penalize a peer for sending it (default: 30).
- `--p2p.blockRequestBatchSize <value>`: The number of blocks to fetch in a single batch (default: 20).
- `--p2p.archivedTxLimit <value>`: The number of transactions that will be archived. If the limit is set to 0 then archiving will be disabled.
- `--p2p.trustedPeers <value>`: A list of trusted peer ENRs that will always be persisted. Separated by commas.
- `--p2p.privatePeers <value>`: A list of private peer ENRs that will always be persisted and not be used for discovery. Separated by commas.
- `--p2p.preferredPeers <value>`: A list of preferred peer ENRs that will always be persisted and not be used for discovery. Separated by commas.
- `--p2p.p2pStoreMapSizeKb <value>`: The maximum possible size of the P2P DB in KB. Overwrites the general dataStoreMapSizeKB.
- `--p2p.txPublicSetupAllowList <value>`: The list of functions calls allowed to run in setup.
- `--p2p.maxTxPoolSize <value>`: The maximum cumulative tx size of pending txs (in bytes) before evicting lower priority txs (default: 100000000).
- `--p2p.txPoolOverflowFactor <value>`: How much the tx pool can overflow before it starts evicting txs. Must be greater than 1 (default: 1.1).
- `--p2p.seenMessageCacheSize <value>`: The number of messages to keep in the seen message cache (default: 100000).
- `--p2p.p2pDisableStatusHandshake <value>`: True to disable the status handshake on peer connected.
- `--p2p.p2pAllowOnlyValidators <value>`: True to only permit validators to connect.
- `--p2p.p2pMaxFailedAuthAttemptsAllowed <value>`: Number of auth attempts to allow before peer is banned. Number is inclusive (default: 3).
- `--p2p.dropTransactions <value>`: True to simulate discarding transactions. - For testing purposes only.
- `--p2p.dropTransactionsProbability <value>`: The probability that a transaction is discarded. - For testing purposes only
- `--p2p.disableTransactions <value>`: Whether transactions are disabled for this node. This means transactions will be rejected at the RPC and P2P layers.
- `--p2p.txPoolDeleteTxsAfterReorg <value>`: Whether to delete transactions from the pool after a reorg instead of moving them back to pending.
- `--p2p.overallRequestTimeoutMs <value>`: The overall timeout for a request response operation (default: 10000).
- `--p2p.individualRequestTimeoutMs <value>`: The timeout for an individual request response peer interaction (default: 10000).
- `--p2p.dialTimeoutMs <value>`: How long to wait for the dial protocol to establish a connection (default: 5000).
- `--p2p.p2pOptimisticNegotiation <value>`: Whether to use optimistic protocol negotiation when dialing to another peer (opposite of `negotiateFully`).
- `--p2p.txCollectionFastNodesTimeoutBeforeReqRespMs <value>`: How long to wait before starting reqresp for fast collection (default: 200).
- `--p2p.txCollectionSlowNodesIntervalMs <value>`: How often to collect from configured nodes in the slow collection loop (default: 12000).
- `--p2p.txCollectionSlowReqRespIntervalMs <value>`: How often to collect from peers via reqresp in the slow collection loop (default: 12000).
- `--p2p.txCollectionSlowReqRespTimeoutMs <value>`: How long to wait for a reqresp response during slow collection (default: 20000).
- `--p2p.txCollectionReconcileIntervalMs <value>`: How often to reconcile found txs from the tx pool (default: 60000).
- `--p2p.txCollectionDisableSlowDuringFastRequests <value>`: Whether to disable the slow collection loop if we are dealing with any immediate requests (default: true).
- `--p2p.txCollectionFastNodeIntervalMs <value>`: How many ms to wait between retried request to a node via RPC during fast collection (default: 500).
- `--p2p.txCollectionNodeRpcUrls <value>`: A comma-separated list of Aztec node RPC URLs to use for tx collection.
- `--p2p.txCollectionFastMaxParallelRequestsPerNode <value>`: Maximum number of parallel requests to make to a node during fast collection (default: 4).
- `--p2p.txCollectionNodeRpcMaxBatchSize <value>`: Maximum number of transactions to request from a node in a single batch (default: 50).

#### P2P Bootstrap Options

- `--p2p-bootstrap`: Starts Aztec P2P Bootstrap with options.
- `--p2pBootstrap.p2pBroadcastPort <value>`: The port to broadcast the P2P service on (included in the node's ENR). Defaults to P2P_PORT.
- `--p2pBootstrap.peerIdPrivateKeyPath <value>`: An optional path to store generated peer id private keys. If blank, will default to storing any generated keys in the root of the data directory.

#### Telemetry Options

- `--tel.metricsCollectorUrl <value>`: The URL of the telemetry collector for metrics.
- `--tel.tracesCollectorUrl <value>`: The URL of the telemetry collector for traces.
- `--tel.logsCollectorUrl <value>`: The URL of the telemetry collector for logs.
- `--tel.otelCollectIntervalMs <value>`: The interval at which to collect metrics (default: 60000).
- `--tel.otelExportTimeoutMs <value>`: The timeout for exporting metrics (default: 30000).
- `--tel.otelExcludeMetrics <value>`: A list of metric prefixes to exclude from export.
- `--tel.publicMetricsCollectorUrl <value>`: A URL to publish a subset of metrics for public consumption.
- `--tel.publicMetricsCollectFrom <value>`: The role types to collect metrics from.
- `--tel.publicIncludeMetrics <value>`: A list of metric prefixes to publicly export.
- `--tel.publicMetricsOptOut <value>`: Whether to opt out of sharing optional telemetry.

#### Bot Options

- `--bot`: Starts Aztec Bot with options.
- `--bot.nodeUrl <value>`: The URL to the Aztec node to check for tx pool status.
- `--bot.nodeAdminUrl <value>`: The URL to the Aztec node admin API to force-flush txs if configured.
- `--bot.l1Mnemonic <value>`: The mnemonic for the account to bridge fee juice from L1.
- `--bot.l1PrivateKey <value>`: The private key for the account to bridge fee juice from L1.
- `--bot.l1ToL2MessageTimeoutSeconds <value>`: How long to wait for L1 to L2 messages to become available on L2 (default: 3600).
- `--bot.senderPrivateKey <value>`: Signing private key for the sender account.
- `--bot.senderSalt <value>`: The salt to use to deploy the sender account.
- `--bot.recipientEncryptionSecret <value>`: Encryption secret for a recipient account (default: 0x00000000000000000000000000000000000000000000000000000000cafecafe).
- `--bot.tokenSalt <value>`: The salt to use to deploy the token contract (default: 0x0000000000000000000000000000000000000000000000000000000000000001).
- `--bot.txIntervalSeconds <value>`: Every how many seconds should a new tx be sent (default: 60).
- `--bot.privateTransfersPerTx <value>`: How many private token transfers are executed per tx (default: 1).
- `--bot.publicTransfersPerTx <value>`: How many public token transfers are executed per tx (default: 1).
- `--bot.feePaymentMethod <value>`: How to handle fee payments. (Options: fee_juice) (default: fee_juice).
- `--bot.noStart <value>`: True to not automatically setup or start the bot on initialization.
- `--bot.txMinedWaitSeconds <value>`: How long to wait for a tx to be mined before reporting an error (default: 180).
- `--bot.followChain <value>`: Which chain the bot follows (default: NONE).
- `--bot.maxPendingTxs <value>`: Do not send a tx if the node's tx pool already has this many pending txs (default: 128).
- `--bot.flushSetupTransactions <value>`: Make a request for the sequencer to build a block after each setup transaction.
- `--bot.l2GasLimit <value>`: L2 gas limit for the tx (empty to have the bot trigger an estimate gas).
- `--bot.daGasLimit <value>`: DA gas limit for the tx (empty to have the bot trigger an estimate gas).
- `--bot.contract <value>`: Token contract to use (default: TokenContract).
- `--bot.maxConsecutiveErrors <value>`: The maximum number of consecutive errors before the bot shuts down.
- `--bot.stopWhenUnhealthy <value>`: Stops the bot if service becomes unhealthy.
- `--bot.ammTxs <value>`: Deploy an AMM and send swaps to it.

#### PXE Options
- `--pxe`: Starts Aztec PXE with options.
- `--pxe.l2BlockBatchSize <value>`: Maximum amount of blocks to pull from the stream in one request when synchronizing (default: 50).
- `--pxe.bbBinaryPath <value>`: Path to the BB binary.
- `--pxe.bbWorkingDirectory <value>`: Working directory for the BB binary.
- `--pxe.bbSkipCleanup <value>`: True to skip cleanup of temporary files for debugging purposes.
- `--pxe.proverEnabled <value>`: Enable real proofs (default: true).
- `--pxe.nodeUrl <value>`: Custom Aztec Node URL to connect to.

#### TXE Options

- `--txe`: Starts Aztec TXE with options.

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

## Contract interaction

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

### block-number

Retrieves the current Aztec L2 block number.

```bash
aztec block-number [options]
```

## Block Querying

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

### get-l1-to-l2-message-witness

Gets a L1 to L2 message witness.

```bash
aztec get-l1-to-l2-message-witness [options]
```

Options:

- `-ca, --contract-address <address>`: Aztec address of the contract.
- `--message-hash <messageHash>`: The L1 to L2 message hash.
- `--secret <secret>`: The secret used to claim the L1 to L2 message
- `-n, --node-url <string>`: URL of Aztec Node (default: "http://host.docker.internal:8080", env: AZTEC_NODE_URL)

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

- `-n, --node-url <string>`: URL of Aztec Node (default: "http://host.docker.internal:8080", env: AZTEC_NODE_URL)
- `--testAccounts`: Deploy funded test accounts.
- `--json`: Output the contract addresses in JSON format

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
- `-n, --node-url <string>`: URL of Aztec Node (default: "http://host.docker.internal:8080", env: AZTEC_NODE_URL)
- `-c, --l1-chain-id <number>`: Chain ID of the ethereum host (default: 31337, env: L1_CHAIN_ID)

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
