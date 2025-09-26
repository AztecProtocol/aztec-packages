terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "terraform/state/cloudflare"
  }
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "cloudflare" {
  api_token = var.R2_API_TOKEN
}

# Create the R2 bucket
resource "cloudflare_r2_bucket" "bucket" {
  account_id = var.R2_ACCOUNT_ID
  name       = var.BUCKET_NAME
}

# Enable the r2.dev public URL for this bucket
resource "cloudflare_r2_managed_domain" "r2dev" {
  account_id  = var.R2_ACCOUNT_ID
  bucket_name = cloudflare_r2_bucket.bucket.name
  enabled     = true
}

