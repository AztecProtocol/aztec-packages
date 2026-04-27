output "ip_name" {
  description = "Name of the static IP; feed into RPC_INGRESS_STATIC_IP_NAME for deploy-aztec-infra."
  value       = google_compute_global_address.rpc_ip.name
}

output "ip_address" {
  description = "The static IP address."
  value       = google_compute_global_address.rpc_ip.address
}

output "cert_name" {
  description = "Name of the managed SSL cert; feed into RPC_INGRESS_SSL_CERT_NAMES for deploy-aztec-infra."
  value       = google_compute_managed_ssl_certificate.rpc_cert.name
}

output "hostnames" {
  description = "Hostnames served by this ingress; feed into RPC_INGRESS_HOSTS for deploy-aztec-infra."
  value       = var.RPC_HOSTNAMES
}
