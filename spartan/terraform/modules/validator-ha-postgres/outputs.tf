output "database_url" {
  value       = local.database_url
  sensitive   = true
  description = "PostgreSQL connection URL for validator HA signing"
}
