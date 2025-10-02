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

# see yarn-project/stdlib/src/update-checker/update-checker.ts for latest schema

# Deprecated. Use the `testnet` object once v2 is released
resource "google_storage_bucket_object" "alpha_testnet_json" {
  bucket        = google_storage_managed_folder.aztec_testnet_auto_update_folder.bucket
  name          = "${google_storage_managed_folder.aztec_testnet_auto_update_folder.name}alpha-testnet.json"
  content_type  = "application/json"
  cache_control = "no-store"
  content = jsonencode({
    version = ""
    config = {
      maxTxsPerBlock            = 8
      publishTxsWithProposals   = false
      governanceProposerPayload = "0x0000000000000000000000000000000000000000"
    }
  })
}

resource "google_storage_bucket_object" "staging_ignition" {
  bucket        = google_storage_managed_folder.aztec_testnet_auto_update_folder.bucket
  name          = "${google_storage_managed_folder.aztec_testnet_auto_update_folder.name}staging-ignition.json"
  content_type  = "application/json"
  cache_control = "no-store"
  content = jsonencode({
    version = ""
    config  = {}
  })
}

resource "google_storage_bucket_object" "staging_public" {
  bucket        = google_storage_managed_folder.aztec_testnet_auto_update_folder.bucket
  name          = "${google_storage_managed_folder.aztec_testnet_auto_update_folder.name}staging-public.json"
  content_type  = "application/json"
  cache_control = "no-store"
  content = jsonencode({
    version = ""
    config = {
      governanceProposerPayload = "0x0972CE94b1AC39Ecf737e8221cD290A84bA63921"
    }
  })
}

resource "google_storage_bucket_object" "testnet" {
  bucket        = google_storage_managed_folder.aztec_testnet_auto_update_folder.bucket
  name          = "${google_storage_managed_folder.aztec_testnet_auto_update_folder.name}testnet.json"
  content_type  = "application/json"
  cache_control = "no-store"
  content = jsonencode({
    version = ""
    config  = {}
  })
}
