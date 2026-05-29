variable "R2_ACCESS_KEY_ID" {
  description = "Cloudflare R2 access key id for RPC node snapshot uploads"
  type        = string
  default     = null
}

variable "R2_SECRET_ACCESS_KEY" {
  description = "Cloudflare R2 secret access key for RPC node snapshot uploads"
  type        = string
  default     = null
}

variable "GCP_PROJECT_ID" {
  description = "GCP project id"
  type        = string
  default     = "testnet-440309"
}

variable "GCP_REGION" {
  default = "us-west1"
  type    = string
}

variable "FULL_NODE_RESOURCE_PROFILE" {
  description = "Resource profile to use for the full node"
  type        = string
}

variable "P2P_BOOTSTRAP_RESOURCE_PROFILE" {
  description = "Resource profile to use for the p2p bootstrap"
  type        = string
}

variable "VALIDATOR_RESOURCE_PROFILE" {
  description = "Resource profile to use for the validator"
  type        = string
}

variable "PROVER_RESOURCE_PROFILE" {
  description = "Resource profile to use for the prover"
  type        = string
}

variable "RPC_RESOURCE_PROFILE" {
  description = "Resource profile to use for the rpc"
  type        = string
}

variable "BOT_RESOURCE_PROFILE" {
  description = "Resource profile to use for the bots"
  type        = string
}

variable "DEBUG_P2P_INSTRUMENT_MESSAGES" {
  description = "Whether to enable debug instrumentation of P2P messages"
  type        = bool
  default     = false
}

variable "PROVER_TEST_VERIFICATION_DELAY_MS" {
  description = "The delay (ms) to inject during fake proof verification"
  type        = number
  default     = 10
}

variable "BB_CHONK_VERIFY_MAX_BATCH" {
  description = "Upper bound on proofs per batch for the peer chonk batch verifier"
  type        = number
  default     = 16
}

variable "BB_CHONK_VERIFY_BATCH_CONCURRENCY" {
  description = "Thread count for the peer batch verifier parallel reduce (0 = auto)"
  type        = number
  default     = 6
}

variable "K8S_CLUSTER_CONTEXT" {
  description = "GKE cluster context"
  type        = string
  default     = "gke_testnet-440309_us-west1-a_aztec-gke-public"
}

variable "RELEASE_PREFIX" {
  description = "The prefix to use for the helm installs"
  type        = string
  default     = "staging-testnet"
}

variable "NAMESPACE" {
  description = "The namespace to install into"
  type        = string
  default     = "staging-testnet"
}

variable "AZTEC_DOCKER_IMAGE" {
  description = "Docker image to use for the aztec network"
  type        = string
  default     = "aztecprotocol/aztec:staging"
}

variable "PROVER_AGENT_DOCKER_IMAGE" {
  description = "Docker image for prover agents (includes baked-in CRS). Defaults to AZTEC_DOCKER_IMAGE."
  type        = string
  default     = ""
}

variable "VALIDATOR_HA_DOCKER_IMAGE" {
  description = "Docker image for HA validator releases. When set, HA releases (idx > 0) use this image instead of AZTEC_DOCKER_IMAGE."
  type        = string
  default     = ""
}

variable "VALIDATOR_VALUES" {
  description = "The values file to apply"
  type        = string
  default     = "staging-testnet-validator.yaml"
}

variable "PROVER_VALUES" {
  description = "The values file to apply"
  type        = string
  default     = "staging-testnet-prover.yaml"
}

variable "RPC_VALUES" {
  description = "The values file to apply"
  type        = string
  default     = "staging-testnet-rpc.yaml"
}

variable "L1_CHAIN_ID" {
  description = "The L1 chain id"
  type        = string
}

variable "L1_RPC_URLS" {
  description = "The L1 RPC URLs"
  type        = list(string)
  default     = []
}

variable "L1_CONSENSUS_HOST_URLS" {
  description = "The L1 consensus host URLs"
  type        = list(string)
  default     = []
}

variable "L1_CONSENSUS_HOST_API_KEYS" {
  description = "The L1 consensus host API keys"
  type        = list(string)
  default     = []
}

variable "L1_CONSENSUS_HOST_API_KEY_HEADERS" {
  description = "The L1 consensus host API key headers"
  type        = list(string)
  default     = []
}

variable "REGISTRY_CONTRACT_ADDRESS" {
  description = "The registry contract address"
  type        = string
}

variable "FEE_ASSET_HANDLER_CONTRACT_ADDRESS" {
  description = "The fee asset handler contract address"
  type        = string
}

