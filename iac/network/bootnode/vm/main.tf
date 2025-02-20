# Reserve a static public IP
resource "google_compute_address" "static_ip" {
  name   = "${var.chain_id}-${var.region}-bootnode-ip"
  region = var.region
}


# Create the VM and assign the static IP
resource "google_compute_instance" "vm" {
  name         = "${var.chain_id}-${var.region}-bootnode-vm"
  machine_type = "t2d-standard-2"
  zone         = "${var.region}-a"

  # Create a 50GB disk for the VM
  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 80
    }
  }

  network_interface {
    network = "default"

    # Assign the reserved static IP
    access_config {
      nat_ip = google_compute_address.static_ip.address
    }
  }

  metadata = {
    ssh-keys       = "${var.ssh_user}:${var.public_key}"
    static-ip      = google_compute_address.static_ip.address # Pass IP as metadata
    startup-script = templatefile(var.start_script, { STATIC_IP = google_compute_address.static_ip.address, PEER_ID_PRIVATE_KEY = var.peer_id_private_key, DATA_STORE_MAP_SIZE = 67108864 })
  }

  # Service account scopes to enable logging to GCP
  service_account {
    email  = var.service_account_email
    scopes = ["https://www.googleapis.com/auth/logging.write", "https://www.googleapis.com/auth/monitoring.write"]
  }
}


