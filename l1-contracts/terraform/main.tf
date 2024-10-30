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

variable "FEE_JUICE_PORTAL_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "FEE_JUICE_PORTAL_CONTRACT_ADDRESS" {
  value = var.FEE_JUICE_PORTAL_CONTRACT_ADDRESS
}

variable "NOMISMATOKOPIO_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "NOMISMATOKOPIO_CONTRACT_ADDRESS" {
  value = var.NOMISMATOKOPIO_CONTRACT_ADDRESS
}

variable "SYSSTIA_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "SYSSTIA_CONTRACT_ADDRESS" {
  value = var.SYSSTIA_CONTRACT_ADDRESS
}

variable "GEROUSIA_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "GEROUSIA_CONTRACT_ADDRESS" {
  value = var.GEROUSIA_CONTRACT_ADDRESS
}

variable "APELLA_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "APELLA_CONTRACT_ADDRESS" {
  value = var.APELLA_CONTRACT_ADDRESS
}