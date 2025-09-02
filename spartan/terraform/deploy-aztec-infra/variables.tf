variable "GCP_PROJECT" {
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

variable "RPC_EXTERNAL_INGRESS" {
  description = "Whether to use an external ingress for the rpc"
  type        = bool
  default     = false
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

variable "OTEL_COLLECTOR_URL" {
  description = "The URL of an OpenTelemtry collector to send metrics to"
  type        = string
  nullable    = true
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
  default     = 1
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

variable "OTEL_COLLECTOR_ENDPOINT" {
  description = "Optional OpenTelemetry collector endpoint URL (e.g., http://otel-collector:4318)"
  type        = string
  default     = ""
}
