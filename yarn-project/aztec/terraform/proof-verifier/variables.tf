variable "DEPLOY_TAG" {
  type = string
}

variable "DOCKERHUB_ACCOUNT" {
  type = string
}

variable "LOG_LEVEL" {
  type    = string
  default = "verbose"
}

variable "ETHEREUM_HOSTS" {
  type = string
}

variable "L1_CHAIN_ID" {
  type = number
}

variable "ROLLUP_CONTRACT_ADDRESS" {
  type = string
}