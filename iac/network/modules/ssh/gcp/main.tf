resource "tls_private_key" "ssh_key" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "google_secret_manager_secret" "ssh_private_key" {
  secret_id = var.secret_name
  replication {
    auto {

    }
  }
}

resource "google_secret_manager_secret_version" "ssh_private_key_version" {
  secret      = google_secret_manager_secret.ssh_private_key.id
  secret_data = tls_private_key.ssh_key.private_key_pem
}

resource "google_compute_project_metadata" "ssh_keys" {
  metadata = {
    ssh-keys = "${var.ssh_user}:${tls_private_key.ssh_key.public_key_openssh}"
  }
}
