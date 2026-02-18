output "service_account_email" {
  value = google_service_account.gke_sa.email
}

output "region" {
  description = "Google cloud region"
  value       = var.region
}

output "devnet_network_rpc_ips" {
  description = "Static IPs and hostnames for v4 devnet networks"
  value = {
    for name, addr in google_compute_global_address.devnet_network_rpc_ip :
    name => {
      ip       = addr.address
      hostname = "${name}.aztec-labs.com"
    }
  }
}

