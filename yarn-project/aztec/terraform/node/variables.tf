variable "DEPLOY_TAG" {
  type = string
}

variable "IMAGE_TAG" {
  type    = string
  default = "latest"
}

variable "API_KEY" {
  type = string
}

variable "FORK_ADMIN_API_KEY" {
  type    = string
  default = ""
}

variable "ETHEREUM_HOST" {
  type    = string
  default = ""
}

variable "SEQUENCER_PRIVATE_KEYS" {
  type = list(string)
}

variable "NODE_P2P_PRIVATE_KEYS" {
  type = list(string)
}

variable "L1_CHAIN_ID" {
  type = string
}

variable "NODE_P2P_TCP_PORT" {
  type = number
}

variable "NODE_P2P_UDP_PORT" {
  type = number
}

variable "DOCKERHUB_ACCOUNT" {
  type = string
}

variable "SEQ_MAX_TX_PER_BLOCK" {
  type    = string
  default = 64
}

variable "SEQ_MIN_TX_PER_BLOCK" {
  type    = string
  default = 2
}

variable "SEQ_MAX_SECONDS_BETWEEN_BLOCKS" {
  type    = string
  default = 0
}

variable "SEQ_MIN_SECONDS_BETWEEN_BLOCKS" {
  type    = string
  default = 0
}

variable "P2P_MIN_PEERS" {
  type    = string
  default = 5
}

variable "P2P_MAX_PEERS" {
  type    = string
  default = 100
}

variable "P2P_ENABLED" {
  type    = bool
  default = false
}

variable "P2P_TX_POOL_KEEP_PROVEN_FOR" {
  type    = number
  default = 64
}

variable "P2P_GOSSIPSUB_INTERVAL_MS" {
  type    = number
  default = 1000
}

variable "P2P_GOSSIPSUB_D" {
  type    = number
  default = 8
}

variable "P2P_GOSSIPSUB_DLO" {
  type    = number
  default = 4
}

variable "P2P_GOSSIPSUB_DHI" {
  type    = number
  default = 12
}

variable "P2P_GOSSIPSUB_MCACHE_LENGTH" {
  type    = number
  default = 5
}

variable "P2P_GOSSIPSUB_MCACHE_GOSSIP" {
  type    = number
  default = 3
}

variable "P2P_SEVERE_PEER_PENALTY_BLOCK_LENGTH" {
  type    = number
  default = 30
}

variable "PROVING_ENABLED" {
  type    = bool
  default = false
}

variable "BOOTSTRAP_NODES" {
  type    = string
  default = ""
}

variable "NODE_LB_RULE_PRIORITY" {
  type = number
}
