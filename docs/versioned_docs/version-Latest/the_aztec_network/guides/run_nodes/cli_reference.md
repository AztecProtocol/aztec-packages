---
sidebar_position: 5
title: Cli Reference
description: A reference of the --help output when running aztec start.
keywords:
  [
    aztec,
    prover,
    node,
    blockchain,
    L2,
    scaling,
    ethereum,
    zero-knowledge,
    ZK,
    setup,
  ]
tags:
  - prover
  - node
  - tutorial
  - infrastructure
---

:::note
The environment variable name corresponding to each flag is shown as $ENV_VAR on the right hand side.

If two subsystems can contain the same configuration option, only one needs to be provided. e.g. `--archiver.blobSinkUrl` and `--sequencer.blobSinkUrl` point to the same value if the node is started with both the `--archiver` and `--sequencer` options.
:::

```bash
  NETWORK

    --network <value>                                                                                                                      ($NETWORK)
          Network to run Aztec on

  API

    --port <value>                                                 (default: 8080)                                                      ($AZTEC_PORT)
          Port to run the Aztec Services on

    --admin-port <value>                                           (default: 8880)                                                      ($AZTEC_ADMIN_PORT)
          Port to run admin APIs of Aztec Services on on

    --api-prefix <value>                                                                                                                ($API_PREFIX)
          Prefix for API routes on any service that is started

  ETHEREUM

    --l1-rpc-urls <value>                                          (default: http://localhost:8545)                                     ($ETHEREUM_HOSTS)
          List of URLs of the Ethereum RPC nodes that services will connect to (comma separated)

    --l1-chain-id <value>                                          (default: 31337)                                                     ($L1_CHAIN_ID)
          The L1 chain ID

    --l1-mnemonic <value>                                          (default: test test test test test test test test test test test junk)($MNEMONIC)
          Mnemonic for L1 accounts. Will be used if no publisher private keys are provided

    --l1-consensus-host-urls <value>                               (default: )                                                          ($L1_CONSENSUS_HOST_URLS)
          List of URLs of the Ethereum consensus nodes that services will connect to (comma separated)

    --l1-consensus-host-api-keys <value>                           (default: )                                                          ($L1_CONSENSUS_HOST_API_KEYS)
          List of API keys for the corresponding Ethereum consensus nodes

    --l1-consensus-host-api-key-headers <value>                    (default: )                                                          ($L1_CONSENSUS_HOST_API_KEY_HEADERS)
          List of API key headers for the corresponding Ethereum consensus nodes. If not set, the api key for the corresponding node will be appended to the URL as ?key=<api-key>

  STORAGE

    --data-directory <value>                                                                                                           ($DATA_DIRECTORY)
          Where to store data for services. If not set, will store temporarily

    --data-store-map-size-kb <value>                                                                                                   ($DATA_STORE_MAP_SIZE_KB)
          The maximum possible size of the data store DB in KB. Can be overridden by component-specific options.

  L1 CONTRACT ADDRESSES

    --rollup-address <value>                                                                                                           ($ROLLUP_CONTRACT_ADDRESS)
          The deployed L1 rollup contract address

    --registry-address <value>                                                                                                         ($REGISTRY_CONTRACT_ADDRESS)
          The deployed L1 registry contract address

    --inbox-address <value>                                                                                                            ($INBOX_CONTRACT_ADDRESS)
          The deployed L1 -> L2 inbox contract address

    --outbox-address <value>                                                                                                           ($OUTBOX_CONTRACT_ADDRESS)
          The deployed L2 -> L1 outbox contract address

    --fee-juice-address <value>                                                                                                        ($FEE_JUICE_CONTRACT_ADDRESS)
          The deployed L1 Fee Juice contract address

    --staking-asset-address <value>                                                                                                    ($STAKING_ASSET_CONTRACT_ADDRESS)
          The deployed L1 Staking Asset contract address

    --fee-juice-portal-address <value>                                                                                                 ($FEE_JUICE_PORTAL_CONTRACT_ADDRESS)
          The deployed L1 Fee Juice portal contract address

  AZTEC NODE

    --node
          Starts Aztec Node with options

    --node.archiverUrl <value>                                                                                                         ($ARCHIVER_URL)
          URL for an archiver service

    --node.deployAztecContracts                                                                                                        ($DEPLOY_AZTEC_CONTRACTS)
          Deploys L1 Aztec contracts before starting the node. Needs mnemonic or private key to be set.

    --node.deployAztecContractsSalt <value>                                                                                            ($DEPLOY_AZTEC_CONTRACTS_SALT)
          Numeric salt for deploying L1 Aztec contracts before starting the node. Needs mnemonic or private key to be set. Implies --node.deployAztecContracts.

    --node.assumeProvenThroughBlockNumber <value>                                                                                      ($ASSUME_PROVEN_THROUGH_BLOCK_NUMBER)
          Cheats the rollup contract into assuming every block until this one is proven. Useful for speeding up bootstraps.

    --node.publisherPrivateKey <value>                                                                                                 ($L1_PRIVATE_KEY)
          Private key of account for publishing L1 contracts

    --node.worldStateBlockCheckIntervalMS <value>                  (default: 100)                                                       ($WS_BLOCK_CHECK_INTERVAL_MS)
          Frequency in which to check for blocks in ms

    --node.syncMode <value>                                        (default: snapshot)                                                  ($SYNC_MODE)
          Set sync mode to `full` to always sync via L1, `snapshot` to download a snapshot if there is no local data, `force-snapshot` to download even if there is local data.

    --node.snapshotsUrl <value>                                                                                                        ($SYNC_SNAPSHOTS_URL)
          Base URL for downloading snapshots for snapshot sync.

  P2P SUBSYSTEM

    --p2p-enabled [value]                                                                                                              ($P2P_ENABLED)
          Enable P2P subsystem

    --p2p.blockCheckIntervalMS <value>                             (default: 100)                                                       ($P2P_BLOCK_CHECK_INTERVAL_MS)
          The frequency in which to check for new L2 blocks.

    --p2p.debugDisableColocationPenalty <value>                                                                                        ($DEBUG_P2P_DISABLE_COLOCATION_PENALTY)
          DEBUG: Disable colocation penalty - NEVER set to true in production

    --p2p.peerCheckIntervalMS <value>                              (default: 30000)                                                     ($P2P_PEER_CHECK_INTERVAL_MS)
          The frequency in which to check for new peers.

    --p2p.l2QueueSize <value>                                      (default: 1000)                                                      ($P2P_L2_QUEUE_SIZE)
          Size of queue of L2 blocks to store.

    --p2p.listenAddress <value>                                    (default: 0.0.0.0)                                                   ($P2P_LISTEN_ADDR)
          The listen address. ipv4 address.

    --p2p.p2pPort <value>                                          (default: 40400)                                                     ($P2P_PORT)
          The port for the P2P service.

    --p2p.p2pIp <value>                                                                                                                ($P2P_IP)
          The IP address for the P2P service. ipv4 address.

    --p2p.peerIdPrivateKey <value>                                                                                                     ($PEER_ID_PRIVATE_KEY)
          An optional peer id private key. If blank, will generate a random key.

    --p2p.bootstrapNodes <value>                                   (default: )                                                          ($BOOTSTRAP_NODES)
          A list of bootstrap peer ENRs to connect to. Separated by commas.

    --p2p.bootstrapNodeEnrVersionCheck <value>                                                                                         ($P2P_BOOTSTRAP_NODE_ENR_VERSION_CHECK)
          Whether to check the version of the bootstrap node ENR.

    --p2p.bootstrapNodesAsFullPeers <value>                                                                                            ($P2P_BOOTSTRAP_NODES_AS_FULL_PEERS)
          Whether to consider our configured bootnodes as full peers

    --p2p.maxPeerCount <value>                                     (default: 100)                                                       ($P2P_MAX_PEERS)
          The maximum number of peers to connect to.

    --p2p.queryForIp <value>                                                                                                           ($P2P_QUERY_FOR_IP)
          If announceUdpAddress or announceTcpAddress are not provided, query for the IP address of the machine. Default is false.

    --p2p.keepProvenTxsInPoolFor <value>                                                                                               ($P2P_TX_POOL_KEEP_PROVEN_FOR)
          How many blocks have to pass after a block is proven before its txs are deleted (zero to delete immediately once proven)

    --p2p.keepAttestationsInPoolFor <value>                        (default: 96)                                                        ($P2P_ATTESTATION_POOL_KEEP_FOR)
          How many slots to keep attestations for.

    --p2p.gossipsubInterval <value>                                (default: 700)                                                       ($P2P_GOSSIPSUB_INTERVAL_MS)
          The interval of the gossipsub heartbeat to perform maintenance tasks.

    --p2p.gossipsubD <value>                                       (default: 8)                                                         ($P2P_GOSSIPSUB_D)
          The D parameter for the gossipsub protocol.

    --p2p.gossipsubDlo <value>                                     (default: 4)                                                         ($P2P_GOSSIPSUB_DLO)
          The Dlo parameter for the gossipsub protocol.

    --p2p.gossipsubDhi <value>                                     (default: 12)                                                        ($P2P_GOSSIPSUB_DHI)
          The Dhi parameter for the gossipsub protocol.

    --p2p.gossipsubDLazy <value>                                   (default: 8)                                                         ($P2P_GOSSIPSUB_DLAZY)
          The Dlazy parameter for the gossipsub protocol.

    --p2p.gossipsubFloodPublish <value>                            (default: true)                                                      ($P2P_GOSSIPSUB_FLOOD_PUBLISH)
          Whether to flood publish messages. - For testing purposes only

    --p2p.gossipsubMcacheLength <value>                            (default: 6)                                                         ($P2P_GOSSIPSUB_MCACHE_LENGTH)
          The number of gossipsub interval message cache windows to keep.

    --p2p.gossipsubMcacheGossip <value>                            (default: 3)                                                         ($P2P_GOSSIPSUB_MCACHE_GOSSIP)
          How many message cache windows to include when gossiping with other pears.

    --p2p.gossipsubTxTopicWeight <value>                           (default: 1)                                                         ($P2P_GOSSIPSUB_TX_TOPIC_WEIGHT)
          The weight of the tx topic for the gossipsub protocol.

    --p2p.gossipsubTxInvalidMessageDeliveriesWeight <value>        (default: -20)                                                       ($P2P_GOSSIPSUB_TX_INVALID_MESSAGE_DELIVERIES_WEIGHT)
          The weight of the tx invalid message deliveries for the gossipsub protocol.

    --p2p.gossipsubTxInvalidMessageDeliveriesDecay <value>         (default: 0.5)                                                       ($P2P_GOSSIPSUB_TX_INVALID_MESSAGE_DELIVERIES_DECAY)
          Determines how quickly the penalty for invalid message deliveries decays over time. Between 0 and 1.

    --p2p.peerPenaltyValues <value>                                (default: 2,10,50)                                                   ($P2P_PEER_PENALTY_VALUES)
          The values for the peer scoring system. Passed as a comma separated list of values in order: low, mid, high tolerance errors.

    --p2p.doubleSpendSeverePeerPenaltyWindow <value>               (default: 30)                                                        ($P2P_DOUBLE_SPEND_SEVERE_PEER_PENALTY_WINDOW)
          The "age" (in L2 blocks) of a tx after which we heavily penalize a peer for sending it.

    --p2p.blockRequestBatchSize <value>                            (default: 20)                                                        ($P2P_BLOCK_REQUEST_BATCH_SIZE)
          The number of blocks to fetch in a single batch.

    --p2p.archivedTxLimit <value>                                                                                                      ($P2P_ARCHIVED_TX_LIMIT)
          The number of transactions that will be archived. If the limit is set to 0 then archiving will be disabled.

    --p2p.trustedPeers <value>                                     (default: )                                                          ($P2P_TRUSTED_PEERS)
          A list of trusted peers ENRs. Separated by commas.

    --p2p.p2pStoreMapSizeKb <value>                                                                                                    ($P2P_STORE_MAP_SIZE_KB)
          The maximum possible size of the P2P DB in KB. Overwrites the general dataStoreMapSizeKB.

    --p2p.txPublicSetupAllowList <value>                                                                                               ($TX_PUBLIC_SETUP_ALLOWLIST)
          The list of functions calls allowed to run in setup

    --p2p.maxTxPoolSize <value>                                    (default: 100000000)                                                 ($P2P_MAX_TX_POOL_SIZE)
          The maximum cumulative tx size of pending txs (in bytes) before evicting lower priority txs.

    --p2p.overallRequestTimeoutMs <value>                          (default: 4000)                                                      ($P2P_REQRESP_OVERALL_REQUEST_TIMEOUT_MS)
          The overall timeout for a request response operation.

    --p2p.individualRequestTimeoutMs <value>                       (default: 2000)                                                      ($P2P_REQRESP_INDIVIDUAL_REQUEST_TIMEOUT_MS)
          The timeout for an individual request response peer interaction.

    --p2p.rollupVersion <value>                                                                                                        ($ROLLUP_VERSION)
          The version of the rollup.

  TELEMETRY

    --tel.metricsCollectorUrl <value>                                                                                                  ($OTEL_EXPORTER_OTLP_METRICS_ENDPOINT)
          The URL of the telemetry collector for metrics

    --tel.tracesCollectorUrl <value>                                                                                                   ($OTEL_EXPORTER_OTLP_TRACES_ENDPOINT)
          The URL of the telemetry collector for traces

    --tel.logsCollectorUrl <value>                                                                                                     ($OTEL_EXPORTER_OTLP_LOGS_ENDPOINT)
          The URL of the telemetry collector for logs

    --tel.otelCollectIntervalMs <value>                            (default: 60000)                                                     ($OTEL_COLLECT_INTERVAL_MS)
          The interval at which to collect metrics

    --tel.otelExportTimeoutMs <value>                              (default: 30000)                                                     ($OTEL_EXPORT_TIMEOUT_MS)
          The timeout for exporting metrics

    --tel.otelExcludeMetrics <value>                               (default: )                                                          ($OTEL_EXCLUDE_METRICS)
          A list of metric prefixes to exclude from export

  PXE

    --pxe
          Starts Aztec PXE with options

    --pxe.dataStoreMapSizeKB <value>                               (default: 134217728)                                                 ($DATA_STORE_MAP_SIZE_KB)
          DB mapping size to be applied to all key/value stores

    --pxe.rollupVersion <value>                                                                                                        ($ROLLUP_VERSION)
          The version of the rollup.

    --pxe.l2StartingBlock <value>                                  (default: 1)                                                         ($PXE_L2_STARTING_BLOCK)
          L2 block to start scanning from for new accounts

    --pxe.l2BlockBatchSize <value>                                 (default: 200)                                                       ($PXE_L2_BLOCK_BATCH_SIZE)
          Maximum amount of blocks to pull from the stream in one request when synchronizing

    --pxe.bbBinaryPath <value>                                                                                                         ($BB_BINARY_PATH)
          Path to the BB binary

    --pxe.bbWorkingDirectory <value>                                                                                                   ($BB_WORKING_DIRECTORY)
          Working directory for the BB binary

    --pxe.bbSkipCleanup <value>                                                                                                        ($BB_SKIP_CLEANUP)
          True to skip cleanup of temporary files for debugging purposes

    --pxe.proverEnabled <value>                                    (default: true)                                                      ($PXE_PROVER_ENABLED)
          Enable real proofs

    --pxe.network <value>                                                                                                              ($NETWORK)
          External Aztec network to connect to. e.g. devnet

    --pxe.apiKey <value>                                                                                                               ($API_KEY)
          API Key required by the external network's node

    --pxe.nodeUrl <value>                                                                                                              ($AZTEC_NODE_URL)
          Custom Aztec Node URL to connect to

  ARCHIVER

    --archiver
          Starts Aztec Archiver with options

    --archiver.blobSinkUrl <value>                                                                                                     ($BLOB_SINK_URL)
          The URL of the blob sink

    --archiver.archiveApiUrl <value>                                                                                                   ($BLOB_SINK_ARCHIVE_API_URL)
          The URL of the archive API

    --archiver.archiverPollingIntervalMS <value>                   (default: 500)                                                       ($ARCHIVER_POLLING_INTERVAL_MS)
          The polling interval in ms for retrieving new L2 blocks and encrypted logs.

    --archiver.archiverBatchSize <value>                           (default: 100)                                                       ($ARCHIVER_BATCH_SIZE)
          The number of L2 blocks the archiver will attempt to download at a time.

    --archiver.maxLogs <value>                                     (default: 1000)                                                      ($ARCHIVER_MAX_LOGS)
          The max number of logs that can be obtained in 1 "getPublicLogs" call.

    --archiver.archiverStoreMapSizeKb <value>                                                                                          ($ARCHIVER_STORE_MAP_SIZE_KB)
          The maximum possible size of the archiver DB in KB. Overwrites the general dataStoreMapSizeKB.

    --archiver.rollupVersion <value>                                                                                                   ($ROLLUP_VERSION)
          The version of the rollup.

    --archiver.viemPollingIntervalMS <value>                       (default: 1000)                                                      ($ARCHIVER_VIEM_POLLING_INTERVAL_MS)
          The polling interval viem uses in ms

    --archiver.ethereumSlotDuration <value>                        (default: 12)                                                        ($ETHEREUM_SLOT_DURATION)
          How many seconds an L1 slot lasts.

    --archiver.aztecSlotDuration <value>                           (default: 24)                                                        ($AZTEC_SLOT_DURATION)
          How many seconds an L2 slots lasts (must be multiple of ethereum slot duration).

    --archiver.aztecEpochDuration <value>                          (default: 16)                                                        ($AZTEC_EPOCH_DURATION)
          How many L2 slots an epoch lasts (maximum AZTEC_MAX_EPOCH_DURATION).

    --archiver.aztecTargetCommitteeSize <value>                    (default: 48)                                                        ($AZTEC_TARGET_COMMITTEE_SIZE)
          The target validator committee size.

    --archiver.aztecProofSubmissionWindow <value>                  (default: 31)                                                        ($AZTEC_PROOF_SUBMISSION_WINDOW)
          The number of L2 slots that a proof for an epoch can be submitted in, starting from the beginning of the epoch.

    --archiver.minimumStake <value>                                (default: 100000000000000000000)                                     ($AZTEC_MINIMUM_STAKE)
          The minimum stake for a validator.

    --archiver.slashingQuorum <value>                              (default: 6)                                                         ($AZTEC_SLASHING_QUORUM)
          The slashing quorum

    --archiver.slashingRoundSize <value>                           (default: 10)                                                        ($AZTEC_SLASHING_ROUND_SIZE)
          The slashing round size

    --archiver.governanceProposerQuorum <value>                    (default: 51)                                                        ($AZTEC_GOVERNANCE_PROPOSER_QUORUM)
          The governance proposing quorum

    --archiver.governanceProposerRoundSize <value>                 (default: 100)                                                       ($AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE)
          The governance proposing round size

    --archiver.manaTarget <value>                                  (default: 10000000000)                                               ($AZTEC_MANA_TARGET)
          The mana target for the rollup

    --archiver.provingCostPerMana <value>                          (default: 100)                                                       ($AZTEC_PROVING_COST_PER_MANA)
          The proving cost per mana

    --archiver.gasLimitBufferPercentage <value>                    (default: 20)                                                        ($L1_GAS_LIMIT_BUFFER_PERCENTAGE)
          How much to increase calculated gas limit by (percentage)

    --archiver.maxGwei <value>                                     (default: 500)                                                       ($L1_GAS_PRICE_MAX)
          Maximum gas price in gwei

    --archiver.maxBlobGwei <value>                                 (default: 1500)                                                      ($L1_BLOB_FEE_PER_GAS_MAX)
          Maximum blob fee per gas in gwei

    --archiver.priorityFeeBumpPercentage <value>                   (default: 20)                                                        ($L1_PRIORITY_FEE_BUMP_PERCENTAGE)
          How much to increase priority fee by each attempt (percentage)

    --archiver.priorityFeeRetryBumpPercentage <value>              (default: 50)                                                        ($L1_PRIORITY_FEE_RETRY_BUMP_PERCENTAGE)
          How much to increase priority fee by each retry attempt (percentage)

    --archiver.fixedPriorityFeePerGas <value>                                                                                          ($L1_FIXED_PRIORITY_FEE_PER_GAS)
          Fixed priority fee per gas in Gwei. Overrides any priority fee bump percentage

    --archiver.maxAttempts <value>                                 (default: 3)                                                         ($L1_TX_MONITOR_MAX_ATTEMPTS)
          Maximum number of speed-up attempts

    --archiver.checkIntervalMs <value>                             (default: 1000)                                                      ($L1_TX_MONITOR_CHECK_INTERVAL_MS)
          How often to check tx status

    --archiver.stallTimeMs <value>                                 (default: 45000)                                                     ($L1_TX_MONITOR_STALL_TIME_MS)
          How long before considering tx stalled

    --archiver.txTimeoutMs <value>                                 (default: 300000)                                                    ($L1_TX_MONITOR_TX_TIMEOUT_MS)
          How long to wait for a tx to be mined before giving up. Set to 0 to disable.

    --archiver.txPropagationMaxQueryAttempts <value>               (default: 3)                                                         ($L1_TX_PROPAGATION_MAX_QUERY_ATTEMPTS)
          How many attempts will be done to get a tx after it was sent

  SEQUENCER

    --sequencer
          Starts Aztec Sequencer with options

    --sequencer.validatorPrivateKey <value>                                                                                            ($VALIDATOR_PRIVATE_KEY)
          The private key of the validator participating in attestation duties

    --sequencer.disableValidator <value>                                                                                               ($VALIDATOR_DISABLED)
          Do not run the validator

    --sequencer.attestationPollingIntervalMs <value>               (default: 200)                                                       ($VALIDATOR_ATTESTATIONS_POLLING_INTERVAL_MS)
          Interval between polling for new attestations

    --sequencer.validatorReexecute <value>                         (default: true)                                                      ($VALIDATOR_REEXECUTE)
          Re-execute transactions before attesting

    --sequencer.transactionPollingIntervalMS <value>               (default: 500)                                                       ($SEQ_TX_POLLING_INTERVAL_MS)
          The number of ms to wait between polling for pending txs.

    --sequencer.maxTxsPerBlock <value>                             (default: 32)                                                        ($SEQ_MAX_TX_PER_BLOCK)
          The maximum number of txs to include in a block.

    --sequencer.minTxsPerBlock <value>                             (default: 1)                                                         ($SEQ_MIN_TX_PER_BLOCK)
          The minimum number of txs to include in a block.

    --sequencer.maxL2BlockGas <value>                              (default: 10000000000)                                               ($SEQ_MAX_L2_BLOCK_GAS)
          The maximum L2 block gas.

    --sequencer.maxDABlockGas <value>                              (default: 10000000000)                                               ($SEQ_MAX_DA_BLOCK_GAS)
          The maximum DA block gas.

    --sequencer.coinbase <value>                                                                                                       ($COINBASE)
          Recipient of block reward.

    --sequencer.feeRecipient <value>                                                                                                   ($FEE_RECIPIENT)
          Address to receive fees.

    --sequencer.acvmWorkingDirectory <value>                                                                                           ($ACVM_WORKING_DIRECTORY)
          The working directory to use for simulation/proving

    --sequencer.acvmBinaryPath <value>                                                                                                 ($ACVM_BINARY_PATH)
          The path to the ACVM binary

    --sequencer.maxBlockSizeInBytes <value>                        (default: 1048576)                                                   ($SEQ_MAX_BLOCK_SIZE_IN_BYTES)
          Max block size

    --sequencer.enforceTimeTable <value>                           (default: true)                                                      ($SEQ_ENFORCE_TIME_TABLE)
          Whether to enforce the time table when building blocks

    --sequencer.governanceProposerPayload <value>                  (default: 0x0000000000000000000000000000000000000000)                ($GOVERNANCE_PROPOSER_PAYLOAD_ADDRESS)
          The address of the payload for the governanceProposer

    --sequencer.maxL1TxInclusionTimeIntoSlot <value>                                                                                   ($SEQ_MAX_L1_TX_INCLUSION_TIME_INTO_SLOT)
          How many seconds into an L1 slot we can still send a tx and get it mined.

    --sequencer.txPublicSetupAllowList <value>                                                                                         ($TX_PUBLIC_SETUP_ALLOWLIST)
          The list of functions calls allowed to run in setup

    --sequencer.viemPollingIntervalMS <value>                      (default: 1000)                                                      ($L1_READER_VIEM_POLLING_INTERVAL_MS)
          The polling interval viem uses in ms

    --sequencer.customForwarderContractAddress <value>             (default: 0x0000000000000000000000000000000000000000)                ($CUSTOM_FORWARDER_CONTRACT_ADDRESS)
          The address of the custom forwarder contract.

    --sequencer.publisherPrivateKey <value>                        (default: 0x0000000000000000000000000000000000000000000000000000000000000000)($SEQ_PUBLISHER_PRIVATE_KEY)
          The private key to be used by the publisher.

    --sequencer.l1PublishRetryIntervalMS <value>                   (default: 1000)                                                      ($SEQ_PUBLISH_RETRY_INTERVAL_MS)
          The interval to wait between publish retries.

    --sequencer.gasLimitBufferPercentage <value>                   (default: 20)                                                        ($L1_GAS_LIMIT_BUFFER_PERCENTAGE)
          How much to increase calculated gas limit by (percentage)

    --sequencer.maxGwei <value>                                    (default: 500)                                                       ($L1_GAS_PRICE_MAX)
          Maximum gas price in gwei

    --sequencer.maxBlobGwei <value>                                (default: 1500)                                                      ($L1_BLOB_FEE_PER_GAS_MAX)
          Maximum blob fee per gas in gwei

    --sequencer.priorityFeeBumpPercentage <value>                  (default: 20)                                                        ($L1_PRIORITY_FEE_BUMP_PERCENTAGE)
          How much to increase priority fee by each attempt (percentage)

    --sequencer.priorityFeeRetryBumpPercentage <value>             (default: 50)                                                        ($L1_PRIORITY_FEE_RETRY_BUMP_PERCENTAGE)
          How much to increase priority fee by each retry attempt (percentage)

    --sequencer.fixedPriorityFeePerGas <value>                                                                                         ($L1_FIXED_PRIORITY_FEE_PER_GAS)
          Fixed priority fee per gas in Gwei. Overrides any priority fee bump percentage

    --sequencer.maxAttempts <value>                                (default: 3)                                                         ($L1_TX_MONITOR_MAX_ATTEMPTS)
          Maximum number of speed-up attempts

    --sequencer.checkIntervalMs <value>                            (default: 1000)                                                      ($L1_TX_MONITOR_CHECK_INTERVAL_MS)
          How often to check tx status

    --sequencer.stallTimeMs <value>                                (default: 45000)                                                     ($L1_TX_MONITOR_STALL_TIME_MS)
          How long before considering tx stalled

    --sequencer.txTimeoutMs <value>                                (default: 300000)                                                    ($L1_TX_MONITOR_TX_TIMEOUT_MS)
          How long to wait for a tx to be mined before giving up. Set to 0 to disable.

    --sequencer.txPropagationMaxQueryAttempts <value>              (default: 3)                                                         ($L1_TX_PROPAGATION_MAX_QUERY_ATTEMPTS)
          How many attempts will be done to get a tx after it was sent

    --sequencer.blobSinkUrl <value>                                                                                                     ($BLOB_SINK_URL)
          The URL of the blob sink

    --sequencer.archiveApiUrl <value>                                                                                                   ($BLOB_SINK_ARCHIVE_API_URL)
          The URL of the archive API

    --sequencer.rollupVersion <value>                                                                                                   ($ROLLUP_VERSION)
          The version of the rollup.

    --sequencer.ethereumSlotDuration <value>                       (default: 12)                                                        ($ETHEREUM_SLOT_DURATION)
          How many seconds an L1 slot lasts.

    --sequencer.aztecSlotDuration <value>                          (default: 24)                                                        ($AZTEC_SLOT_DURATION)
          How many seconds an L2 slots lasts (must be multiple of ethereum slot duration).

    --sequencer.aztecEpochDuration <value>                         (default: 16)                                                        ($AZTEC_EPOCH_DURATION)
          How many L2 slots an epoch lasts (maximum AZTEC_MAX_EPOCH_DURATION).

    --sequencer.aztecProofSubmissionWindow <value>                 (default: 31)                                                        ($AZTEC_PROOF_SUBMISSION_WINDOW)
          The number of L2 slots that a proof for an epoch can be submitted in, starting from the beginning of the epoch.

  BLOB SINK

    --blob-sink
          Starts Aztec Blob Sink with options

    --blobSink.port <value>                                                                                                             ($BLOB_SINK_PORT)
          The port to run the blob sink server on

    --blobSink.archiveApiUrl <value>                                                                                                    ($BLOB_SINK_ARCHIVE_API_URL)
          The URL of the archive API

    --blobSink.dataStoreMapSizeKB <value>                          (default: 134217728)                                                 ($DATA_STORE_MAP_SIZE_KB)
          DB mapping size to be applied to all key/value stores

    --blobSink.rollupVersion <value>                                                                                                    ($ROLLUP_VERSION)
          The version of the rollup.

    --blobSink.viemPollingIntervalMS <value>                       (default: 1000)                                                      ($L1_READER_VIEM_POLLING_INTERVAL_MS)
          The polling interval viem uses in ms

  PROVER NODE

    --prover-node
          Starts Aztec Prover Node with options

    --proverNode.archiverUrl <value>                                                                                                    ($ARCHIVER_URL)
          URL for an archiver service

    --proverNode.acvmWorkingDirectory <value>                                                                                           ($ACVM_WORKING_DIRECTORY)
          The working directory to use for simulation/proving

    --proverNode.acvmBinaryPath <value>                                                                                                 ($ACVM_BINARY_PATH)
          The path to the ACVM binary

    --proverNode.bbWorkingDirectory <value>                                                                                             ($BB_WORKING_DIRECTORY)
          The working directory to use for proving

    --proverNode.bbBinaryPath <value>                                                                                                   ($BB_BINARY_PATH)
          The path to the bb binary

    --proverNode.bbSkipCleanup <value>                                                                                                  ($BB_SKIP_CLEANUP)
          Whether to skip cleanup of bb temporary files

    --proverNode.nodeUrl <value>                                                                                                        ($AZTEC_NODE_URL)
          The URL to the Aztec node to take proving jobs from

    --proverNode.proverId <value>                                                                                                       ($PROVER_ID)
          Hex value that identifies the prover. Defaults to the address used for submitting proofs if not set.

    --proverNode.failedProofStore <value>                                                                                               ($PROVER_FAILED_PROOF_STORE)
          Store for failed proof inputs. Google cloud storage is only supported at the moment. Set this value as gs://bucket-name/path/to/store.

    --proverNode.worldStateBlockCheckIntervalMS <value>            (default: 100)                                                       ($WS_BLOCK_CHECK_INTERVAL_MS)
          The frequency in which to check.

    --proverNode.worldStateProvenBlocksOnly <value>                                                                                     ($WS_PROVEN_BLOCKS_ONLY)
          Whether to follow only the proven chain.

    --proverNode.worldStateBlockRequestBatchSize <value>                                                                                ($WS_BLOCK_REQUEST_BATCH_SIZE)
          Size of the batch for each get-blocks request from the synchronizer to the archiver.

    --proverNode.worldStateDbMapSizeKb <value>                                                                                          ($WS_DB_MAP_SIZE_KB)
          The maximum possible size of the world state DB in KB. Overwrites the general dataStoreMapSizeKB.

    --proverNode.worldStateDataDirectory <value>                                                                                        ($WS_DATA_DIRECTORY)
          Optional directory for the world state database

    --proverNode.worldStateBlockHistory <value>                    (default: 64)                                                        ($WS_NUM_HISTORIC_BLOCKS)
          The number of historic blocks to maintain. Values less than 1 mean all history is maintained

    --proverNode.l1PublishRetryIntervalMS <value>                  (default: 1000)                                                      ($PROVER_PUBLISH_RETRY_INTERVAL_MS)
          The interval to wait between publish retries.

    --proverNode.customForwarderContractAddress <value>            (default: 0x0000000000000000000000000000000000000000)                ($CUSTOM_FORWARDER_CONTRACT_ADDRESS)
          The address of the custom forwarder contract.

    --proverNode.publisherPrivateKey <value>                       (default: 0x0000000000000000000000000000000000000000000000000000000000000000)($PROVER_PUBLISHER_PRIVATE_KEY)
          The private key to be used by the publisher.

    --proverNode.proverCoordinationNodeUrl <value>                                                                                      ($PROVER_COORDINATION_NODE_URL)
          The URL of the tx provider node

    --proverNode.proverNodeMaxPendingJobs <value>                  (default: 10)                                                        ($PROVER_NODE_MAX_PENDING_JOBS)
          The maximum number of pending jobs for the prover node

    --proverNode.proverNodePollingIntervalMs <value>               (default: 1000)                                                      ($PROVER_NODE_POLLING_INTERVAL_MS)
          The interval in milliseconds to poll for new jobs

    --proverNode.proverNodeMaxParallelBlocksPerEpoch <value>       (default: 32)                                                        ($PROVER_NODE_MAX_PARALLEL_BLOCKS_PER_EPOCH)
          The Maximum number of blocks to process in parallel while proving an epoch

    --proverNode.txGatheringTimeoutMs <value>                      (default: 60000)                                                     ($PROVER_NODE_TX_GATHERING_TIMEOUT_MS)
          The maximum amount of time to wait for tx data to be available

    --proverNode.txGatheringIntervalMs <value>                     (default: 1000)                                                      ($PROVER_NODE_TX_GATHERING_INTERVAL_MS)
          How often to check that tx data is available

    --proverNode.txGatheringMaxParallelRequests <value>            (default: 100)                                                       ($PROVER_NODE_TX_GATHERING_MAX_PARALLEL_REQUESTS)
          How many txs to load up a time

    --proverNode.testAccounts <value>                                                                                                   ($TEST_ACCOUNTS)
          Whether to populate the genesis state with initial fee juice for the test accounts.

    --proverNode.sponsoredFPC <value>                                                                                                   ($SPONSORED_FPC)
          Whether to populate the genesis state with initial fee juice for the sponsored FPC.

    --proverNode.syncMode <value>                                  (default: snapshot)                                                  ($SYNC_MODE)
          Set sync mode to `full` to always sync via L1, `snapshot` to download a snapshot if there is no local data, `force-snapshot` to download even if there is local data.

    --proverNode.snapshotsUrl <value>                                                                                                   ($SYNC_SNAPSHOTS_URL)
          Base URL for snapshots index.

  PROVER BROKER

    --prover-broker
          Starts Aztec proving job broker

    --proverBroker.proverBrokerJobTimeoutMs <value>                (default: 30000)                                                     ($PROVER_BROKER_JOB_TIMEOUT_MS)
          Jobs are retried if not kept alive for this long

    --proverBroker.proverBrokerPollIntervalMs <value>              (default: 1000)                                                      ($PROVER_BROKER_POLL_INTERVAL_MS)
          The interval to check job health status

    --proverBroker.proverBrokerJobMaxRetries <value>               (default: 3)                                                         ($PROVER_BROKER_JOB_MAX_RETRIES)
          If starting a prover broker locally, the max number of retries per proving job

    --proverBroker.proverBrokerBatchSize <value>                   (default: 100)                                                       ($PROVER_BROKER_BATCH_SIZE)
          The prover broker writes jobs to disk in batches

    --proverBroker.proverBrokerBatchIntervalMs <value>             (default: 50)                                                        ($PROVER_BROKER_BATCH_INTERVAL_MS)
          How often to flush batches to disk

    --proverBroker.proverBrokerMaxEpochsToKeepResultsFor <value>   (default: 1)                                                         ($PROVER_BROKER_MAX_EPOCHS_TO_KEEP_RESULTS_FOR)
          The maximum number of epochs to keep results for

    --proverBroker.proverBrokerStoreMapSizeKB <value>                                                                                   ($PROVER_BROKER_STORE_MAP_SIZE_KB)
          The size of the prover broker's database. Will override the dataStoreMapSizeKB if set.

    --proverBroker.dataStoreMapSizeKB <value>                      (default: 134217728)                                                 ($DATA_STORE_MAP_SIZE_KB)
          DB mapping size to be applied to all key/value stores

    --proverBroker.viemPollingIntervalMS <value>                   (default: 1000)                                                      ($L1_READER_VIEM_POLLING_INTERVAL_MS)
          The polling interval viem uses in ms

    --proverBroker.rollupVersion <value>                                                                                                ($ROLLUP_VERSION)
          The version of the rollup.

  PROVER AGENT

    --prover-agent
          Starts Aztec Prover Agent with options

    --proverAgent.proverAgentCount <value>                         (default: 1)                                                         ($PROVER_AGENT_COUNT)
          Whether this prover has a local prover agent

    --proverAgent.proverAgentPollIntervalMs <value>                (default: 100)                                                       ($PROVER_AGENT_POLL_INTERVAL_MS)
          The interval agents poll for jobs at

    --proverAgent.proverAgentProofTypes <value>                                                                                         ($PROVER_AGENT_PROOF_TYPES)
          The types of proofs the prover agent can generate

    --proverAgent.proverBrokerUrl <value>                                                                                               ($PROVER_BROKER_HOST)
          The URL where this agent takes jobs from

    --proverAgent.realProofs <value>                               (default: true)                                                      ($PROVER_REAL_PROOFS)
          Whether to construct real proofs

    --proverAgent.proverTestDelayType <value>                      (default: fixed)                                                     ($PROVER_TEST_DELAY_TYPE)
          The type of artificial delay to introduce

    --proverAgent.proverTestDelayMs <value>                                                                                             ($PROVER_TEST_DELAY_MS)
          Artificial delay to introduce to all operations to the test prover.

    --proverAgent.proverTestDelayFactor <value>                    (default: 1)                                                         ($PROVER_TEST_DELAY_FACTOR)
          If using realistic delays, what percentage of realistic times to apply.

  P2P BOOTSTRAP

    --p2p-bootstrap
          Starts Aztec P2P Bootstrap with options

    --p2pBootstrap.dataStoreMapSizeKB <value>                      (default: 134217728)                                                 ($DATA_STORE_MAP_SIZE_KB)
          DB mapping size to be applied to all key/value stores

```