variable "VALIDATOR_MNEMONIC" {
  description = "The validator mnemonic"
  type        = string
  default     = ""
}

variable "VALIDATOR_MNEMONIC_START_INDEX" {
  description = "The validator mnemonic start index"
  type        = string
  default     = 1
}

variable "VALIDATORS_PER_NODE" {
  description = "The number of validators per node"
  type        = number
  default     = 12
}

variable "VALIDATOR_PUBLISHERS_PER_REPLICA" {
  description = "Number of publisher EOAs per validator replica (pod)"
  type        = number
  default     = 4
}

variable "VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX" {
  description = "Mnemonic start index for validator publishers"
  type        = number
  default     = 5000
}

variable "VALIDATOR_L1_PRIORITY_FEE_BUMP_PERCENTAGE" {
  description = "Override for validator L1 priority fee bump percentage"
  type        = string
  nullable    = true
  default     = null
}

variable "VALIDATOR_L1_PRIORITY_FEE_RETRY_BUMP_PERCENTAGE" {
  description = "Override for validator L1 priority fee retry bump percentage"
  type        = string
  nullable    = true
  default     = null
}

variable "VALIDATOR_REPLICAS" {
  description = "The number of validator replicas"
  type        = string
  default     = 4
}

variable "VALIDATOR_HA_REPLICAS" {
  description = "Number of additional HA validator releases (0 = no HA, 1 = primary + 1 HA, etc.)"
  type        = number
  default     = 0
}

variable "VALIDATOR_HA_REPLICA_COUNT" {
  description = "Number of pod replicas per HA validator release. Defaults to VALIDATOR_REPLICAS if not set."
  type        = number
  default     = null
}

variable "VALIDATOR_HA_OLD_DUTIES_MAX_AGE_H" {
  description = "Clean up old signed HA duties after this many hours (prevents unbounded DB growth)"
  type        = number
  default     = 24
}

variable "ADMIN_API_KEY_HASH" {
  description = "SHA-256 hex hash of the admin API key. When set, enables admin API authentication on validator nodes. Leave empty to disable admin auth (default)."
  type        = string
  default     = ""
}

variable "PROVER_MNEMONIC" {
  description = "The prover mnemonic"
  type        = string
  default     = "test test test test test test test test test test test junk"
}

variable "PROVER_REPLICAS" {
  description = "The number of prover replicas"
  type        = string
  default     = 4
}

variable "PROVER_ENABLED" {
  description = "Whether to deploy the prover stack"
  type        = bool
  default     = true
}

variable "PROVER_TEST_DELAY_TYPE" {
  description = "The type of test delay to introduce in the prover (fixed, realistic)"
  type        = string
  default     = "fixed"
}

variable "PROVER_AGENT_PROOF_TYPES" {
  description = "The types of proofs these agents will run. Default: all"
  type        = list(string)
  default     = []
}

variable "PROVER_PUBLISHERS_PER_PROVER" {
  description = "Number of publisher keys per prover"
  type        = string
  default     = 1
}

variable "PROVER_PUBLISHER_MNEMONIC_START_INDEX" {
  description = "The prover publisher mnemonic start index"
  type        = string
  default     = 8000
}

variable "PROVER_L1_PRIORITY_FEE_BUMP_PERCENTAGE" {
  description = "Override for prover L1 priority fee bump percentage"
  type        = string
  nullable    = true
  default     = null
}

variable "PROVER_L1_PRIORITY_FEE_RETRY_BUMP_PERCENTAGE" {
  description = "Override for prover L1 priority fee retry bump percentage"
  type        = string
  nullable    = true
  default     = null
}

variable "PROVER_NODE_DISABLE_PROOF_PUBLISH" {
  description = "Whether to disable proof publishing from the prover node"
  type        = bool
  default     = false
}

variable "FISHERMAN_MNEMONIC" {
  description = "The fisherman mnemonic for RPC nodes (used when validators are disabled, e.g., fisherman mode)"
  type        = string
  default     = ""
}

variable "FISHERMAN_MNEMONIC_START_INDEX" {
  description = "The fisherman mnemonic start index for RPC nodes (used when validators are disabled)"
  type        = string
  default     = 1
}

variable "OTEL_COLLECTOR_ENDPOINT" {
  description = "Optional OpenTelemetry collector endpoint URL (e.g., http://otel-collector:4318)"
  type        = string
  default     = null
  nullable    = true
}

