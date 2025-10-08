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

variable "P2P_BOOTSTRAP_RESOURCE_PROFILE" {
  description = "Resource profile to use for the p2p bootstrap (dev or prod)"
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["dev", "prod"], var.P2P_BOOTSTRAP_RESOURCE_PROFILE)
    error_message = "P2P_BOOTSTRAP_RESOURCE_PROFILE must be either 'dev' or 'prod'."
  }
}

variable "VALIDATOR_RESOURCE_PROFILE" {
  description = "Resource profile to use for the validator (dev or prod)"
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["dev", "prod"], var.VALIDATOR_RESOURCE_PROFILE)
    error_message = "VALIDATOR_RESOURCE_PROFILE must be either 'dev' or 'prod'."
  }
}

variable "PROVER_RESOURCE_PROFILE" {
  description = "Resource profile to use for the prover (dev or prod)"
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["dev", "prod"], var.PROVER_RESOURCE_PROFILE)
    error_message = "PROVER_RESOURCE_PROFILE must be either 'dev' or 'prod'."
  }
}

variable "RPC_RESOURCE_PROFILE" {
  description = "Resource profile to use for the rpc (dev or prod)"
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["dev", "prod"], var.RPC_RESOURCE_PROFILE)
    error_message = "RPC_RESOURCE_PROFILE must be either 'dev' or 'prod'."
  }
}

variable "BOT_RESOURCE_PROFILE" {
  description = "Resource profile to use for the bots (dev or prod)"
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["dev", "prod"], var.BOT_RESOURCE_PROFILE)
    error_message = "BOT_RESOURCE_PROFILE must be either 'dev' or 'prod'."
  }
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

variable "SLASH_FACTORY_CONTRACT_ADDRESS" {
  description = "The slash factory contract address"
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
  type        = string
  default     = 12
}

variable "VALIDATOR_PUBLISHERS_PER_VALIDATOR_KEY" {
  description = "Number of publisher EOAs per validator key"
  type        = string
  default     = 1
}

variable "VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX" {
  description = "Mnemonic start index for validator publishers"
  type        = string
  default     = 5000
}

variable "VALIDATOR_REPLICAS" {
  description = "The number of validator replicas"
  type        = string
  default     = 4
}

variable "PROVER_MNEMONIC" {
  description = "The prover mnemonic"
  type        = string
  default     = "test test test test test test test test test test test junk"
}

variable "PROVER_MNEMONIC_START_INDEX" {
  description = "The prover mnemonic start index"
  type        = string
  default     = 1000
}

variable "PROVER_REPLICAS" {
  description = "The number of prover replicas"
  type        = string
  default     = 4
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

variable "OTEL_COLLECTOR_ENDPOINT" {
  description = "Optional OpenTelemetry collector endpoint URL (e.g., http://otel-collector:4318)"
  type        = string
  default     = null
  nullable    = true
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
  default     = "0"
}

variable "SEQ_MAX_TX_PER_BLOCK" {
  description = "Maximum number of sequencer transactions per block"
  type        = string
  default     = "8"
}

variable "SENTINEL_ENABLED" {
  description = "Whether to enable sentinel"
  type        = string
  default     = true
}

variable "SLASH_MIN_PENALTY_PERCENTAGE" {
  description = "The slash min penalty percentage"
  type        = string
  nullable    = true
}

variable "SLASH_MAX_PENALTY_PERCENTAGE" {
  description = "The slash max penalty percentage"
  type        = string
  nullable    = true
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

variable "SLASH_PRUNE_PENALTY" {
  description = "The slash prune penalty"
  type        = string
  nullable    = true
}

variable "SLASH_DATA_WITHHOLDING_PENALTY" {
  description = "The slash data withholding penalty"
  type        = string
  nullable    = true
}

variable "SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY" {
  description = "The slash propose invalid attestations penalty"
  type        = string
  default     = 0.0
}

variable "SLASH_ATTEST_DESCENDANT_OF_INVALID_PENALTY" {
  description = "The slash attest descendant of invalid penalty"
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

variable "DEPLOY_ARCHIVAL_NODE" {
  description = "Whether to deploy the archival node"
  type        = bool
  default     = false
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

variable "BOT_SWAPS_L2_PRIVATE_KEY" {
  description = "Private key for the AMM swaps bot (hex string starting with 0x)"
  type        = string
  nullable    = true
  default     = null
}

# RPC ingress configuration (GKE-specific)
variable "RPC_INGRESS_ENABLED" {
  description = "Enable GKE ingress for RPC nodes"
  type        = bool
  default     = false
}

variable "RPC_INGRESS_HOST" {
  description = "Hostname for RPC ingress"
  type        = string
  default     = ""
}

variable "RPC_INGRESS_STATIC_IP_NAME" {
  description = "Name of the GCP static IP resource for the ingress"
  type        = string
  default     = ""
}

variable "RPC_INGRESS_SSL_CERT_NAME" {
  description = "Name of the GCP managed SSL certificate for the ingress"
  type        = string
  default     = ""
}

variable "PROVER_FAILED_PROOF_STORE" {
  description = "Optional GCS/URI to store failed proofs from the prover"
  type        = string
  nullable    = false
  default     = ""
}
