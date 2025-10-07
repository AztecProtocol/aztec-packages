variable "project" {
  default = "testnet-440309"
}

variable "region" {
  default = "us-west1"
}

variable "import_blockchain_node_region" {
  default = "us-central1"
}

variable "import_blockchain_node_id" {
  default = "eth-sepolia-node-3"
}

variable "mainnet_blockchain_node_region" {
  description = "Region to create the Ethereum mainnet node"
  default     = "us-central1"
}

variable "mainnet_blockchain_node_id" {
  description = "Resource ID for the Ethereum mainnet node"
  default     = "eth-mainnet-node-1"
}