variable "OTEL_COLLECT_INTERVAL_MS" {
  description = "Interval in ms at which OTEL metrics are exported from nodes"
  type        = string
  nullable    = true
  default     = null
}

variable "OTEL_EXPORT_TIMEOUT_MS" {
  description = "Timeout in ms for OTEL metric exports (must be <= OTEL_COLLECT_INTERVAL_MS)"
  type        = string
  nullable    = true
  default     = null
}

variable "LOG_LEVEL" {
  description = "Log level for all nodes"
  type        = string
  default     = "info"
}

variable "FISHERMAN_LOG_LEVEL" {
  description = "Log level for fisherman nodes"
  type        = string
  default     = "debug"
}

variable "SPONSORED_FPC" {
  description = "Enable sponsored FPC"
  type        = bool
}

variable "TEST_ACCOUNTS" {
  description = "Enable test accounts"
  type        = bool
}

variable "SEQ_MIN_TX_PER_BLOCK" {
  description = "Minimum number of sequencer transactions per block"
  type        = string
  default     = "1"
}

variable "SEQ_MAX_TX_PER_BLOCK" {
  description = "Maximum number of sequencer transactions per block"
  type        = string
  default     = "8"
}

variable "SEQ_MAX_TX_PER_CHECKPOINT" {
  description = "Maximum number of sequencer transactions per checkpoint"
  type        = string
  default     = null
}

variable "P2P_MAX_PENDING_TX_COUNT" {
  description = "Maximum number of pending txs the local mempool will hold before evictions kick in"
  type        = string
  default     = null
}

variable "SEQ_ENFORCE_TIME_TABLE" {
  description = "Whether to enforce the time table when building blocks"
  type        = string
  nullable    = true
  default     = null
}

variable "SEQ_SKIP_CHECKPOINT_PUBLISH_PERCENT" {
  description = "Percentage probability of skipping checkpoint publishing"
  type        = string
  default     = "0"
}

variable "SEQ_BLOCK_DURATION_MS" {
  description = "Duration per block in milliseconds when building multiple blocks per slot"
  type        = string
  nullable    = true
  default     = null
}

variable "SEQ_L1_PUBLISHING_TIME_ALLOWANCE_IN_SLOT" {
  description = "Time allocated for publishing to L1, in seconds"
  type        = string
  nullable    = true
  default     = null
}

variable "SEQ_BUILD_CHECKPOINT_IF_EMPTY" {
  description = "Have sequencer build and publish an empty checkpoint if there are no txs"
  type        = string
  nullable    = true
  default     = null
}

variable "SEQ_PER_BLOCK_ALLOCATION_MULTIPLIER" {
  description = "Per-block gas budget multiplier for both L2 and DA gas."
  type        = string
  default     = null
}

variable "AZTEC_EPOCHS_LAG" {
  description = "Epoch lag override for validator nodes"
  type        = string
  nullable    = true
  default     = null
}

variable "SENTINEL_ENABLED" {
  description = "Whether to enable sentinel"
  type        = string
  default     = true
}

variable "SLASH_INACTIVITY_TARGET_PERCENTAGE" {
  description = "The slash inactivity target percentage"
  type        = string
  nullable    = true
}

variable "SLASH_INACTIVITY_PENALTY" {
  description = "The slash inactivity penalty"
  type        = string
  nullable    = true
}

variable "SLASH_DATA_WITHHOLDING_PENALTY" {
  description = "The slash data withholding penalty"
  type        = string
  nullable    = true
}

variable "SLASH_DATA_WITHHOLDING_TOLERANCE_SLOTS" {
  description = "L2 slots to wait after a checkpoint slot before slashing for data withholding"
  type        = string
  nullable    = true
}

variable "SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY" {
  description = "The slash propose invalid attestations penalty"
  type        = string
  default     = 0.0
}

variable "SLASH_DUPLICATE_PROPOSAL_PENALTY" {
  description = "The slash duplicate proposal penalty"
  type        = string
  nullable    = true
}

variable "SLASH_DUPLICATE_ATTESTATION_PENALTY" {
  description = "The slash duplicate attestation penalty"
  type        = string
  nullable    = true
}

variable "SLASH_PROPOSE_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS_PENALTY" {
  description = "The slash propose descendant of invalid penalty"
  type        = string
  nullable    = true
}

variable "SLASH_ATTEST_INVALID_CHECKPOINT_PROPOSAL_PENALTY" {
  description = "The slash attest invalid checkpoint proposal penalty"
  type        = string
  nullable    = true
}

