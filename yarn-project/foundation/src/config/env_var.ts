export type EnvVar =
  | 'ACVM_BINARY_PATH' //The path to the ACVM binary. For simulation provider, if this binary path is not supplied, defaults to WASM Simulator.
  | 'ACVM_WORKING_DIRECTORY' // The working directory to use for simulation
  | 'GOVERNANCE_CONTRACT_ADDRESS' // Governance Contract Address
  | 'API_KEY' // API Key for startPXE and addPXE from CLI. Suspect it's not being used and that we're using AZTEC_NODE_URL instead. Confirmed with Esau that they're not using it. TODO: Delete this env variable
  | 'API_PREFIX' // SAFE TO DELETE. Not being used except for in aztec-packages/yarn-project/aztec-node/src/bin/index.ts . Was removed here https://github.com/AztecProtocol/aztec-packages/issues/3599. TODO: Delete this env variable
  | 'ARCHIVER_MAX_LOGS' // The max number of logs that can be obtained in 1 "getPublicLogs" call
  | 'ARCHIVER_POLLING_INTERVAL_MS' // The polling interval in ms for retrieving new L2 blocks and encrypted log. This is the interval between successive calls to eth_blockNumber via viem.
  | 'ARCHIVER_URL' // URL for an archiver service. If set, will return an archiver client as opposed to starting a new one. */
  | 'ARCHIVER_VIEM_POLLING_INTERVAL_MS' // Results of calls to eth_blockNumber are cached by viem with this cache being updated periodically at the interval specified by viemPollingIntervalMS.
  | 'ARCHIVER_BATCH_SIZE' //  The number of L2 blocks the archiver will attempt to download at a time.
  | 'ASSUME_PROVEN_THROUGH_BLOCK_NUMBER' // The number of L2 blocks the archiver will attempt to download at a time.
  | 'AZTEC_NODE_URL' // The address of an Aztec Node URL that the PXE will connect to. The prover
  | 'AZTEC_PORT' // Port to run the Aztec Services on on
  | 'BB_BINARY_PATH' // Path to bb binary
  | 'BB_SKIP_CLEANUP' // Whether to skip cleanup of bb temporary files. If false, the proof data in BB_WORKING_DIRECTORY will be deleted.
  | 'BB_WORKING_DIRECTORY' // Where bb stores temporary files
  | 'BOOTSTRAP_NODES' // A list of bootstrap peer ENRs to connect to. Separated by commas
  | 'BLOB_SINK_PORT' // The port to run the blob sink server on
  | 'BLOB_SINK_URL' // The blob sink is a simple HTTP server that can be run alongside the e2e tests. It will store the blobs in a local file system and provide an API to query for them. Blob sink url is provided: If requesting from the blob sink, we send the blobkHash. Consensus host url is provided: If requesting from the beacon node, we send the slot number
  | 'BOT_DA_GAS_LIMIT' // DA gas limit for the tx (empty to have the bot trigger an estimate gas).
  | 'BOT_FEE_PAYMENT_METHOD' // How to handle fee payments. (Options: fee_juice).
  | 'BOT_FLUSH_SETUP_TRANSACTIONS' // Whether to flush after sending each 'setup' transaction . Forces the sequencer to bypass all time and tx count checks for the next block and build anyway. A setup transaction is a contract deployment.
  | 'BOT_FOLLOW_CHAIN' // whether the bot waits for the transaction to be confirmed on the blockchain or simply logs that the transaction has been sent without waiting for confirmation. Possible values: PENDING, PROVEN, NONE.
  | 'BOT_L2_GAS_LIMIT' // L2 gas limit for the tx (empty to have the bot trigger an estimate gas). If any of BOT_L2_GAS_LIMIT or BOT_DA_GAS_LIMIT are empty, the bot triggers an estimate gas.
  | 'BOT_MAX_PENDING_TXS' // The bot will not send a tx if the node's tx pool already has this many pending txs. This is the Boot Node usually.
  | 'BOT_NO_START' // Do not start the bot automatically if you run aztec node start
  | 'BOT_PRIVATE_KEY' // Bot's signing key
  | 'BOT_PRIVATE_TRANSFERS_PER_TX' // How many private transfers included in a bot transaction?
  | 'BOT_PUBLIC_TRANSFERS_PER_TX' // How many public transfers included in a bot transaction?
  | 'BOT_PXE_URL' // URL to a remote PXE for sending txs.
  | 'BOT_RECIPIENT_ENCRYPTION_SECRET' // Encryption secret for a recipient account. Used to setup recipient on the bot.
  | 'BOT_SKIP_PUBLIC_SIMULATION' // Should the bot skip the public simulation of a tx before sending it?
  | 'BOT_TOKEN_CONTRACT' // Token contract to use
  | 'BOT_TOKEN_SALT' // Salt for the token deployment by the bot.
  | 'BOT_TX_INTERVAL_SECONDS' // Bot sends a new transaction every this many seconds. This does not include time required to prove the txs
  | 'BOT_TX_MINED_WAIT_SECONDS' // How long the bot should wait for a tx to be mined before reporting an error
  | 'BOT_MAX_CONSECUTIVE_ERRORS' // The maximum number of consecutive errors before the bot changes healthy status to False. If BOT_STOP_WHEN_UNHEALTHY is true, then bot will shut down.
  | 'BOT_STOP_WHEN_UNHEALTHY' // Bot will shut down if this is true and BOT_MAX_CONSECUTIVE_ERRORS consecutive errors reached
  | 'COINBASE' // Eth address that would be eligible for block rewards
  | 'DATA_DIRECTORY' // directory where to save archiver, p2p and world state data
  | 'DATA_STORE_MAP_SIZE_KB' // DB mapping size to be applied to all key/value stores. Currently many DB get custom values
  | 'DEBUG' //
  | 'DEBUG_P2P_DISABLE_MESSAGE_VALIDATION' // 'DEBUG: Disable message validation - NEVER set to true in production'
  | 'DEBUG_P2P_DISABLE_COLOCATION_PENALTY' // True/False. Should you penalize score of peers with the same IP?
  | 'DEPLOY_AZTEC_CONTRACTS_SALT' // Salt used to deploy Aztec L1 contracts. If this set, then auto implies to deploy Aztec L1 contracts (even if DEPLOY_AZTEC_CONTRACTS=false)
  | 'DEPLOY_AZTEC_CONTRACTS' // Whether to deploy Aztec L1 contracts
  | 'ENFORCE_FEES' // Whether to require every tx to have a fee payer. The txValidator will reject the tx if the fee payer is not set.
  | 'ETHEREUM_HOST' // URL to the L1 execution client
  | 'FEE_JUICE_CONTRACT_ADDRESS' // Address of the L1 asset contract
  | 'FEE_JUICE_PORTAL_CONTRACT_ADDRESS' // Address of the L1 asset portal contract.
  | 'FEE_RECIPIENT' // Aztec Address that will receive block fees.
  | 'FORCE_COLOR' // Transport options for pretty logging to stderr via pino-pretty.
  | 'GOVERNANCE_PROPOSER_CONTRACT_ADDRESS' // Address of the Governance Proposer contract on L1
  | 'GOVERNANCE_PROPOSER_PAYLOAD_ADDRESS' // Address of the payload to vote on during a governance proposal
  | 'INBOX_CONTRACT_ADDRESS' // Address of the L1 -> L2 message box
  | 'L1_CHAIN_ID' // Chain ID
  | 'L1_CONSENSUS_HOST_URL' // URL to the L1 consensus client
  | 'L1_CONSENSUS_HOST_API_KEY' // The API key for the L1 consensus client. Added end of URL as "?key=<api-key>" unless a header is defined
  | 'L1_CONSENSUS_HOST_API_KEY_HEADER' // The header name for the L1 consensus client API key, if needed. Added as "<api-key-header>: <api-key>
  | 'L1_PRIVATE_KEY' // Private key of account for publishing L1 contracts in aztec start.
  | 'LOG_JSON' // using pino-pretty for console logging if LOG_JSON is not set. vanilla stdio if it is.
  | 'LOG_MULTILINE' //pino-pretty options: Whether to print each log on a single line or not. (errors will still be multi-line).
  | 'LOG_LEVEL' // controls the default log level. Use `LOG_LEVEL` with one of `silent`, `fatal`, `error`, `warn`, `info`, `verbose`, `debug`, or `trace`. To tweak log levels per module, add a list of module prefixes with their overridden level. For example, LOG_LEVEL="info; verbose: aztec:sequencer, aztec:archiver; debug: aztec:kv-store" sets `info` as the default log level, `verbose` for the sequencer and archiver, and `debug` for the kv-store. Module name match is done by prefix.
  | 'MNEMONIC' // The mnemonic for the faucet account. Also used as the publisher private key if none is supplied. If no publisher pk is supplied, this is used as the pk for the l1 deployer (l1 contracts)
  | 'NETWORK_NAME' // The network ID of the telemetry service
  | 'NETWORK' // External Aztec network to connect to. e.g. devnet TODO: check if this is still being used today
  | 'NO_PXE' // If true, does not expose a PXE on sandbox start.
  | 'COIN_ISSUER_CONTRACT_ADDRESS' // Address of the Coin Issuer contract
  | 'USE_GCLOUD_LOGGING' // If USE_GCLOUD_LOGGING is true, the pino logger will be configured with the settings defined in GoogleCloudLoggerConfig
  | 'USE_GCLOUD_METRICS' // Whether to use GCP metrics and traces
  | 'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT' // Used in setup-service-addresses
  | 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT' // Used in setup-service-addresses
  | 'OTEL_EXPORTER_OTLP_LOGS_ENDPOINT' // Used in setup-service-addresses
  | 'OTEL_SERVICE_NAME' // The name of the service (attached as metadata to collected metrics)
  | 'OTEL_COLLECT_INTERVAL_MS' // The interval at which to collect metrics
  | 'OTEL_EXCLUDE_METRICS' // A list of metric prefixes to exclude from export
  | 'OTEL_EXPORT_TIMEOUT_MS' // The timeout for exporting metrics
  | 'OUTBOX_CONTRACT_ADDRESS' // Address of the L2 -> L1 message box contract
  | 'P2P_BLOCK_CHECK_INTERVAL_MS' // The frequency in which to check for new L2 blocks via the blockstream
  | 'P2P_BLOCK_REQUEST_BATCH_SIZE' // How many L2 blocks to fetch at a time via the blockstream
  | 'P2P_BOOTSTRAP_NODE_ENR_VERSION_CHECK' // Whether nodes check the bootstrap ENR for an Aztec key before accepting connection
  | 'P2P_ENABLED' // If true, configures libp2p and other p2p services
  | 'P2P_GOSSIPSUB_D' // The desired outbound degree of the gossipsub network
  | 'P2P_GOSSIPSUB_DHI'  // Upper bound for gossipsub outbound degree
  | 'P2P_GOSSIPSUB_DLO' // lower bound for gossipsub outbound degree
  | 'P2P_GOSSIPSUB_DLAZY' // Optional) the outbound degree for gossip emission.
  | 'P2P_GOSSIPSUB_FLOOD_PUBLISH' // Whether to flood publish messages. - For testing purposes only.
  | 'P2P_GOSSIPSUB_INTERVAL_MS' // The interval of the gossipsub heartbeat to perform maintenance tasks.
  | 'P2P_GOSSIPSUB_MCACHE_GOSSIP' // How many message cache windows to include when gossiping with other peers.
  | 'P2P_GOSSIPSUB_MCACHE_LENGTH' // he number of gossipsub interval message cache windows to keep
  | 'P2P_MAX_PEERS' // The maximum number of peers to connect to
  | 'P2P_PEER_CHECK_INTERVAL_MS' // The frequency with which to check for new peers.
  | 'P2P_PEER_PENALTY_VALUES' // The values for the peer scoring system. Passed as a comma separated list of values in order: low, mid, high tolerance errors.'
  | 'P2P_QUERY_FOR_IP' // If announceUdpAddress or announceTcpAddress are not provided, query for the IP address of the machine. Default is false.
  | 'P2P_REQRESP_INDIVIDUAL_REQUEST_TIMEOUT_MS' // The timeout for an individual request response peer interaction. i.e. timeout for sending to one peer.
  | 'P2P_REQRESP_OVERALL_REQUEST_TIMEOUT_MS' // The overall timeout for a request response operation. i.e. timeout for sending to all peers.
  | 'P2P_DOUBLE_SPEND_SEVERE_PEER_PENALTY_WINDOW' // The "age" (in L2 blocks) of a tx after which we heavily penalize a peer for sending it.
  | 'P2P_TCP_LISTEN_ADDR' // The listen address for TCP. Format: <IP_ADDRESS>:<PORT>
  | 'P2P_TCP_ANNOUNCE_ADDR' // The announce address for TCP. Format: <IP_ADDRESS>:<PORT>
  | 'P2P_TX_POOL_KEEP_PROVEN_FOR' // How many blocks have to pass after a block is proven before its txs are deleted (zero to delete immediately once proven)
  | 'P2P_ATTESTATION_POOL_KEEP_FOR' // How many slots to keep attestations for.
  | 'P2P_UDP_ANNOUNCE_ADDR' // The announce address for UDP. Format: <IP_ADDRESS>:<PORT>
  | 'P2P_UDP_LISTEN_ADDR' // The listen address for UDP. Format: <IP_ADDRESS>:<PORT>
  | 'P2P_ARCHIVED_TX_LIMIT' // Archives a list of txs for future reference. The number of archived txs is limited by the specified archivedTxLimit
  | 'PEER_ID_PRIVATE_KEY' // An optional peer id private key. If blank, will generate a random key.
  | 'PROVER_AGENT_ENABLED' // TODO: Remove this env var
  | 'PROVER_AGENT_CONCURRENCY' // TODO: Remove this env var. Also look for \bhardwareConcurrency\b and remove it from the values files.
  | 'PROVER_AGENT_COUNT' // How many local prover agents to run on the prover node.
  | 'PROVER_AGENT_PROOF_TYPES' // TODO: Remove this env var
  | 'PROVER_AGENT_POLL_INTERVAL_MS' // TODO: Less sure about this one but remove this env var. Right now hardcoding the interval in the prover-agent.ts file.
  | 'PROVER_BROKER_HOST' // The URL from where a proving agent takes jobs from
  | 'PROVER_BROKER_JOB_TIMEOUT_MS' // Jobs are retried if not kept alive for this long.
  | 'PROVER_BROKER_POLL_INTERVAL_MS' // The interval to check job health status.
  | 'PROVER_BROKER_JOB_MAX_RETRIES' // If starting a prover broker locally, the max number of retries per proving job
  | 'PROVER_BROKER_BATCH_INTERVAL_MS' // How often to flush batches to disk
  | 'PROVER_BROKER_BATCH_SIZE' // Writes jobs to disk in batches of this size
  | 'PROVER_COORDINATION_NODE_URL' // If config.p2pEnabled is false, createProverCoordination request information from the AztecNode. Proving Coordination is how the prover node requests transaction data needed to produce proofs.
  | 'PROVER_FAILED_PROOF_STORE' // Store for inputs of failed proof.
  | 'PROVER_ID' // Identifier of the prover. Takes a field input.
  | 'PROVER_NODE_POLLING_INTERVAL_MS' // The interval in milliseconds to poll for new jobs
  | 'PROVER_NODE_MAX_PENDING_JOBS' // The maximum number of pending jobs for the prover node
  | 'PROVER_NODE_MAX_PARALLEL_BLOCKS_PER_EPOCH' // The Maximum number of blocks to process in parallel while proving an epoch
  | 'PROVER_NODE_TX_GATHERING_TIMEOUT_MS' // The maximum amount of time to wait for tx data to be available to the prover node.
  | 'PROVER_NODE_TX_GATHERING_INTERVAL_MS' // How often to check that tx data is available
  | 'PROVER_NODE_TX_GATHERING_MAX_PARALLEL_REQUESTS' // How many txs to load up a time
  | 'PROVER_PUBLISH_RETRY_INTERVAL_MS' // The interval to wait between publish retries
  | 'PROVER_PUBLISHER_PRIVATE_KEY' // The private key to be used by the prover publisher.
  | 'PROVER_REAL_PROOFS' // Whether to construct real proofs.
  | 'PROVER_TEST_DELAY_MS' // Used in TestCircuitProver to simulate "fake work" i.e. sleep(PROVER_TEST_DELAY_MS)
  | 'PXE_L2_STARTING_BLOCK' // Starting L2 block for the L2BlockStream in the PXE
  | 'PXE_PROVER_ENABLED' // Whether the PXE produces real ClientIVC proofs or not
  | 'REGISTRY_CONTRACT_ADDRESS' // Address of the Registry contract.
  | 'ROLLUP_CONTRACT_ADDRESS' // Address of the Rollup contract.
  | 'SEQ_ALLOWED_SETUP_FN' // The list of functions calls allowed to run in setup
  | 'SEQ_MAX_BLOCK_SIZE_IN_BYTES' // Max block size in bytes
  | 'SEQ_MAX_TX_PER_BLOCK' // Max number of txs per block
  | 'SEQ_MIN_TX_PER_BLOCK' // Min number of txs per block
  | 'SEQ_MAX_DA_BLOCK_GAS' // The maximum DA block gas.
  | 'SEQ_MAX_L2_BLOCK_GAS' // The maximum L2 block gas.
  | 'SEQ_PUBLISH_RETRY_INTERVAL_MS' // The interval to wait between publish retries.
  | 'SEQ_PUBLISHER_PRIVATE_KEY' // The private key to be used by the publisher
  | 'SEQ_TX_POLLING_INTERVAL_MS' // The number of ms to wait between polling for pending txs.
  | 'SEQ_ENFORCE_TIME_TABLE' // 'Whether to enforce the time table when building blocks
  | 'SEQ_MAX_L1_TX_INCLUSION_TIME_INTO_SLOT' // Timetable option: How many seconds into an L1 slot we can still send a tx and get it mined.
  | 'SLASH_FACTORY_CONTRACT_ADDRESS' // Address of the Slash Factory contract.
  | 'STAKING_ASSET_CONTRACT_ADDRESS' // Address of the Staking Asset contract.
  | 'REWARD_DISTRIBUTOR_CONTRACT_ADDRESS' // Address of the Reward Distributor contract.
  | 'TELEMETRY' // Whether to turn on telemetry
  | 'TEST_ACCOUNTS' // Deploy test accounts on sandbox start. P2P_ENABLED and NO_PXE must be false
  | 'TXE_PORT' // Port for the TXE http server
  | 'VALIDATOR_ATTESTATIONS_POLLING_INTERVAL_MS'  // Interval between polling for new attestations
  | 'VALIDATOR_DISABLED' // Whether the validator is disabled for this node.
  | 'VALIDATOR_PRIVATE_KEY' // Validator Private Key
  | 'VALIDATOR_REEXECUTE' // Whether to re-execute transactions before attesting to block proposals. NOTE: Very important to set this to true in production
  | 'VERSION' // L2 Chain Version
  | 'WS_BLOCK_CHECK_INTERVAL_MS' // The frequency with which the world state checks for new L2 blocks.
  | 'WS_PROVEN_BLOCKS_ONLY' // Whether the world state tracks only the proven chain
  | 'WS_BLOCK_REQUEST_BATCH_SIZE' // Size of the batch for each get-blocks request from the synchronizer to the archiver.
  | 'VERIFIER_VIEM_POLLING_INTERVAL_MS' // The polling interval the proof verifier uses
  | 'L1_READER_VIEM_POLLING_INTERVAL_MS' // The polling interval the L1 Reader uses in ms
  | 'PROVER_VIEM_POLLING_INTERVAL_MS' //
  | 'SEQ_VIEM_POLLING_INTERVAL_MS' // Used in the .values file of the helm chart to configure polling intervals for the seq and bootnode.
  | 'WS_DB_MAP_SIZE_KB' // The maximum possible size of the world state DB
  | 'WS_DATA_DIRECTORY' // Optional directory for the world state database
  | 'WS_NUM_HISTORIC_BLOCKS' // The number of historic blocks to maintain. Values less than 1 mean all history is maintained
  | 'ETHEREUM_SLOT_DURATION' // Duration of an L1 slot in seconds.
  | 'AZTEC_SLOT_DURATION' // Duration of an L2 slot in seconds
  | 'AZTEC_EPOCH_DURATION' // Duration of an L2 epoch in L2 slots
  | 'AZTEC_TARGET_COMMITTEE_SIZE' // The target validator committee size.
  | 'AZTEC_PROOF_SUBMISSION_WINDOW'  // The number of L2 slots that a proof for an epoch can be submitted in, starting from the beginning of the next epoch.
  | 'AZTEC_MINIMUM_STAKE' // The minimum stake for a validator
  | 'AZTEC_SLASHING_QUORUM' // This many slashing votes in one single AZTEC_SLASHING_ROUND_SIZE L1 slots are required to pass a slashing proposal.
  | 'AZTEC_SLASHING_ROUND_SIZE' // The number of consecutive L1 slots that make up a single round. For a slash proposal to pass, AZTEC_SLASHING_QUORUM votes must be registered for the proposal to pass.
  | 'AZTEC_GOVERNANCE_PROPOSER_QUORUM' // This many signals from sequencers are required in any AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE L1 slots to advance a governance proposal to the voting phase.
  | 'AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE' // The number of consecutive L1 slots that make up a single round. For a governance proposal to pass, AZTEC_GOVERNANCE_PROPOSER_QUORUM signals must be registered for the proposal to advance to the voting phase.
  | 'L1_GAS_LIMIT_BUFFER_PERCENTAGE' // How much to increase calculated gas limit by (percentage) in bumpGasLimit()
  | 'L1_GAS_PRICE_MAX' // Max L1 gas in gwei.
  | 'L1_BLOB_FEE_PER_GAS_MAX' // Maximum blob fee per gas in gwei
  | 'L1_PRIORITY_FEE_BUMP_PERCENTAGE' // How much to increase priority fee by each attempt (percentage)'
  | 'L1_PRIORITY_FEE_RETRY_BUMP_PERCENTAGE' // How much to increase priority fee by each retry attempt (percentage)'
  | 'L1_FIXED_PRIORITY_FEE_PER_GAS' // Fixed priority fee per gas in Gwei. Overrides any priority fee bump percentage
  | 'L1_TX_MONITOR_MAX_ATTEMPTS' // Maximum number of speed-up attempts. Speed up attempts increase priority fee
  | 'L1_TX_MONITOR_CHECK_INTERVAL_MS' // How often to check tx status
  | 'L1_TX_MONITOR_STALL_TIME_MS' // How long before considering tx stalled
  | 'L1_TX_MONITOR_TX_TIMEOUT_MS' // How long to wait in ms for a tx to be mined before giving up. Set to 0 to disable
  | 'L1_TX_PROPAGATION_MAX_QUERY_ATTEMPTS' // How many attempts will be done to get status of a tx after it was sent
  | 'FAUCET_MNEMONIC_ACCOUNT_INDEX' // The account to use for the faucet (combined with mnemonic to create account)
  | 'FAUCET_ETH_AMOUNT' // How much eth the faucet should drip per call
  | 'FAUCET_INTERVAL_MS' // How often the faucet can be dripped
  | 'FAUCET_L1_ASSETS' // Which other L1 assets the faucet is able to drip
  | 'K8S_POD_NAME' // The name of the Kubernetes pod (injected automatically by k8s)
  | 'K8S_POD_UID' //  The UID of the Kubernetes pod (injected automatically by k8s)
  | 'K8S_NAMESPACE_NAME' // The name of the Kubernetes namespace (injected automatically by k8s)
  | 'CUSTOM_FORWARDER_CONTRACT_ADDRESS' // The address of the custom forwarder contract.
