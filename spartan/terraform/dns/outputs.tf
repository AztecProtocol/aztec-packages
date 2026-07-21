output "rpc_zone_name" {
  description = "Cloud DNS zone name for rpc.aztec-labs.com. Pass to network-frontend when CREATE_DNS=true."
  value       = google_dns_managed_zone.rpc.name
}

output "rpc_zone_dns_name" {
  description = "Fully-qualified zone name (trailing dot)."
  value       = google_dns_managed_zone.rpc.dns_name
}

output "rpc_zone_name_servers" {
  description = "Name servers for rpc.aztec-labs.com"
  value       = google_dns_managed_zone.rpc.name_servers
}