variable "SLASH_UNKNOWN_PENALTY" {
  description = "The slash unknown penalty"
  type        = string
  nullable    = true
}

variable "SLASH_INVALID_BLOCK_PENALTY" {
  description = "The slash invalid block penalty"
  type        = string
  nullable    = true
}

variable "SLASH_INVALID_CHECKPOINT_PROPOSAL_PENALTY" {
  description = "The slash invalid checkpoint proposal penalty"
  type        = string
  nullable    = true
}

variable "SLASH_OFFENSE_EXPIRATION_ROUNDS" {
  description = "The slash offense expiration rounds"
  type        = string
  nullable    = true
}

variable "SLASH_MAX_PAYLOAD_SIZE" {
  description = "The slash max payload size"
  type        = string
  nullable    = true
}

variable "PROVER_REAL_PROOFS" {
  description = "Whether to enable prover real proofs"
  type        = string
}

variable "TRANSACTIONS_DISABLED" {
  description = "Whether transactions are disabled by the nodes"
  type        = string
  nullable    = true
}

variable "DEPLOY_INTERNAL_BOOTNODE" {
  description = "Whether to deploy an internal"
  type        = bool
  default     = false
}

variable "EXTERNAL_BOOTNODES" {
  description = "Whether to use externally deployed bootnodes"
  type        = list(string)
  default     = []
}

variable "NETWORK" {
  description = "One of the existing network names to use default config for"
  type        = string
  nullable    = true
}

variable "STORE_SNAPSHOT_URL" {
  description = "Location to store snapshots in"
  type        = string
  nullable    = true
  default     = null
}

variable "SNAPSHOT_CRON" {
  description = "Location to store snapshots in"
  type        = string
  default     = "0 */12 * * *"
}

variable "BOT_MNEMONIC" {
  description = "The bot mnemonic"
  type        = string
  default     = "test test test test test test test test test test test junk"
}

variable "BOT_TRANSFERS_MNEMONIC_START_INDEX" {
  description = "The prover mnemonic start index"
  type        = string
  default     = ""
}

variable "BOT_TRANSFERS_REPLICAS" {
  description = "Number of transfer bot replicas to deploy (0 to disable)"
  type        = number
  default     = 0
}

variable "BOT_TRANSFERS_TX_INTERVAL_SECONDS" {
  description = "Interval in seconds between transfer bot transactions"
  type        = number
  default     = 10
}

variable "BOT_TRANSFERS_FOLLOW_CHAIN" {
  description = "Transfers bot follow-chain mode (e.g., NONE)"
  type        = string
  default     = "PENDING"
}

variable "BOT_TRANSFERS_PXE_SYNC_CHAIN_TIP" {
  description = "Transfers bot PXE sync chain tip mode (e.g., checkpointed)"
  type        = string
  default     = "checkpointed"
}

variable "BOT_TRANSFERS_L2_PRIVATE_KEY" {
  description = "Private key for the transfers bot (hex string starting with 0x)"
  nullable    = true
  default     = null
}

variable "BOT_SWAPS_MNEMONIC_START_INDEX" {
  description = "The prover mnemonic start index"
  type        = string
  default     = ""
}

variable "BOT_SWAPS_REPLICAS" {
  description = "Number of AMM swap bot replicas to deploy (0 to disable)"
  type        = number
  default     = 0
}

variable "BOT_SWAPS_TX_INTERVAL_SECONDS" {
  description = "Interval in seconds between AMM swap bot transactions"
  type        = number
  default     = 10
}

variable "BOT_SWAPS_FOLLOW_CHAIN" {
  description = "AMM swaps bot follow-chain mode (e.g., NONE)"
  type        = string
  default     = "PENDING"
}

variable "BOT_SWAPS_PXE_SYNC_CHAIN_TIP" {
  description = "AMM swaps bot PXE sync chain tip mode (e.g., checkpointed)"
  type        = string
  default     = "checkpointed"
}

variable "BOT_SWAPS_L2_PRIVATE_KEY" {
  description = "Private key for the AMM swaps bot (hex string starting with 0x)"
  type        = string
  nullable    = true
  default     = null
}

variable "BOT_CROSS_CHAIN_MNEMONIC_START_INDEX" {
  description = "The cross-chain bot mnemonic start index"
  type        = string
  default     = ""
}

variable "BOT_CROSS_CHAIN_REPLICAS" {
  description = "Number of cross-chain bot replicas to deploy (0 to disable)"
  type        = number
  default     = 0
}

