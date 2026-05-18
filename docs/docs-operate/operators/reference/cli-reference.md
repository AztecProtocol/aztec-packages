---
displayed_sidebar: operatorsSidebar
title: Cli Reference
description: A reference of the --help output when running aztec start.
references: ["yarn-project/aztec/src/cli/aztec_start_options.ts", "yarn-project/aztec/src/cli/cli.ts"]
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

**Configuration notes:**

- The environment variable name corresponding to each flag is shown as $ENV_VAR on the right hand side.
- If two subsystems can contain the same configuration option, only one needs to be provided. For example, `--archiver.blobSinkUrl` and `--sequencer.blobSinkUrl` point to the same value.

```bash

  MISC

    --network <value>                                                                                                                      ($NETWORK)
          Network to run Aztec on

    --enable-version-check                                                   (default: true)                                               ($ENABLE_VERSION_CHECK)
          Check if the node is running the latest version and is following the latest rollup

    --sync-mode <value>                                                      (default: snapshot)                                           ($SYNC_MODE)
          Set sync mode to `full` to always sync via L1, `snapshot` to download a snapshot if there is no local data, `force-snapshot` to download even if there is local data.

    --snapshots-urls <value>                                                 (default: )                                                   ($SYNC_SNAPSHOTS_URLS)
          Base URLs for snapshots index, comma-separated.

    --fisherman-mode                                                                                                                       ($FISHERMAN_MODE)
          Whether to run in fisherman mode.

  LOCAL_NETWORK

    --local-network                                                                                                                        
          Starts Aztec Local Network

    --local-network.l1Mnemonic <value>                                       (default: test test test test test test test test test test test junk)($MNEMONIC)
          Mnemonic for L1 accounts. Will be used 

    --local-network.testAccounts                                             (default: true)                                               ($TEST_ACCOUNTS)
          Deploy test accounts on local network start

  API

    --port <value>                                                           (default: 8080)                                               ($AZTEC_PORT)
          Port to run the Aztec Services on

    --admin-port <value>                                                     (default: 8880)                                               ($AZTEC_ADMIN_PORT)
          Port to run admin APIs of Aztec Services on

    --admin-api-key-hash <value>                                                                                                           ($AZTEC_ADMIN_API_KEY_HASH)
          SHA-256 hex hash of a pre-generated admin API key. When set, the node uses this hash for authentication instead of auto-generating a key.

    --disable-admin-api-key                                                                                                                ($AZTEC_DISABLE_ADMIN_API_KEY)
          Disable API key authentication on the admin RPC endpoint. By default, a key is auto-generated, displayed once, and its hash is persisted.

    --reset-admin-api-key                                                                                                                  ($AZTEC_RESET_ADMIN_API_KEY)
          Force-generate a new admin API key, replacing any previously persisted key hash. The new key is displayed once at startup.

    --node-debug                                                                                                                           ($AZTEC_NODE_DEBUG)
          Expose debug endpoints (e.g. mineBlock) on the main RPC port

    --api-prefix <value>                                                                                                                   ($API_PREFIX)
          Prefix for API routes on any service that is started

    --rpcMaxBatchSize <value>                                                (default: 100)                                                ($RPC_MAX_BATCH_SIZE)
          Maximum allowed batch size for JSON RPC batch requests.

    --rpcMaxBodySize <value>                                                 (default: 1mb)                                                ($RPC_MAX_BODY_SIZE)
          Maximum allowed batch size for JSON RPC batch requests.

  ETHEREUM

    --l1-chain-id <value>                                                                                                                  ($L1_CHAIN_ID)
          The chain ID of the ethereum host.

    --l1-rpc-urls <value>                                                                                                                  ($ETHEREUM_HOSTS)
          List of URLs of Ethereum RPC nodes that services will connect to (comma separated).

    --l1-consensus-host-urls <value>                                                                                                       ($L1_CONSENSUS_HOST_URLS)
          List of URLs of the Ethereum consensus nodes that services will connect to (comma separated)

    --l1-consensus-host-api-keys <value>                                                                                                   ($L1_CONSENSUS_HOST_API_KEYS)
          List of API keys for the corresponding L1 consensus clients, if needed. Added to the end of the corresponding URL as "?key=<api-key>" unless a header is defined

    --l1-consensus-host-api-key-headers <value>                                                                                            ($L1_CONSENSUS_HOST_API_KEY_HEADERS)
          List of header names for the corresponding L1 consensus client API keys, if needed. Added to the corresponding request as "<api-key-header>: <api-key>"

  L1 CONTRACTS

    --registry-address <value>                                                                                                             ($REGISTRY_CONTRACT_ADDRESS)
          The deployed L1 registry contract address.

    --rollup-version <value>                                                                                                               ($ROLLUP_VERSION)
          The version of the rollup.

  STORAGE

    --data-directory <value>                                                                                                               ($DATA_DIRECTORY)
          Optional dir to store data. If omitted will store in memory.

    --data-store-map-size-kb <value>                                         (default: 134217728)                                          ($DATA_STORE_MAP_SIZE_KB)
          The maximum possible size of a data store DB in KB. Can be overridden by component-specific options.

  WORLD STATE

    --world-state-data-directory <value>                                                                                                   ($WS_DATA_DIRECTORY)
          Optional directory for the world state database

    --world-state-db-map-size-kb <value>                                                                                                   ($WS_DB_MAP_SIZE_KB)
          The maximum possible size of the world state DB in KB. Overwrites the general dataStoreMapSizeKb.

    --world-state-checkpoint-history <value>                                 (default: 64)                                                 ($WS_NUM_HISTORIC_CHECKPOINTS)
          The number of historic checkpoints worth of blocks to maintain. Values less than 1 mean all history is maintained

  AZTEC NODE

    --node                                                                                                                                 
          Starts Aztec Node with options

  ARCHIVER

    --archiver                                                                                                                             
          Starts Aztec Archiver with options

    --archiver.blobSinkMapSizeKb <value>                                                                                                   ($BLOB_SINK_MAP_SIZE_KB)
          The maximum possible size of the blob sink DB in KB. Overwrites the general dataStoreMapSizeKb.

    --archiver.blobAllowEmptySources <value>                                                                                               ($BLOB_ALLOW_EMPTY_SOURCES)
          Whether to allow having no blob sources configured during startup

    --archiver.blobFileStoreUrls <value>                                                                                                   ($BLOB_FILE_STORE_URLS)
          URLs for filestore blob archive, comma-separated. Tried in order until blobs are found.

    --archiver.blobFileStoreUploadUrl <value>                                                                                              ($BLOB_FILE_STORE_UPLOAD_URL)
          URL for uploading blobs to filestore (s3://, gs://, file://)

    --archiver.blobHealthcheckUploadIntervalMinutes <value>                                                                                ($BLOB_HEALTHCHECK_UPLOAD_INTERVAL_MINUTES)
          Interval in minutes for uploading healthcheck file to file store (default: 60 = 1 hour)

    --archiver.archiveApiUrl <value>                                                                                                       ($BLOB_ARCHIVE_API_URL)
          The URL of the archive API

    --archiver.archiverPollingIntervalMS <value>                             (default: 500)                                                ($ARCHIVER_POLLING_INTERVAL_MS)
          The polling interval in ms for retrieving new L2 blocks and encrypted logs.

    --archiver.archiverBatchSize <value>                                     (default: 100)                                                ($ARCHIVER_BATCH_SIZE)
          The number of L2 blocks the archiver will attempt to download at a time.

    --archiver.maxLogs <value>                                               (default: 1000)                                               ($ARCHIVER_MAX_LOGS)
          The max number of logs that can be obtained in 1 "getPublicLogs" call.

    --archiver.archiverStoreMapSizeKb <value>                                                                                              ($ARCHIVER_STORE_MAP_SIZE_KB)
          The maximum possible size of the archiver DB in KB. Overwrites the general dataStoreMapSizeKb.

    --archiver.skipValidateCheckpointAttestations <value>                                                                                  
          Skip validating checkpoint attestations (for testing purposes only)

    --archiver.maxAllowedEthClientDriftSeconds <value>                       (default: 300)                                                ($MAX_ALLOWED_ETH_CLIENT_DRIFT_SECONDS)
          Maximum allowed drift in seconds between the Ethereum client and current time.

    --archiver.ethereumAllowNoDebugHosts <value>                             (default: true)                                               ($ETHEREUM_ALLOW_NO_DEBUG_HOSTS)
          Whether to allow starting the archiver without debug/trace method support on Ethereum hosts

  SEQUENCER

    --sequencer                                                                                                                            
          Starts Aztec Sequencer with options

    --sequencer.validatorPrivateKeys <value>                                 (default: [Redacted])                                         ($VALIDATOR_PRIVATE_KEYS)
          List of private keys of the validators participating in attestation duties

    --sequencer.validatorAddresses <value>                                   (default: )                                                   ($VALIDATOR_ADDRESSES)
          List of addresses of the validators to use with remote signers

    --sequencer.disableValidator <value>                                                                                                   ($VALIDATOR_DISABLED)
          Do not run the validator

    --sequencer.disabledValidators <value>                                   (default: )                                                   
          Temporarily disable these specific validator addresses

    --sequencer.attestationPollingIntervalMs <value>                         (default: 200)                                                ($VALIDATOR_ATTESTATIONS_POLLING_INTERVAL_MS)
          Interval between polling for new attestations

    --sequencer.validatorReexecute <value>                                   (default: true)                                               ($VALIDATOR_REEXECUTE)
          Re-execute transactions before attesting

    --sequencer.alwaysReexecuteBlockProposals <value>                        (default: true)                                               
          Whether to always reexecute block proposals, even for non-validator nodes (useful for monitoring network status).

    --sequencer.skipCheckpointProposalValidation <value>                                                                                   
          Skip checkpoint proposal validation and always attest (default: false)

    --sequencer.skipPushProposedBlocksToArchiver <value>                                                                                   
          Skip pushing proposed blocks to archiver (default: true)

    --sequencer.attestToEquivocatedProposals <value>                                                                                       
          Agree to attest to equivocated checkpoint proposals (for testing purposes only)

    --sequencer.validateMaxL2BlockGas <value>                                                                                              ($VALIDATOR_MAX_L2_BLOCK_GAS)
          Maximum L2 block gas for validation. Proposals exceeding this limit are rejected.

    --sequencer.validateMaxDABlockGas <value>                                                                                              ($VALIDATOR_MAX_DA_BLOCK_GAS)
          Maximum DA block gas for validation. Proposals exceeding this limit are rejected.

    --sequencer.validateMaxTxsPerBlock <value>                                                                                             ($VALIDATOR_MAX_TX_PER_BLOCK)
          Maximum transactions per block for validation. Proposals exceeding this limit are rejected.

    --sequencer.validateMaxTxsPerCheckpoint <value>                                                                                        ($VALIDATOR_MAX_TX_PER_CHECKPOINT)
          Maximum transactions per checkpoint for validation. Proposals exceeding this limit are rejected.

    --sequencer.haSigningEnabled <value>                                                                                                   ($VALIDATOR_HA_SIGNING_ENABLED)
          Whether HA signing / slashing protection is enabled

    --sequencer.nodeId <value>                                                                                                             ($VALIDATOR_HA_NODE_ID)
          The unique identifier for this node

    --sequencer.pollingIntervalMs <value>                                    (default: 100)                                                ($VALIDATOR_HA_POLLING_INTERVAL_MS)
          The number of ms to wait between polls when a duty is being signed

    --sequencer.signingTimeoutMs <value>                                     (default: 3000)                                               ($VALIDATOR_HA_SIGNING_TIMEOUT_MS)
          The maximum time to wait for a duty being signed to complete

    --sequencer.maxStuckDutiesAgeMs <value>                                                                                                ($VALIDATOR_HA_MAX_STUCK_DUTIES_AGE_MS)
          The maximum age of a stuck duty in ms (defaults to 2x Aztec slot duration)

    --sequencer.cleanupOldDutiesAfterHours <value>                                                                                         ($VALIDATOR_HA_OLD_DUTIES_MAX_AGE_H)
          Optional: clean up old duties after this many hours (disabled if not set)

    --sequencer.databaseUrl <value>                                                                                                        ($VALIDATOR_HA_DATABASE_URL)
          PostgreSQL connection string for validator HA signer (format: postgresql://user:password@host:port/database)

    --sequencer.poolMaxCount <value>                                         (default: 10)                                                 ($VALIDATOR_HA_POOL_MAX)
          Maximum number of clients in the pool

    --sequencer.poolMinCount <value>                                                                                                       ($VALIDATOR_HA_POOL_MIN)
          Minimum number of clients in the pool

    --sequencer.poolIdleTimeoutMs <value>                                    (default: 10000)                                              ($VALIDATOR_HA_POOL_IDLE_TIMEOUT_MS)
          Idle timeout in milliseconds

    --sequencer.poolConnectionTimeoutMs <value>                                                                                            ($VALIDATOR_HA_POOL_CONNECTION_TIMEOUT_MS)
          Connection timeout in milliseconds (0 means no timeout)

    --sequencer.sequencerPollingIntervalMS <value>                           (default: 500)                                                ($SEQ_POLLING_INTERVAL_MS)
          The number of ms to wait between polling for checking to build on the next slot.

    --sequencer.maxTxsPerCheckpoint <value>                                                                                                ($SEQ_MAX_TX_PER_CHECKPOINT)
          The maximum number of txs across all blocks in a checkpoint.

    --sequencer.minTxsPerBlock <value>                                       (default: 1)                                                  ($SEQ_MIN_TX_PER_BLOCK)
          The minimum number of txs to include in a block.

    --sequencer.minValidTxsPerBlock <value>                                                                                                
          The minimum number of valid txs (after execution) to include in a block. If not set, falls back to minTxsPerBlock.

    --sequencer.publishTxsWithProposals <value>                                                                                            ($SEQ_PUBLISH_TXS_WITH_PROPOSALS)
          Whether to publish txs with proposals.

    --sequencer.maxL2BlockGas <value>                                                                                                      ($SEQ_MAX_L2_BLOCK_GAS)
          The maximum L2 block gas.

    --sequencer.maxDABlockGas <value>                                                                                                      ($SEQ_MAX_DA_BLOCK_GAS)
          The maximum DA block gas.

    --sequencer.perBlockAllocationMultiplier <value>                         (default: 1.2)                                                ($SEQ_PER_BLOCK_ALLOCATION_MULTIPLIER)
          Per-block gas budget multiplier for both L2 and DA gas. Budget per block is (checkpointLimit / maxBlocks) * multiplier. Values greater than one allow early blocks to use more than their even share, relying on checkpoint-level capping for later blocks.

    --sequencer.redistributeCheckpointBudget <value>                         (default: true)                                               ($SEQ_REDISTRIBUTE_CHECKPOINT_BUDGET)
          Redistribute remaining checkpoint budget evenly across remaining blocks instead of allowing a single block to consume the entire remaining budget.

    --sequencer.coinbase <value>                                                                                                           ($COINBASE)
          Recipient of block reward.

    --sequencer.feeRecipient <value>                                                                                                       ($FEE_RECIPIENT)
          Address to receive fees.

    --sequencer.acvmWorkingDirectory <value>                                                                                               ($ACVM_WORKING_DIRECTORY)
          The working directory to use for simulation/proving

    --sequencer.acvmBinaryPath <value>                                                                                                     ($ACVM_BINARY_PATH)
          The path to the ACVM binary

    --sequencer.enforceTimeTable <value>                                     (default: true)                                               ($SEQ_ENFORCE_TIME_TABLE)
          Whether to enforce the time table when building blocks

    --sequencer.governanceProposerPayload <value>                                                                                          ($GOVERNANCE_PROPOSER_PAYLOAD_ADDRESS)
          The address of the payload for the governanceProposer

    --sequencer.l1PublishingTime <value>                                                                                                   ($SEQ_L1_PUBLISHING_TIME_ALLOWANCE_IN_SLOT)
          How much time (in seconds) we allow in the slot for publishing the L1 tx (defaults to 1 L1 slot).

    --sequencer.attestationPropagationTime <value>                           (default: 2)                                                  ($SEQ_ATTESTATION_PROPAGATION_TIME)
          How many seconds it takes for proposals and attestations to travel across the p2p layer (one-way)

    --sequencer.secondsBeforeInvalidatingBlockAsCommitteeMember <value>      (default: 144)                                                ($SEQ_SECONDS_BEFORE_INVALIDATING_BLOCK_AS_COMMITTEE_MEMBER)
          How many seconds to wait before trying to invalidate a block from the pending chain as a committee member (zero to never invalidate). The next proposer is expected to invalidate, so the committee acts as a fallback.

    --sequencer.secondsBeforeInvalidatingBlockAsNonCommitteeMember <value>   (default: 432)                                                ($SEQ_SECONDS_BEFORE_INVALIDATING_BLOCK_AS_NON_COMMITTEE_MEMBER)
          How many seconds to wait before trying to invalidate a block from the pending chain as a non-committee member (zero to never invalidate). The next proposer is expected to invalidate, then the committee, so other sequencers act as a fallback.

    --sequencer.broadcastInvalidBlockProposal <value>                                                                                      
          Broadcast invalid block proposals with corrupted state (for testing only)

    --sequencer.injectFakeAttestation <value>                                                                                              
          Inject a fake attestation (for testing only)

    --sequencer.injectHighSValueAttestation <value>                                                                                        
          Inject a malleable attestation with a high-s value (for testing only)

    --sequencer.injectUnrecoverableSignatureAttestation <value>                                                                            
          Inject an attestation with an unrecoverable signature (for testing only)

    --sequencer.shuffleAttestationOrdering <value>                                                                                         
          Shuffle attestation ordering to create invalid ordering (for testing only)

    --sequencer.blockDurationMs <value>                                                                                                    ($SEQ_BLOCK_DURATION_MS)
          Duration per block in milliseconds when building multiple blocks per slot. If undefined (default), builds a single block per slot using the full slot duration.

    --sequencer.expectedBlockProposalsPerSlot <value>                                                                                      ($SEQ_EXPECTED_BLOCK_PROPOSALS_PER_SLOT)
          Expected number of block proposals per slot for P2P peer scoring. 0 (default) disables block proposal scoring. Set to a positive value to enable.

    --sequencer.maxTxsPerBlock <value>                                                                                                     ($SEQ_MAX_TX_PER_BLOCK)
          The maximum number of txs to include in a block.

    --sequencer.buildCheckpointIfEmpty <value>                                                                                             ($SEQ_BUILD_CHECKPOINT_IF_EMPTY)
          Have sequencer build and publish an empty checkpoint if there are no txs

    --sequencer.minBlocksForCheckpoint <value>                                                                                             
          Minimum number of blocks required for a checkpoint proposal (test only)

    --sequencer.skipPublishingCheckpointsPercent <value>                                                                                   ($SEQ_SKIP_CHECKPOINT_PUBLISH_PERCENT)
          Percent probability (0 - 100) of sequencer skipping checkpoint publishing (testing only)

    --sequencer.txPublicSetupAllowListExtend <value>                                                                                       ($TX_PUBLIC_SETUP_ALLOWLIST)
          Additional entries to extend the default setup allow list. Format: I:address:selector[:flags],C:classId:selector[:flags]. Flags: os (onlySelf), rn (rejectNullMsgSender), cl=N (calldataLength), joined with +.

    --sequencer.keyStoreDirectory <value>                                                                                                  ($KEY_STORE_DIRECTORY)
          Location of key store directory

    --sequencer.sequencerPublisherPrivateKeys <value>                        (default: )                                                   ($SEQ_PUBLISHER_PRIVATE_KEYS)
          The private keys to be used by the sequencer publisher.

    --sequencer.sequencerPublisherAddresses <value>                          (default: )                                                   ($SEQ_PUBLISHER_ADDRESSES)
          The addresses of the publishers to use with remote signers

    --sequencer.blobAllowEmptySources <value>                                                                                              ($BLOB_ALLOW_EMPTY_SOURCES)
          Whether to allow having no blob sources configured during startup

    --sequencer.blobFileStoreUrls <value>                                                                                                  ($BLOB_FILE_STORE_URLS)
          URLs for filestore blob archive, comma-separated. Tried in order until blobs are found.

    --sequencer.blobFileStoreUploadUrl <value>                                                                                             ($BLOB_FILE_STORE_UPLOAD_URL)
          URL for uploading blobs to filestore (s3://, gs://, file://)

    --sequencer.blobHealthcheckUploadIntervalMinutes <value>                                                                               ($BLOB_HEALTHCHECK_UPLOAD_INTERVAL_MINUTES)
          Interval in minutes for uploading healthcheck file to file store (default: 60 = 1 hour)

    --sequencer.archiveApiUrl <value>                                                                                                      ($BLOB_ARCHIVE_API_URL)
          The URL of the archive API

    --sequencer.sequencerPublisherAllowInvalidStates <value>                 (default: true)                                               ($SEQ_PUBLISHER_ALLOW_INVALID_STATES)
          True to use publishers in invalid states (timed out, cancelled, etc) if no other is available

    --sequencer.sequencerPublisherForwarderAddress <value>                                                                                 ($SEQ_PUBLISHER_FORWARDER_ADDRESS)
          Address of the forwarder contract to wrap all L1 transactions through (for testing purposes only)

  PROVER NODE

    --prover-node                                                                                                                          
          Starts Aztec Prover Node with options

    --proverNode.keyStoreDirectory <value>                                                                                                 ($KEY_STORE_DIRECTORY)
          Location of key store directory

    --proverNode.acvmWorkingDirectory <value>                                                                                              ($ACVM_WORKING_DIRECTORY)
          The working directory to use for simulation/proving

    --proverNode.acvmBinaryPath <value>                                                                                                    ($ACVM_BINARY_PATH)
          The path to the ACVM binary

    --proverNode.bbWorkingDirectory <value>                                                                                                ($BB_WORKING_DIRECTORY)
          The working directory to use for proving

    --proverNode.bbBinaryPath <value>                                                                                                      ($BB_BINARY_PATH)
          The path to the bb binary

    --proverNode.bbSkipCleanup <value>                                                                                                     ($BB_SKIP_CLEANUP)
          Whether to skip cleanup of bb temporary files

    --proverNode.numConcurrentIVCVerifiers <value>                           (default: 8)                                                  ($BB_NUM_IVC_VERIFIERS)
          Max number of chonk verifiers to run concurrently

    --proverNode.bbIVCConcurrency <value>                                    (default: 1)                                                  ($BB_IVC_CONCURRENCY)
          Number of threads to use for IVC verification

    --proverNode.nodeUrl <value>                                                                                                           ($AZTEC_NODE_URL)
          The URL to the Aztec node to take proving jobs from

    --proverNode.proverId <value>                                                                                                          ($PROVER_ID)
          Hex value that identifies the prover. Defaults to the address used for submitting proofs if not set.

    --proverNode.failedProofStore <value>                                                                                                  ($PROVER_FAILED_PROOF_STORE)
          Store for failed proof inputs. Google cloud storage is only supported at the moment. Set this value as gs://bucket-name/path/to/store.

    --proverNode.enqueueConcurrency <value>                                  (default: 50)                                                 ($PROVER_ENQUEUE_CONCURRENCY)
          Max concurrent jobs the orchestrator serializes and enqueues to the broker.

    --proverNode.blobSinkMapSizeKb <value>                                                                                                 ($BLOB_SINK_MAP_SIZE_KB)
          The maximum possible size of the blob sink DB in KB. Overwrites the general dataStoreMapSizeKb.

    --proverNode.blobAllowEmptySources <value>                                                                                             ($BLOB_ALLOW_EMPTY_SOURCES)
          Whether to allow having no blob sources configured during startup

    --proverNode.blobFileStoreUrls <value>                                                                                                 ($BLOB_FILE_STORE_URLS)
          URLs for filestore blob archive, comma-separated. Tried in order until blobs are found.

    --proverNode.blobFileStoreUploadUrl <value>                                                                                            ($BLOB_FILE_STORE_UPLOAD_URL)
          URL for uploading blobs to filestore (s3://, gs://, file://)

    --proverNode.blobHealthcheckUploadIntervalMinutes <value>                                                                              ($BLOB_HEALTHCHECK_UPLOAD_INTERVAL_MINUTES)
          Interval in minutes for uploading healthcheck file to file store (default: 60 = 1 hour)

    --proverNode.archiveApiUrl <value>                                                                                                     ($BLOB_ARCHIVE_API_URL)
          The URL of the archive API

    --proverNode.proverPublisherAllowInvalidStates <value>                   (default: true)                                               ($PROVER_PUBLISHER_ALLOW_INVALID_STATES)
          True to use publishers in invalid states (timed out, cancelled, etc) if no other is available

    --proverNode.proverPublisherForwarderAddress <value>                                                                                   ($PROVER_PUBLISHER_FORWARDER_ADDRESS)
          Address of the forwarder contract to wrap all L1 transactions through (for testing purposes only)

    --proverNode.proverPublisherPrivateKeys <value>                          (default: )                                                   ($PROVER_PUBLISHER_PRIVATE_KEYS)
          The private keys to be used by the prover publisher.

    --proverNode.proverPublisherAddresses <value>                            (default: )                                                   ($PROVER_PUBLISHER_ADDRESSES)
          The addresses of the publishers to use with remote signers

    --proverNode.proverNodeMaxPendingJobs <value>                            (default: 10)                                                 ($PROVER_NODE_MAX_PENDING_JOBS)
          The maximum number of pending jobs for the prover node

    --proverNode.proverNodePollingIntervalMs <value>                         (default: 1000)                                               ($PROVER_NODE_POLLING_INTERVAL_MS)
          The interval in milliseconds to poll for new jobs

    --proverNode.proverNodeMaxParallelBlocksPerEpoch <value>                                                                               ($PROVER_NODE_MAX_PARALLEL_BLOCKS_PER_EPOCH)
          The Maximum number of blocks to process in parallel while proving an epoch

    --proverNode.proverNodeFailedEpochStore <value>                                                                                        ($PROVER_NODE_FAILED_EPOCH_STORE)
          File store where to upload node state when an epoch fails to be proven

    --proverNode.proverNodeEpochProvingDelayMs <value>                                                                                     
          Optional delay in milliseconds to wait before proving a new epoch

    --proverNode.txGatheringIntervalMs <value>                               (default: 1000)                                               ($PROVER_NODE_TX_GATHERING_INTERVAL_MS)
          How often to check that tx data is available

    --proverNode.txGatheringBatchSize <value>                                (default: 10)                                                 ($PROVER_NODE_TX_GATHERING_BATCH_SIZE)
          How many transactions to gather from a node in a single request

    --proverNode.txGatheringMaxParallelRequestsPerNode <value>               (default: 100)                                                ($PROVER_NODE_TX_GATHERING_MAX_PARALLEL_REQUESTS_PER_NODE)
          How many tx requests to make in parallel to each node

    --proverNode.txGatheringTimeoutMs <value>                                (default: 120000)                                             ($PROVER_NODE_TX_GATHERING_TIMEOUT_MS)
          How long to wait for tx data to be available before giving up

    --proverNode.proverNodeDisableProofPublish <value>                                                                                     ($PROVER_NODE_DISABLE_PROOF_PUBLISH)
          Whether the prover node skips publishing proofs to L1

    --proverNode.web3SignerUrl <value>                                                                                                     ($WEB3_SIGNER_URL)
          URL of the Web3Signer instance

  PROVER BROKER

    --prover-broker                                                                                                                        
          Starts Aztec proving job broker

    --proverBroker.proverBrokerJobTimeoutMs <value>                          (default: 30000)                                              ($PROVER_BROKER_JOB_TIMEOUT_MS)
          Jobs are retried if not kept alive for this long

    --proverBroker.proverBrokerPollIntervalMs <value>                        (default: 1000)                                               ($PROVER_BROKER_POLL_INTERVAL_MS)
          The interval to check job health status

    --proverBroker.proverBrokerJobMaxRetries <value>                         (default: 3)                                                  ($PROVER_BROKER_JOB_MAX_RETRIES)
          If starting a prover broker locally, the max number of retries per proving job

    --proverBroker.proverBrokerBatchSize <value>                             (default: 100)                                                ($PROVER_BROKER_BATCH_SIZE)
          The prover broker writes jobs to disk in batches

    --proverBroker.proverBrokerBatchIntervalMs <value>                       (default: 50)                                                 ($PROVER_BROKER_BATCH_INTERVAL_MS)
          How often to flush batches to disk

    --proverBroker.proverBrokerMaxEpochsToKeepResultsFor <value>             (default: 1)                                                  ($PROVER_BROKER_MAX_EPOCHS_TO_KEEP_RESULTS_FOR)
          The maximum number of epochs to keep results for

    --proverBroker.proverBrokerStoreMapSizeKb <value>                                                                                      ($PROVER_BROKER_STORE_MAP_SIZE_KB)
          The size of the prover broker's database. Will override the dataStoreMapSizeKb if set.

    --proverBroker.proverBrokerDebugReplayEnabled <value>                                                                                  ($PROVER_BROKER_DEBUG_REPLAY_ENABLED)
          Enable debug replay mode for replaying proving jobs from stored inputs

  PROVER AGENT

    --prover-agent                                                                                                                         
          Starts Aztec Prover Agent with options

    --proverAgent.proverAgentCount <value>                                   (default: 1)                                                  ($PROVER_AGENT_COUNT)
          Whether this prover has a local prover agent

    --proverAgent.proverAgentPollIntervalMs <value>                          (default: 1000)                                               ($PROVER_AGENT_POLL_INTERVAL_MS)
          The interval agents poll for jobs at

    --proverAgent.proverAgentProofTypes <value>                                                                                            ($PROVER_AGENT_PROOF_TYPES)
          The types of proofs the prover agent can generate

    --proverAgent.proverBrokerUrl <value>                                                                                                  ($PROVER_BROKER_HOST)
          The URL where this agent takes jobs from

    --proverAgent.realProofs <value>                                         (default: true)                                               ($PROVER_REAL_PROOFS)
          Whether to construct real proofs

    --proverAgent.proverTestDelayType <value>                                (default: fixed)                                              ($PROVER_TEST_DELAY_TYPE)
          The type of artificial delay to introduce

    --proverAgent.proverTestDelayMs <value>                                                                                                ($PROVER_TEST_DELAY_MS)
          Artificial delay to introduce to all operations to the test prover.

    --proverAgent.proverTestDelayFactor <value>                              (default: 1)                                                  ($PROVER_TEST_DELAY_FACTOR)
          If using realistic delays, what percentage of realistic times to apply.

    --proverAgent.proverTestVerificationDelayMs <value>                      (default: 10)                                                 ($PROVER_TEST_VERIFICATION_DELAY_MS)
          The delay (ms) to inject during fake proof verification

    --proverAgent.cancelJobsOnStop <value>                                                                                                 ($PROVER_CANCEL_JOBS_ON_STOP)
          Whether to abort pending proving jobs when the orchestrator is cancelled. When false (default), jobs remain in the broker queue and can be reused on restart/reorg.

    --proverAgent.proofStore <value>                                                                                                       ($PROVER_PROOF_STORE)
          Optional proof input store for the prover

  P2P SUBSYSTEM

    --p2p-enabled [value]                                                                                                                  ($P2P_ENABLED)
          Enable P2P subsystem

    --p2p.validateMaxTxsPerBlock <value>                                                                                                   ($VALIDATOR_MAX_TX_PER_BLOCK)
          Maximum transactions per block for validation. Overrides maxTxsPerBlock for gossip validation when set.

    --p2p.validateMaxTxsPerCheckpoint <value>                                                                                              ($VALIDATOR_MAX_TX_PER_CHECKPOINT)
          Maximum transactions per checkpoint for validation. Used as fallback for maxTxsPerBlock when that is not set.

    --p2p.validateMaxL2BlockGas <value>                                                                                                    ($VALIDATOR_MAX_L2_BLOCK_GAS)
          Maximum L2 gas per block for validation. When set, txs exceeding this limit are rejected.

    --p2p.validateMaxDABlockGas <value>                                                                                                    ($VALIDATOR_MAX_DA_BLOCK_GAS)
          Maximum DA gas per block for validation. When set, txs exceeding this limit are rejected.

    --p2p.p2pDiscoveryDisabled <value>                                                                                                     ($P2P_DISCOVERY_DISABLED)
          A flag dictating whether the P2P discovery system should be disabled.

    --p2p.blockCheckIntervalMS <value>                                       (default: 100)                                                ($P2P_BLOCK_CHECK_INTERVAL_MS)
          The frequency in which to check for new L2 blocks.

    --p2p.slotCheckIntervalMS <value>                                        (default: 1000)                                               ($P2P_SLOT_CHECK_INTERVAL_MS)
          The frequency in which to check for new L2 slots.

    --p2p.debugDisableColocationPenalty <value>                                                                                            ($DEBUG_P2P_DISABLE_COLOCATION_PENALTY)
          DEBUG: Disable colocation penalty - NEVER set to true in production

    --p2p.peerCheckIntervalMS <value>                                        (default: 30000)                                              ($P2P_PEER_CHECK_INTERVAL_MS)
          The frequency in which to check for new peers.

    --p2p.l2QueueSize <value>                                                (default: 1000)                                               ($P2P_L2_QUEUE_SIZE)
          Size of queue of L2 blocks to store.

    --p2p.listenAddress <value>                                              (default: 0.0.0.0)                                            ($P2P_LISTEN_ADDR)
          The listen address. ipv4 address.

    --p2p.p2pPort <value>                                                    (default: 40400)                                              ($P2P_PORT)
          The port for the P2P service. Defaults to 40400

    --p2p.p2pBroadcastPort <value>                                                                                                         ($P2P_BROADCAST_PORT)
          The port to broadcast the P2P service on (included in the node's ENR). Defaults to P2P_PORT.

    --p2p.p2pIp <value>                                                                                                                    ($P2P_IP)
          The IP address for the P2P service. ipv4 address.

    --p2p.peerIdPrivateKey <value>                                                                                                         ($PEER_ID_PRIVATE_KEY)
          An optional peer id private key. If blank, will generate a random key.

    --p2p.peerIdPrivateKeyPath <value>                                                                                                     ($PEER_ID_PRIVATE_KEY_PATH)
          An optional path to store generated peer id private keys. If blank, will default to storing any generated keys in the root of the data directory.

    --p2p.bootstrapNodes <value>                                             (default: )                                                   ($BOOTSTRAP_NODES)
          A list of bootstrap peer ENRs to connect to. Separated by commas.

    --p2p.bootstrapNodeEnrVersionCheck <value>                                                                                             ($P2P_BOOTSTRAP_NODE_ENR_VERSION_CHECK)
          Whether to check the version of the bootstrap node ENR.

    --p2p.bootstrapNodesAsFullPeers <value>                                                                                                ($P2P_BOOTSTRAP_NODES_AS_FULL_PEERS)
          Whether to consider our configured bootnodes as full peers

    --p2p.maxPeerCount <value>                                               (default: 100)                                                ($P2P_MAX_PEERS)
          The maximum number of peers to connect to.

    --p2p.queryForIp <value>                                                                                                               ($P2P_QUERY_FOR_IP)
          If announceUdpAddress or announceTcpAddress are not provided, query for the IP address of the machine. Default is false.

    --p2p.gossipsubInterval <value>                                          (default: 700)                                                ($P2P_GOSSIPSUB_INTERVAL_MS)
          The interval of the gossipsub heartbeat to perform maintenance tasks.

    --p2p.gossipsubD <value>                                                 (default: 8)                                                  ($P2P_GOSSIPSUB_D)
          The D parameter for the gossipsub protocol.

    --p2p.gossipsubDlo <value>                                               (default: 4)                                                  ($P2P_GOSSIPSUB_DLO)
          The Dlo parameter for the gossipsub protocol.

    --p2p.gossipsubDhi <value>                                               (default: 12)                                                 ($P2P_GOSSIPSUB_DHI)
          The Dhi parameter for the gossipsub protocol.

    --p2p.gossipsubDLazy <value>                                             (default: 8)                                                  ($P2P_GOSSIPSUB_DLAZY)
          The Dlazy parameter for the gossipsub protocol.

    --p2p.gossipsubFloodPublish <value>                                                                                                    ($P2P_GOSSIPSUB_FLOOD_PUBLISH)
          Whether to flood publish messages. - For testing purposes only

    --p2p.gossipsubMcacheLength <value>                                      (default: 6)                                                  ($P2P_GOSSIPSUB_MCACHE_LENGTH)
          The number of gossipsub interval message cache windows to keep.

    --p2p.gossipsubMcacheGossip <value>                                      (default: 3)                                                  ($P2P_GOSSIPSUB_MCACHE_GOSSIP)
          How many message cache windows to include when gossiping with other peers.

    --p2p.gossipsubSeenTTL <value>                                           (default: 1200000)                                            ($P2P_GOSSIPSUB_SEEN_TTL)
          How long to keep message IDs in the seen cache.

    --p2p.gossipsubTxTopicWeight <value>                                     (default: 1)                                                  ($P2P_GOSSIPSUB_TX_TOPIC_WEIGHT)
          The weight of the tx topic for the gossipsub protocol.

    --p2p.gossipsubTxInvalidMessageDeliveriesWeight <value>                  (default: -20)                                                ($P2P_GOSSIPSUB_TX_INVALID_MESSAGE_DELIVERIES_WEIGHT)
          The weight of the tx invalid message deliveries for the gossipsub protocol.

    --p2p.gossipsubTxInvalidMessageDeliveriesDecay <value>                   (default: 0.5)                                                ($P2P_GOSSIPSUB_TX_INVALID_MESSAGE_DELIVERIES_DECAY)
          Determines how quickly the penalty for invalid message deliveries decays over time. Between 0 and 1.

    --p2p.peerPenaltyValues <value>                                          (default: 2,10,50)                                            ($P2P_PEER_PENALTY_VALUES)
          The values for the peer scoring system. Passed as a comma separated list of values in order: low, mid, high tolerance errors.

    --p2p.doubleSpendSeverePeerPenaltyWindow <value>                         (default: 30)                                                 ($P2P_DOUBLE_SPEND_SEVERE_PEER_PENALTY_WINDOW)
          The "age" (in L2 blocks) of a tx after which we heavily penalize a peer for sending it.

    --p2p.blockRequestBatchSize <value>                                      (default: 20)                                                 ($P2P_BLOCK_REQUEST_BATCH_SIZE)
          The number of blocks to fetch in a single batch.

    --p2p.archivedTxLimit <value>                                                                                                          ($P2P_ARCHIVED_TX_LIMIT)
          The number of transactions that will be archived. If the limit is set to 0 then archiving will be disabled.

    --p2p.trustedPeers <value>                                               (default: )                                                   ($P2P_TRUSTED_PEERS)
          A list of trusted peer ENRs that will always be persisted. Separated by commas.

    --p2p.privatePeers <value>                                               (default: )                                                   ($P2P_PRIVATE_PEERS)
          A list of private peer ENRs that will always be persisted and not be used for discovery. Separated by commas.

    --p2p.preferredPeers <value>                                             (default: )                                                   ($P2P_PREFERRED_PEERS)
          A list of preferred peer ENRs that will always be persisted and not be used for discovery. Separated by commas.

    --p2p.p2pStoreMapSizeKb <value>                                                                                                        ($P2P_STORE_MAP_SIZE_KB)
          The maximum possible size of the P2P DB in KB. Overwrites the general dataStoreMapSizeKb.

    --p2p.txPublicSetupAllowListExtend <value>                                                                                             ($TX_PUBLIC_SETUP_ALLOWLIST)
          Additional entries to extend the default setup allow list. Format: I:address:selector[:flags],C:classId:selector[:flags]. Flags: os (onlySelf), rn (rejectNullMsgSender), cl=N (calldataLength), joined with +.

    --p2p.maxPendingTxCount <value>                                          (default: 1000)                                               ($P2P_MAX_PENDING_TX_COUNT)
          The maximum number of pending txs before evicting lower priority txs.

    --p2p.seenMessageCacheSize <value>                                       (default: 100000)                                             ($P2P_SEEN_MSG_CACHE_SIZE)
          The number of messages to keep in the seen message cache

    --p2p.p2pDisableStatusHandshake <value>                                                                                                ($P2P_DISABLE_STATUS_HANDSHAKE)
          True to disable the status handshake on peer connected.

    --p2p.p2pAllowOnlyValidators <value>                                                                                                   ($P2P_ALLOW_ONLY_VALIDATORS)
          True to only permit validators to connect.

    --p2p.p2pMaxFailedAuthAttemptsAllowed <value>                            (default: 3)                                                  ($P2P_MAX_AUTH_FAILED_ATTEMPTS_ALLOWED)
          Number of auth attempts to allow before peer is banned. Number is inclusive

    --p2p.dropTransactions <value>                                                                                                         ($P2P_DROP_TX)
          True to simulate discarding transactions. - For testing purposes only

    --p2p.dropTransactionsProbability <value>                                                                                              ($P2P_DROP_TX_CHANCE)
          The probability that a transaction is discarded (0 - 1). - For testing purposes only

    --p2p.disableTransactions <value>                                                                                                      ($TRANSACTIONS_DISABLED)
          Whether transactions are disabled for this node. This means transactions will be rejected at the RPC and P2P layers.

    --p2p.txPoolDeleteTxsAfterReorg <value>                                                                                                ($P2P_TX_POOL_DELETE_TXS_AFTER_REORG)
          Whether to delete transactions from the pool after a reorg instead of moving them back to pending.

    --p2p.debugP2PInstrumentMessages <value>                                                                                               ($DEBUG_P2P_INSTRUMENT_MESSAGES)
          Alters the format of p2p messages to include things like broadcast timestamp FOR TESTING ONLY

    --p2p.broadcastEquivocatedProposals <value>                                                                                            
          Broadcast block proposals even when a conflicting proposal for the same slot already exists in the pool (for testing purposes only).

    --p2p.minTxPoolAgeMs <value>                                             (default: 2000)                                               ($P2P_MIN_TX_POOL_AGE_MS)
          Minimum age (ms) a transaction must have been in the pool before it is eligible for block building.

    --p2p.priceBumpPercentage <value>                                        (default: 10)                                                 ($P2P_RPC_PRICE_BUMP_PERCENTAGE)
          Minimum percentage fee increase required to replace an existing tx via RPC. Even at 0%, replacement still requires paying at least 1 unit more.

    --p2p.blockDurationMs <value>                                                                                                          ($SEQ_BLOCK_DURATION_MS)
          Duration per block in milliseconds when building multiple blocks per slot. If undefined (default), builds a single block per slot using the full slot duration.

    --p2p.expectedBlockProposalsPerSlot <value>                                                                                            ($SEQ_EXPECTED_BLOCK_PROPOSALS_PER_SLOT)
          Expected number of block proposals per slot for P2P peer scoring. 0 (default) disables block proposal scoring. Set to a positive value to enable.

    --p2p.maxTxsPerBlock <value>                                                                                                           ($SEQ_MAX_TX_PER_BLOCK)
          The maximum number of txs to include in a block.

    --p2p.overallRequestTimeoutMs <value>                                    (default: 10000)                                              ($P2P_REQRESP_OVERALL_REQUEST_TIMEOUT_MS)
          The overall timeout for a request response operation.

    --p2p.individualRequestTimeoutMs <value>                                 (default: 10000)                                              ($P2P_REQRESP_INDIVIDUAL_REQUEST_TIMEOUT_MS)
          The timeout for an individual request response peer interaction.

    --p2p.dialTimeoutMs <value>                                              (default: 5000)                                               ($P2P_REQRESP_DIAL_TIMEOUT_MS)
          How long to wait for the dial protocol to establish a connection

    --p2p.p2pOptimisticNegotiation <value>                                                                                                 ($P2P_REQRESP_OPTIMISTIC_NEGOTIATION)
          Whether to use optimistic protocol negotiation when dialing to another peer (opposite of `negotiateFully`).

    --p2p.batchTxRequesterSmartParallelWorkerCount <value>                   (default: 10)                                                 ($P2P_BATCH_TX_REQUESTER_SMART_PARALLEL_WORKER_COUNT)
          Max concurrent requests to smart peers for batch tx requester.

    --p2p.batchTxRequesterDumbParallelWorkerCount <value>                    (default: 10)                                                 ($P2P_BATCH_TX_REQUESTER_DUMB_PARALLEL_WORKER_COUNT)
          Max concurrent requests to dumb peers for batch tx requester.

    --p2p.batchTxRequesterTxBatchSize <value>                                (default: 8)                                                  ($P2P_BATCH_TX_REQUESTER_TX_BATCH_SIZE)
          Max transactions per request / chunk size for batch tx requester.

    --p2p.batchTxRequesterBadPeerThreshold <value>                           (default: 2)                                                  ($P2P_BATCH_TX_REQUESTER_BAD_PEER_THRESHOLD)
          Failures before a peer is considered bad (see > threshold logic).

    --p2p.txCollectionFastNodesTimeoutBeforeReqRespMs <value>                (default: 200)                                                ($TX_COLLECTION_FAST_NODES_TIMEOUT_BEFORE_REQ_RESP_MS)
          How long to wait before starting reqresp for fast collection

    --p2p.txCollectionSlowNodesIntervalMs <value>                            (default: 12000)                                              ($TX_COLLECTION_SLOW_NODES_INTERVAL_MS)
          How often to collect from configured nodes in the slow collection loop

    --p2p.txCollectionSlowReqRespIntervalMs <value>                          (default: 12000)                                              ($TX_COLLECTION_SLOW_REQ_RESP_INTERVAL_MS)
          How often to collect from peers via reqresp in the slow collection loop

    --p2p.txCollectionSlowReqRespTimeoutMs <value>                           (default: 20000)                                              ($TX_COLLECTION_SLOW_REQ_RESP_TIMEOUT_MS)
          How long to wait for a reqresp response during slow collection

    --p2p.txCollectionReconcileIntervalMs <value>                            (default: 60000)                                              ($TX_COLLECTION_RECONCILE_INTERVAL_MS)
          How often to reconcile found txs from the tx pool

    --p2p.txCollectionDisableSlowDuringFastRequests <value>                  (default: true)                                               ($TX_COLLECTION_DISABLE_SLOW_DURING_FAST_REQUESTS)
          Whether to disable the slow collection loop if we are dealing with any immediate requests

    --p2p.txCollectionFastNodeIntervalMs <value>                             (default: 500)                                                ($TX_COLLECTION_FAST_NODE_INTERVAL_MS)
          How many ms to wait between retried request to a node via RPC during fast collection

    --p2p.txCollectionNodeRpcUrls <value>                                    (default: )                                                   ($TX_COLLECTION_NODE_RPC_URLS)
          A comma-separated list of Aztec node RPC URLs to use for tx collection

    --p2p.txCollectionFastMaxParallelRequestsPerNode <value>                 (default: 4)                                                  ($TX_COLLECTION_FAST_MAX_PARALLEL_REQUESTS_PER_NODE)
          Maximum number of parallel requests to make to a node during fast collection

    --p2p.txCollectionNodeRpcMaxBatchSize <value>                            (default: 50)                                                 ($TX_COLLECTION_NODE_RPC_MAX_BATCH_SIZE)
          Maximum number of transactions to request from a node in a single batch

    --p2p.txCollectionMissingTxsCollectorType <value>                        (default: new)                                                ($TX_COLLECTION_MISSING_TXS_COLLECTOR_TYPE)
          Which collector implementation to use for missing txs collection (new or old)

    --p2p.txCollectionFileStoreUrls <value>                                  (default: )                                                   ($TX_COLLECTION_FILE_STORE_URLS)
          A comma-separated list of file store URLs (s3://, gs://, file://, http://) for tx collection

    --p2p.txCollectionFileStoreSlowDelayMs <value>                           (default: 24000)                                              ($TX_COLLECTION_FILE_STORE_SLOW_DELAY_MS)
          Delay before file store collection starts after slow collection

    --p2p.txCollectionFileStoreFastDelayMs <value>                           (default: 2000)                                               ($TX_COLLECTION_FILE_STORE_FAST_DELAY_MS)
          Delay before file store collection starts after fast collection

    --p2p.txCollectionFileStoreFastWorkerCount <value>                       (default: 5)                                                  ($TX_COLLECTION_FILE_STORE_FAST_WORKER_COUNT)
          Number of concurrent workers for fast file store collection

    --p2p.txCollectionFileStoreSlowWorkerCount <value>                       (default: 2)                                                  ($TX_COLLECTION_FILE_STORE_SLOW_WORKER_COUNT)
          Number of concurrent workers for slow file store collection

    --p2p.txCollectionFileStoreFastBackoffBaseMs <value>                     (default: 1000)                                               ($TX_COLLECTION_FILE_STORE_FAST_BACKOFF_BASE_MS)
          Base backoff time in ms for fast file store collection retries

    --p2p.txCollectionFileStoreSlowBackoffBaseMs <value>                     (default: 5000)                                               ($TX_COLLECTION_FILE_STORE_SLOW_BACKOFF_BASE_MS)
          Base backoff time in ms for slow file store collection retries

    --p2p.txCollectionFileStoreFastBackoffMaxMs <value>                      (default: 5000)                                               ($TX_COLLECTION_FILE_STORE_FAST_BACKOFF_MAX_MS)
          Max backoff time in ms for fast file store collection retries

    --p2p.txCollectionFileStoreSlowBackoffMaxMs <value>                      (default: 30000)                                              ($TX_COLLECTION_FILE_STORE_SLOW_BACKOFF_MAX_MS)
          Max backoff time in ms for slow file store collection retries

    --p2p.txFileStoreUrl <value>                                                                                                           ($TX_FILE_STORE_URL)
          URL for uploading txs to file storage (s3://, gs://, file://)

    --p2p.txFileStoreUploadConcurrency <value>                               (default: 10)                                                 ($TX_FILE_STORE_UPLOAD_CONCURRENCY)
          Maximum number of concurrent tx uploads

    --p2p.txFileStoreMaxQueueSize <value>                                    (default: 1000)                                               ($TX_FILE_STORE_MAX_QUEUE_SIZE)
          Maximum queue size for pending uploads (oldest dropped when exceeded)

    --p2p.txFileStoreEnabled <value>                                                                                                       ($TX_FILE_STORE_ENABLED)
          Enable uploading transactions to file storage

  P2P BOOTSTRAP

    --p2p-bootstrap                                                                                                                        
          Starts Aztec P2P Bootstrap with options

    --p2pBootstrap.p2pBroadcastPort <value>                                                                                                ($P2P_BROADCAST_PORT)
          The port to broadcast the P2P service on (included in the node's ENR). Defaults to P2P_PORT.

    --p2pBootstrap.peerIdPrivateKeyPath <value>                                                                                            ($PEER_ID_PRIVATE_KEY_PATH)
          An optional path to store generated peer id private keys. If blank, will default to storing any generated keys in the root of the data directory.

    --p2pBootstrap.queryForIp <value>                                                                                                      ($P2P_QUERY_FOR_IP)
          If announceUdpAddress or announceTcpAddress are not provided, query for the IP address of the machine. Default is false.

  TELEMETRY

    --tel.metricsCollectorUrl <value>                                                                                                      ($OTEL_EXPORTER_OTLP_METRICS_ENDPOINT)
          The URL of the telemetry collector for metrics

    --tel.tracesCollectorUrl <value>                                                                                                       ($OTEL_EXPORTER_OTLP_TRACES_ENDPOINT)
          The URL of the telemetry collector for traces

    --tel.logsCollectorUrl <value>                                                                                                         ($OTEL_EXPORTER_OTLP_LOGS_ENDPOINT)
          The URL of the telemetry collector for logs

    --tel.otelCollectIntervalMs <value>                                      (default: 60000)                                              ($OTEL_COLLECT_INTERVAL_MS)
          The interval at which to collect metrics

    --tel.otelExportTimeoutMs <value>                                        (default: 30000)                                              ($OTEL_EXPORT_TIMEOUT_MS)
          The timeout for exporting metrics

    --tel.otelExcludeMetrics <value>                                         (default: )                                                   ($OTEL_EXCLUDE_METRICS)
          A list of metric prefixes to exclude from export

    --tel.otelIncludeMetrics <value>                                         (default: )                                                   ($OTEL_INCLUDE_METRICS)
          A list of metric prefixes to include in export (ignored if OTEL_EXCLUDE_METRICS is set)

    --tel.publicMetricsCollectorUrl <value>                                                                                                ($PUBLIC_OTEL_EXPORTER_OTLP_METRICS_ENDPOINT)
          A URL to publish a subset of metrics for public consumption

    --tel.publicMetricsCollectFrom <value>                                   (default: )                                                   ($PUBLIC_OTEL_COLLECT_FROM)
          The role types to collect metrics from

    --tel.publicIncludeMetrics <value>                                       (default: )                                                   ($PUBLIC_OTEL_INCLUDE_METRICS)
          A list of metric prefixes to publicly export

    --tel.publicMetricsOptOut <value>                                        (default: true)                                               ($PUBLIC_OTEL_OPT_OUT)
          Whether to opt out of sharing optional telemetry

  BOT

    --bot                                                                                                                                  
          Starts Aztec Bot with options

    --bot.nodeUrl <value>                                                                                                                  ($AZTEC_NODE_URL)
          The URL to the Aztec node to check for tx pool status.

    --bot.nodeAdminUrl <value>                                                                                                             ($AZTEC_NODE_ADMIN_URL)
          The URL to the Aztec node admin API to force-flush txs if configured.

    --bot.l1Mnemonic <value>                                                                                                               ($BOT_L1_MNEMONIC)
          The mnemonic for the account to bridge fee juice from L1.

    --bot.l1PrivateKey <value>                                                                                                             ($BOT_L1_PRIVATE_KEY)
          The private key for the account to bridge fee juice from L1.

    --bot.l1ToL2MessageTimeoutSeconds <value>                                (default: 3600)                                               ($BOT_L1_TO_L2_TIMEOUT_SECONDS)
          How long to wait for L1 to L2 messages to become available on L2

    --bot.senderPrivateKey <value>                                                                                                         ($BOT_PRIVATE_KEY)
          Signing private key for the sender account.

    --bot.senderSalt <value>                                                                                                               ($BOT_ACCOUNT_SALT)
          The salt to use to deploy the sender account.

    --bot.tokenSalt <value>                                                  (default: 0x0000000000000000000000000000000000000000000000000000000000000001)($BOT_TOKEN_SALT)
          The salt to use to deploy the token contract.

    --bot.txIntervalSeconds <value>                                          (default: 60)                                                 ($BOT_TX_INTERVAL_SECONDS)
          Every how many seconds should a new tx be sent.

    --bot.privateTransfersPerTx <value>                                      (default: 1)                                                  ($BOT_PRIVATE_TRANSFERS_PER_TX)
          How many private token transfers are executed per tx.

    --bot.publicTransfersPerTx <value>                                       (default: 1)                                                  ($BOT_PUBLIC_TRANSFERS_PER_TX)
          How many public token transfers are executed per tx.

    --bot.feePaymentMethod <value>                                           (default: fee_juice)                                          ($BOT_FEE_PAYMENT_METHOD)
          How to handle fee payments. (Options: fee_juice)

    --bot.minFeePadding <value>                                              (default: 3)                                                  ($BOT_MIN_FEE_PADDING)
          How much is the bot willing to overpay vs. the current base fee

    --bot.noStart <value>                                                                                                                  ($BOT_NO_START)
          True to not automatically setup or start the bot on initialization.

    --bot.txMinedWaitSeconds <value>                                         (default: 180)                                                ($BOT_TX_MINED_WAIT_SECONDS)
          How long to wait for a tx to be mined before reporting an error.

    --bot.followChain <value>                                                (default: NONE)                                               ($BOT_FOLLOW_CHAIN)
          Which chain the bot follows

    --bot.maxPendingTxs <value>                                              (default: 128)                                                ($BOT_MAX_PENDING_TXS)
          Do not send a tx if the node's tx pool already has this many pending txs.

    --bot.flushSetupTransactions <value>                                                                                                   ($BOT_FLUSH_SETUP_TRANSACTIONS)
          Make a request for the sequencer to build a block after each setup transaction.

    --bot.l2GasLimit <value>                                                                                                               ($BOT_L2_GAS_LIMIT)
          L2 gas limit for the tx (empty to let the bot's wallet estimate).

    --bot.daGasLimit <value>                                                                                                               ($BOT_DA_GAS_LIMIT)
          DA gas limit for the tx (empty to let the bot's wallet estimate).

    --bot.contract <value>                                                   (default: TokenContract)                                      ($BOT_TOKEN_CONTRACT)
          Token contract to use

    --bot.maxConsecutiveErrors <value>                                                                                                     ($BOT_MAX_CONSECUTIVE_ERRORS)
          The maximum number of consecutive errors before the bot shuts down

    --bot.stopWhenUnhealthy <value>                                                                                                        ($BOT_STOP_WHEN_UNHEALTHY)
          Stops the bot if service becomes unhealthy

    --bot.botMode <value>                                                    (default: transfer)                                           ($BOT_MODE)
          Bot mode: transfer, amm, or crosschain

    --bot.l2ToL1MessagesPerTx <value>                                        (default: 1)                                                  ($BOT_L2_TO_L1_MESSAGES_PER_TX)
          Number of L2→L1 messages per tx (crosschain mode)

    --bot.l1ToL2SeedCount <value>                                            (default: 1)                                                  ($BOT_L1_TO_L2_SEED_COUNT)
          Max L1→L2 messages to keep in-flight (crosschain mode)

  PXE

    --pxe.l2BlockBatchSize <value>                                           (default: 50)                                                 ($PXE_L2_BLOCK_BATCH_SIZE)
          Maximum amount of blocks to pull from the stream in one request when synchronizing

    --pxe.proverEnabled <value>                                              (default: true)                                               ($PXE_PROVER_ENABLED)
          Enable real proofs

    --pxe.syncChainTip <value>                                               (default: proposed)                                           ($PXE_SYNC_CHAIN_TIP)
          Which chain tip to sync to (proposed, checkpointed, proven, finalized)

    --pxe.nodeUrl <value>                                                                                                                  ($AZTEC_NODE_URL)
          Custom Aztec Node URL to connect to

  TXE

    --txe                                                                                                                                  
          Starts Aztec TXE with options
```
