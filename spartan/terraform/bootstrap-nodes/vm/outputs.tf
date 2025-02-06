output "static_ip" {
  value = google_compute_address.static_ip.address
}

output "peer_id_private_key" {
  value = var.peer_id_private_key
}