variable "BOT_CROSS_CHAIN_TX_INTERVAL_SECONDS" {
  description = "Interval in seconds between cross-chain bot transactions"
  type        = number
  default     = 10
}

variable "BOT_CROSS_CHAIN_FOLLOW_CHAIN" {
  description = "Cross-chain bot follow-chain mode"
  type        = string
  default     = "PENDING"
}

variable "BOT_CROSS_CHAIN_L2_PRIVATE_KEY" {
  description = "Private key for the cross-chain bot (hex string starting with 0x)"
  type        = string
  nullable    = true
  default     = null
}

variable "BOT_CROSS_CHAIN_PXE_SYNC_CHAIN_TIP" {
  description = "Cross-chain bot PXE sync chain tip mode (e.g., checkpointed)"
  type        = string
  default     = "checkpointed"
}

variable "BOT_DA_GAS_LIMIT" {
  description = "DA gas limit for bot transactions (empty to use gas estimation)"
  type        = string
  default     = ""
}

variable "BOT_L2_GAS_LIMIT" {
  description = "L2 gas limit for bot transactions (empty to use gas estimation)"
  type        = string
  default     = ""
}

# RPC ingress configuration (GKE-specific)
variable "RPC_INGRESS_ENABLED" {
  description = "Enable GKE ingress for RPC nodes"
  type        = bool
  default     = false
}

variable "RPC_INGRESS_HOSTS" {
  description = "Hostnames for RPC ingress"
  type        = list(string)
  default     = []
}

variable "RPC_INGRESS_STATIC_IP_NAME" {
  description = "Name of the GCP static IP resource for the ingress"
  type        = string
  default     = ""
}

variable "RPC_INGRESS_SSL_CERT_NAMES" {
  description = "Names of the GCP managed SSL certificates for the ingress"
  type        = list(string)
  default     = []
}

variable "RPC_CLOUD_ARMOR_POLICY_NAME" {
  description = "Name of a Cloud Armor security policy to attach to the RPC ingress BackendConfig. Leave empty to disable."
  type        = string
  default     = ""
}

variable "RPC_INGRESS_SESSION_AFFINITY" {
  description = "Session affinity type for the RPC BackendConfig. One of NONE, CLIENT_IP, GENERATED_COOKIE. Leave empty for no affinity (GCE default)."
  type        = string
  default     = ""
}

variable "RPC_INGRESS_LOG_SAMPLE_RATE" {
  description = "LB access-log sample rate for the RPC BackendConfig (0.0-1.0). When set, logs include the Cloud Armor matched rule priority. Leave null to disable logging (GCE default)."
  type        = number
  nullable    = true
  default     = null
}

variable "PROVER_FAILED_PROOF_STORE" {
  description = "Optional GCS/URI to store failed proofs from the prover"
  type        = string
  nullable    = false
  default     = ""
}

variable "L1_TX_FAILED_STORE" {
  description = "Optional GCS/URI to store failed L1 transaction inputs (e.g. gs://bucket/path)"
  type        = string
  nullable    = false
  default     = ""
}

variable "PROVER_PROOF_STORE" {
  description = "Optional GCS/S3/file URI to store proof inputs and outputs (e.g. gs://bucket/path, s3://bucket/path, file:///path)"
  type        = string
  nullable    = false
  default     = ""
}

variable "PROVER_BROKER_DEBUG_REPLAY_ENABLED" {
  description = "Enable debug replay mode for the prover broker to replay proving jobs from stored inputs"
  type        = bool
  default     = false
}

variable "RPC_REPLICAS" {
  description = "The number of RPC replicas"
  type        = string
  default     = 1
}

variable "FULL_NODE_REPLICAS" {
  description = "The number of full node replicas"
  type        = string
  default     = 1
}

variable "P2P_TX_POOL_DELETE_TXS_AFTER_REORG" {
  description = "Whether to delete transactions from the P2P transaction pool after a reorg"
  type        = bool
  default     = false
}

variable "PROVER_AGENTS_PER_PROVER" {
  description = "Number of prover agents per prover"
  type        = string
  default     = 1
}

variable "BLOB_ALLOW_EMPTY_SOURCES" {
  description = "Whether to allow starting without any consensus client URLs"
  type        = bool
  default     = false
}

variable "BLOB_FILE_STORE_UPLOAD_URL" {
  description = "URL for uploading blobs (e.g., gs://bucket/path/, s3://bucket/path/)"
  type        = string
  nullable    = true
  default     = null
}

