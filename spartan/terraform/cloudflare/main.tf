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

# Attach custom domain to the R2 bucket
resource "cloudflare_r2_custom_domain" "aztec_labs_snapshots_com" {
  account_id  = var.R2_ACCOUNT_ID
  bucket_name = cloudflare_r2_bucket.bucket.name
  domain      = var.DOMAIN
  zone_id     = var.R2_ZONE_ID
  enabled     = true
}

# Lifecycle rules to automatically delete old objects
resource "cloudflare_r2_bucket_lifecycle" "cleanup" {
  account_id  = var.R2_ACCOUNT_ID
  bucket_name = cloudflare_r2_bucket.bucket.name

  rules = [
    {
      id                        = "delete-snapshot-files"
      enabled                   = true
      conditions                = { suffix = ".db" }
      delete_objects_transition = { days = var.SNAPSHOT_RETENTION_DAYS }
    },
    {
      id                        = "delete-blob-files"
      enabled                   = true
      conditions                = { suffix = ".data" }
      delete_objects_transition = { days = var.BLOB_RETENTION_DAYS }
    },
  ]
}

