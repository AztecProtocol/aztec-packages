# Define Terraform configuration and remote S3 backend
terraform {
  backend "s3" {
    bucket = "aztec-terraform"
    # OPTIMIZATION: Use a more specific key structure for environments (e.g., prod/staging)
    key    = "aztec-network/core/iac.tfstate"
    region = "eu-west-2"
    # Optional: Enable state locking via DynamoDB for safety
    # dynamodb_table = "aztec-terraform-lock" 
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "3.74.2"
    }
  }
}

# Configure the AWS provider
provider "aws" {
  profile = "default"
  region  = "eu-west-2"
}

# --- Remote State Retrieval ---

# Retrieves networking resources (VPC, Subnets, Public SG) from the 'setup' layer.
data "terraform_remote_state" "setup_iac" {
  backend = "s3"
  config = {
    bucket = "aztec-terraform"
    key    = "setup/setup-iac.tfstate" # Assuming .tfstate suffix
    region = "eu-west-2"
  }
}

# Retrieves DNS resources (Route53 Zone ID) from the 'aztec2' layer.
data "terraform_remote_state" "aztec2_iac" {
  backend = "s3"
  config = {
    bucket = "aztec-terraform"
    key    = "aztec2/iac.tfstate" # Assuming .tfstate suffix
    region = "eu-west-2"
  }
}

# --- Network Resources (Load Balancer & EIPs) ---

# Allocate Elastic IP for the first subnet (AZ1).
resource "aws_eip" "aztec_network_p2p_eip_az1" {
  vpc = true
}

# OPTIMIZATION: Allocate Elastic IP for the second subnet (AZ2) for symmetry.
resource "aws_eip" "aztec_network_p2p_eip_az2" {
  vpc = true
}

# Create our P2P Network Load Balancer (NLB).
resource "aws_lb" "aztec_network_nlb" {
  name               = "aztec-network-nlb"
  internal           = false
  load_balancer_type = "network"
  
  # CRITICAL FIX: Network Load Balancers (NLB) do not support Security Groups.
  # The `security_groups` attribute must be omitted.

  # Map subnets and assign static Elastic IPs for stability.
  subnet_mapping {
    subnet_id     = data.terraform_remote_state.setup_iac.outputs.subnet_az1_id
    allocation_id = aws_eip.aztec_network_p2p_eip_az1.id
  }

  subnet_mapping {
    subnet_id     = data.terraform_remote_state.setup_iac.outputs.subnet_az2_id
    allocation_id = aws_eip.aztec_network_p2p_eip_az2.id
  }

  access_logs {
    bucket  = "aztec-logs"
    prefix  = "aztec-network-nlb-logs"
    enabled = true # OPTIMIZATION: Enable access logs for auditability
  }

  tags = {
    Name = "aztec-network-nlb"
  }
}

# Security Group for allowing P2P traffic to the NLB targets (e.g., EC2 instances).
# This SG should be attached to the instances, not the NLB itself.
resource "aws_security_group" "security_group_p2p" {
  name        = "security-group-aztec-p2p"
  description = "Allow inbound p2p traffic from the NLB."
  vpc_id      = data.terraform_remote_state.setup_iac.outputs.vpc_id

  # Note: Ingress rules (allowing P2P ports) will need to be added to this SG elsewhere.
  
  tags = {
    Name = "allow-p2p"
  }
}

# --- Static Website Hosting (static.aztec.network) ---

# S3 Bucket for hosting contract addresses as a static website.
resource "aws_s3_bucket" "contract_addresses_bucket" {
  bucket = "static.aztec.network"
  acl    = "public-read" # Set ACL for static website hosting (Legacy, but simple)

  website {
    index_document = "index.html"
    # error_document = "error.html" # Optional: Add error document
  }
}

# Required to allow public access to the bucket contents (needed for static website hosting).
resource "aws_s3_bucket_public_access_block" "addresses_public_access" {
  bucket = aws_s3_bucket.contract_addresses_bucket.id

  # Allowing public access is intentional for static website hosting
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Policy to explicitly allow s3:GetObject for all principals (public read access).
resource "aws_s3_bucket_policy" "addresses_bucket_policy" {
  bucket = aws_s3_bucket.contract_addresses_bucket.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.contract_addresses_bucket.arn}/*" # Use ARN for robust reference
      }
    ]
  })
}

# Route53 Alias record to point static.aztec.network to the S3 static website endpoint.
resource "aws_route53_record" "static_website_alias" {
  zone_id = data.terraform_remote_state.aztec2_iac.outputs.aws_route53_zone_id
  name    = "static.aztec.network"
  type    = "A"

  alias {
    name                 = aws_s3_bucket.contract_addresses_bucket.website_domain
    zone_id              = aws_s3_bucket.contract_addresses_bucket.hosted_zone_id
    evaluate_target_health = true
  }
}