variable "BLOB_FILE_STORE_URLS" {
  description = "Comma-separated URLs for reading blobs from filestore. Set to ',' to disable."
  type        = string
  default     = ""
}

variable "TX_FILE_STORE_ENABLED" {
  description = "Whether to enable uploading transactions to file storage"
  type        = bool
  default     = false
}

variable "TX_FILE_STORE_URL" {
  description = "URL for uploading transactions (e.g., s3://bucket/path/, gs://bucket/path/)"
  type        = string
  nullable    = true
  default     = null
}

variable "TX_COLLECTION_FILE_STORE_URLS" {
  description = "Comma-separated URLs for reading transactions from file storage"
  type        = string
  default     = ""
}

variable "PROVER_AGENT_POLL_INTERVAL_MS" {
  description = "Interval in milliseconds between prover agent polls"
  type        = number
  default     = 1000
}

variable "PROVER_AGENT_KEDA_ENABLED" {
  description = "Whether KEDA should scale prover agent pods from proving queue depth"
  type        = bool
  default     = false
}

variable "PROVER_AGENT_KEDA_MIN_REPLICAS" {
  description = "Minimum prover agent pods managed by KEDA"
  type        = number
  default     = 0
}

variable "PROVER_AGENT_KEDA_MAX_REPLICAS" {
  description = "Maximum prover agent pods managed by KEDA"
  type        = number
  default     = 1
}

variable "PROVER_AGENT_KEDA_SCALING_BANDS" {
  description = "Step scaling bands for prover agents. Each band scales to replicas when total proving queue size is greater than queueSize."
  type = list(object({
    queueSize = number
    replicas  = number
  }))
  default = []
}

variable "PROVER_AGENT_KEDA_PROMETHEUS_SERVER_ADDRESS" {
  description = "Prometheus server URL queried by KEDA for prover queue depth"
  type        = string
  default     = ""
}

variable "PROVER_AGENT_KEDA_POLLING_INTERVAL_SECONDS" {
  description = "KEDA polling interval for prover agent queue-depth scaling"
  type        = number
  default     = 30
}

variable "PROVER_AGENT_KEDA_COOLDOWN_PERIOD_SECONDS" {
  description = "KEDA cooldown period before scaling prover agents back down"
  type        = number
  default     = 300
}

variable "PROVER_AGENT_INCLUDE_METRICS" {
  description = "Metrics whitelist in the prover agent"
  type        = string
  default     = null
}

variable "FULL_NODE_INCLUDE_METRICS" {
  description = "Metrics whitelist in the full node"
  type        = string
  default     = null
}

variable "FISHERMAN_REPLICAS" {
  description = "Number of dedicated fisherman node replicas (separate from the rpc-node)"
  type        = number
  default     = 0
}

variable "P2P_GOSSIPSUB_D" {
  description = "The P2P Gossipsub D parameter"
  type        = string
  default     = "8"
}

variable "P2P_GOSSIPSUB_DLO" {
  description = "The P2P Gossipsub D parameter"
  type        = string
  default     = "4"
}

variable "P2P_GOSSIPSUB_DHI" {
  description = "The P2P Gossipsub D parameter"
  type        = string
  default     = "12"
}

variable "P2P_DROP_TX_CHANCE" {
  description = "The chance (0-1) of dropping an incoming transaction in the P2P layer (for testing)"
  type        = number
  default     = 0
}

variable "WS_NUM_HISTORIC_CHECKPOINTS" {
  description = "Number of historic checkpoints for world state"
  type        = string
  nullable    = true
  default     = null
}

# Controls whether nodes announce public IPs for P2P (true for GKE; set false for kind/local)
variable "P2P_PUBLIC_IP" {
  description = "Announce public IP for P2P (set false in kind/local to use pod IPs)"
  type        = bool
  default     = true
}

# Controls whether to expose P2P via NodePort instead of hostPort. Recommended true for KIND/local.
variable "P2P_NODEPORT_ENABLED" {
  description = "Enable NodePort for P2P service (true for KIND/local, false for GKE by default)"
  type        = bool
  default     = false
}

variable "DEBUG_FORCE_TX_PROOF_VERIFICATION" {
  description = "Whether to force tx proof verification. Only has an effect if real proving is turned off"
  type        = bool
  default     = false
}

variable "WAIT_FOR_PROVER_DEPLOY" {
  description = "Whether to wait for the prover helm installation. You might want to turn this off if a large number of prover agents should start"
  type        = bool
  default     = true
}
