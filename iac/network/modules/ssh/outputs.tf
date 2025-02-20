output "private_key_secret" {
  value = google_secret_manager_secret.ssh_private_key.secret_id
}

output "public_key" {
  value = tls_private_key.ssh_key.public_key_openssh
}

output "ssh_user" {
  value = var.ssh_user
}
