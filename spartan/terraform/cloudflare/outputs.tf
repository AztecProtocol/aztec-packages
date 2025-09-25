output "bucket_name" {
  value = cloudflare_r2_bucket.bucket.name
}

output "account_id" {
  value = var.R2_ACCOUNT_ID
}

output "s3_endpoint" {
  value = "https://${var.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
}

output "upload_location" {
  value = "s3://${cloudflare_r2_bucket.bucket.name}/snapshots/testnet/?endpoint=https://${var.R2_ACCOUNT_ID}.r2.cloudflarestorage.com&publicBaseUrl=https://pub-f4a8c34d4bb7441ebf8f48d904512180.r2.dev"
}
