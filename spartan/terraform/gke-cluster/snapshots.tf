# Import the existing bucket with the same settings
resource "google_storage_bucket" "snapshots-bucket" {
  name     = "aztec-testnet"
  location = "us-west1"

  autoclass {
    enabled                = true
    terminal_storage_class = "ARCHIVE"
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      num_newer_versions = 3
      with_state         = "ARCHIVED"
    }
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      days_since_noncurrent_time = 15
      with_state                 = "ANY"
    }
  }
}

resource "google_storage_managed_folder" "aztec_testnet_auto_update_folder" {
  bucket        = google_storage_bucket.snapshots-bucket.name
  name          = "auto-update/"
  force_destroy = true
}

resource "google_storage_managed_folder_iam_policy" "aztec_testnet_auto_update_folder_policy" {
  bucket         = google_storage_managed_folder.aztec_testnet_auto_update_folder.bucket
  managed_folder = google_storage_managed_folder.aztec_testnet_auto_update_folder.name
  policy_data    = data.google_iam_policy.all_users_storage_read.policy_data
}

resource "google_storage_bucket_object" "alpha_testnet_json" {
  bucket        = google_storage_managed_folder.aztec_testnet_auto_update_folder.bucket
  name          = "${google_storage_managed_folder.aztec_testnet_auto_update_folder.name}alpha-testnet.json"
  content_type  = "application/json"
  cache_control = "no-store"
  # see yarn-project/foundation/src/update-checker/update-checker.ts for latest schema
  content = jsonencode({
    version = "0.87.8"
    config = {
      maxTxsPerBlock            = 8
      publishTxsWithProposals   = false
      governanceProposerPayload = "0x0000000000000000000000000000000000000000"
    }
  })
}
