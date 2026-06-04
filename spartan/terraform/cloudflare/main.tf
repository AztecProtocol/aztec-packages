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

# Do not cache 404s
resource "cloudflare_ruleset" "cache_settings" {
  zone_id = var.R2_ZONE_ID
  kind    = "zone"
  name    = "R2 cache settings"
  phase   = "http_request_cache_settings"

  rules = [
    {
      ref         = "no_cache_404"
      description = "Do not cache 404 responses for R2 custom domain"
      expression  = "(http.host eq \"${var.DOMAIN}\")"
      action      = "set_cache_settings"
      action_parameters = {
        cache = true
        edge_ttl = {
          mode = "respect_origin"
          status_code_ttl = [
            {
              status_code = 404
              value       = 0
            }
          ]
        }
      }
    }
  ]
}

locals {
  full_lifecycle_folders = toset([
    "devnet",
    "ignition-sepolia",
    "next-net",
    "staging",
    "staging-ignition",
  ])

  snapshots_only_folders = toset([
    "testnet",
    "mainnet",
  ])
}

# Lifecycle rules to automatically delete old objects
resource "cloudflare_r2_bucket_lifecycle" "cleanup" {
  account_id  = var.R2_ACCOUNT_ID
  bucket_name = cloudflare_r2_bucket.bucket.name

  rules = flatten([
    [for folder in local.full_lifecycle_folders : [
      {
        id         = "delete-snapshots-${folder}"
        enabled    = true
        conditions = { prefix = "${folder}/aztec" }
        delete_objects_transition = {
          condition = {
            max_age = var.SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 # Convert days to seconds
            type    = "Age"
          }
        }
      },
      {
        id         = "delete-blobs-${folder}"
        enabled    = true
        conditions = { prefix = "${folder}/blobs" }
        delete_objects_transition = {
          condition = {
            max_age = var.BLOB_RETENTION_DAYS * 24 * 60 * 60 # Convert days to seconds
            type    = "Age"
          }
        }
      },
      {
        id         = "delete-txs-${folder}"
        enabled    = true
        conditions = { prefix = "${folder}/txs" }
        delete_objects_transition = {
          condition = {
            max_age = var.TX_RETENTION_DAYS * 24 * 60 * 60 # Convert days to seconds
            type    = "Age"
          }
        }
      },
    ]],
    [for folder in local.snapshots_only_folders : [
      {
        id         = "delete-snapshots-${folder}"
        enabled    = true
        conditions = { prefix = "${folder}/aztec" }
        delete_objects_transition = {
          condition = {
            max_age = var.SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 # Convert days to seconds
            type    = "Age"
          }
        }
      },
    ]],
  ])
}

