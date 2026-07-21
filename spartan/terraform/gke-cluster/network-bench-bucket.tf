resource "google_storage_managed_folder" "aztec_testnet_network_bench_folder" {
  bucket        = google_storage_bucket.snapshots-bucket.name
  name          = "network_bench/"
  force_destroy = true
}

resource "google_storage_managed_folder_iam_policy" "aztec_testnet_network_bench_folder_policy" {
  bucket         = google_storage_managed_folder.aztec_testnet_network_bench_folder.bucket
  managed_folder = google_storage_managed_folder.aztec_testnet_network_bench_folder.name
  policy_data    = data.google_iam_policy.all_users_storage_read.policy_data
}
