terraform {
  backend "s3" {
    bucket = "aztec-terraform"
    region = "eu-west-2"
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.29.0"
    }
  }
}

data "terraform_remote_state" "aztec2_iac" {
  backend = "s3"
  config = {
    bucket = "aztec-terraform"
    key    = "aztec2/iac"
    region = "eu-west-2"
  }
}

variable "DEPLOY_TAG" {
  type = string
}

# S3 Bucket to store contract addresses
resource "aws_s3_bucket" "contract_addresses" {
  bucket = "static.aztec.network"
}

resource "aws_s3_bucket_website_configuration" "addresses_website_bucket" {
  bucket = aws_s3_bucket.contract_addresses.id

  index_document {
    suffix = "aztec-static"
  }
}

resource "aws_s3_bucket_public_access_block" "addresses_public_access" {
  bucket = aws_s3_bucket.contract_addresses.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "addresses_bucket_policy" {
  bucket = aws_s3_bucket.contract_addresses.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "arn:aws:s3:::${aws_s3_bucket.contract_addresses.id}/*"
      }
    ]
  })
}

resource "aws_route53_record" "static" {
  zone_id = data.terraform_remote_state.aztec2_iac.outputs.aws_route53_zone_id
  name    = "static.aztec.network"
  type    = "A"

  alias {
    name                   = aws_s3_bucket_website_configuration.addresses_website_bucket.website_domain
    zone_id                = aws_s3_bucket.contract_addresses.hosted_zone_id
    evaluate_target_health = true
  }
}

variable "ROLLUP_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "rollup_contract_address" {
  value = var.ROLLUP_CONTRACT_ADDRESS
}

variable "AVAILABILITY_ORACLE_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "availability_oracle_contract_address" {
  value = var.AVAILABILITY_ORACLE_CONTRACT_ADDRESS
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


variable "GAS_TOKEN_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "gas_token_contract_address" {
  value = var.GAS_TOKEN_CONTRACT_ADDRESS
}

variable "GAS_PORTAL_CONTRACT_ADDRESS" {
  type    = string
  default = ""
}

output "gas_portal_contract_address" {
  value = var.GAS_PORTAL_CONTRACT_ADDRESS
}
