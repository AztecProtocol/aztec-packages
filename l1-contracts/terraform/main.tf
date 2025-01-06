terraform {
  backend "s3" {
    bucket = "aztec-terraform"
    region = "eu-west-2"
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "3.74.2"
    }
  }
}

variable "ROLLUP_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "rollup_contract_address" {
  value = var.ROLLUP_CONTRACT_ADDRESS
}

variable "REGISTRY_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "registry_contract_address" {
  value = var.REGISTRY_CONTRACT_ADDRESS
}

variable "INBOX_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "inbox_contract_address" {
  value = var.INBOX_CONTRACT_ADDRESS
}

variable "OUTBOX_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "outbox_contract_address" {
  value = var.OUTBOX_CONTRACT_ADDRESS
}


variable "FEE_JUICE_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "fee_juice_contract_address" {
  value = var.FEE_JUICE_CONTRACT_ADDRESS
}

variable "STAKING_ASSET_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "staking_asset_contract_address" {
  value = var.STAKING_ASSET_CONTRACT_ADDRESS
}

variable "FEE_JUICE_PORTAL_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "FEE_JUICE_PORTAL_CONTRACT_ADDRESS" {
  value = var.FEE_JUICE_PORTAL_CONTRACT_ADDRESS
}

variable "COIN_ISSUER_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "COIN_ISSUER_CONTRACT_ADDRESS" {
  value = var.COIN_ISSUER_CONTRACT_ADDRESS
}

variable "REWARD_DISTRIBUTOR_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "REWARD_DISTRIBUTOR_CONTRACT_ADDRESS" {
  value = var.REWARD_DISTRIBUTOR_CONTRACT_ADDRESS
}

variable "GOVERNANCE_PROPOSER_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "GOVERNANCE_PROPOSER_CONTRACT_ADDRESS" {
  value = var.GOVERNANCE_PROPOSER_CONTRACT_ADDRESS
}

variable "GOVERNANCE_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "GOVERNANCE_CONTRACT_ADDRESS" {
  value = var.GOVERNANCE_CONTRACT_ADDRESS
}

variable "SLASH_FACTORY_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "SLASH_FACTORY_CONTRACT_ADDRESS" {
  value = var.SLASH_FACTORY_CONTRACT_ADDRESS
}
