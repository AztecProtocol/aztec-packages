
variable "K8S_CLUSTER_CONTEXT" {
  description = "Kubernetes cluster context"
  type        = string
}

variable "NAMESPACE" {
  description = "Kubernetes namespace to deploy the job"
  type        = string
}

variable "AZTEC_DOCKER_IMAGE" {
  description = "Aztec Docker image with tag"
  type        = string
}

# Deploy L1 contracts configuration
variable "L1_RPC_URLS" {
  description = "Comma-separated list of L1 RPC URLs"
  type        = string
}

variable "PRIVATE_KEY" {
  description = "Private key for deployment"
  type        = string
  sensitive   = true
}

variable "L1_CHAIN_ID" {
  description = "L1 chain ID"
  type        = number
  default     = 31337
}

variable "SALT" {
  description = "Salt for deployment"
  type        = number
  nullable    = true
  default     = null
}

variable "VALIDATORS" {
  description = "Comma-separated list of validators"
  type        = string
}

variable "SPONSORED_FPC" {
  description = "Enable sponsored FPC"
  type        = bool
}

variable "TEST_ACCOUNTS" {
  description = "Enable test accounts"
  type        = bool
}

variable "REAL_VERIFIER" {
  description = "Deploy real verifier"
  type        = bool
}

# Environment variables for the deployment
variable "AZTEC_SLOT_DURATION" {
  description = "Aztec slot duration"
  type        = string
  nullable    = true
}

variable "AZTEC_EPOCH_DURATION" {
  description = "Aztec epoch duration"
  type        = string
  nullable    = true
}

variable "AZTEC_TARGET_COMMITTEE_SIZE" {
  description = "Aztec target committee size"
  type        = string
  nullable    = true
}

variable "AZTEC_PROOF_SUBMISSION_EPOCHS" {
  description = "Aztec proof submission epochs"
  type        = string
  nullable    = true
}

variable "AZTEC_ACTIVATION_THRESHOLD" {
  description = "Aztec activation threshold"
  type        = string
  nullable    = true
}

variable "AZTEC_EJECTION_THRESHOLD" {
  description = "Aztec ejection threshold"
  type        = string
  nullable    = true
}

variable "AZTEC_SLASHING_QUORUM" {
  description = "Aztec slashing quorum"
  type        = string
  nullable    = true
}

variable "AZTEC_SLASHING_ROUND_SIZE" {
  description = "Aztec slashing round size"
  type        = string
  nullable    = true
}

variable "AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS" {
  description = "Aztec slashing round size in epochs"
  type        = string
  nullable    = true
}

variable "AZTEC_SLASHING_LIFETIME_IN_ROUNDS" {
  description = "Aztec slashing lifetime in rounds"
  type        = string
  nullable    = true
}

variable "AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS" {
  description = "Aztec slashing execution delay in rounds"
  type        = string
  nullable    = true
}

variable "AZTEC_SLASHING_VETOER" {
  description = "Aztec slashing vetoer address"
  type        = string
  nullable    = true
}

variable "AZTEC_SLASHING_OFFSET_IN_ROUNDS" {
  description = "Aztec slashing offset in rounds"
  type        = string
  nullable    = true
}

variable "AZTEC_SLASH_AMOUNT_SMALL" {
  description = "Small slashing amount for light offenses"
  type        = string
  nullable    = true
}

variable "AZTEC_SLASH_AMOUNT_MEDIUM" {
  description = "Medium slashing amount for moderate offenses"
  type        = string
  nullable    = true
}

variable "AZTEC_SLASH_AMOUNT_LARGE" {
  description = "Large slashing amount for severe offenses"
  type        = string
  nullable    = true
}

variable "AZTEC_SLASHER_FLAVOR" {
  description = "Type of slasher proposer (empire, tally, or none)"
  type        = string
  nullable    = true
}

variable "AZTEC_GOVERNANCE_PROPOSER_QUORUM" {
  description = "Aztec governance proposer quorum"
  type        = string
  nullable    = true
}

variable "AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE" {
  description = "Aztec governance proposer round size"
  type        = string
  nullable    = true
}

variable "AZTEC_MANA_TARGET" {
  description = "Aztec mana target"
  type        = string
  nullable    = true
}

variable "AZTEC_PROVING_COST_PER_MANA" {
  description = "Aztec proving cost per mana"
  type        = string
  nullable    = true
}

variable "AZTEC_EXIT_DELAY_SECONDS" {
  description = "Aztec exit delay seconds"
  type        = string
  nullable    = true
}

variable "JOB_NAME" {
  description = "Name for the Kubernetes job"
  type        = string
  default     = "deploy-rollup-contracts"
}

variable "JOB_BACKOFF_LIMIT" {
  description = "Number of retries for failed job"
  type        = number
  default     = 3
}

variable "JOB_TTL_SECONDS_AFTER_FINISHED" {
  description = "TTL in seconds for job cleanup after completion"
  type        = number
  default     = 3600
}

variable "NETWORK" {
  description = "One of the existing network names to use default config for"
  type        = string
  nullable    = true
}

variable "FLUSH_ENTRY_QUEUE" {
  description = "Flush the entry queue after adding initial validators"
  type        = bool
  default     = true
}
