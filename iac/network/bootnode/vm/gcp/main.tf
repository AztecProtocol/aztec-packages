
# Retrieve the IP for our region
data "terraform_remote_state" "networking" {
  backend = "gcs"

  config = {
    bucket = "my-terraform-state-bucket"
    prefix = "network/${var.network_name}/ip/bootnode"
  }
}

data "terraform_remote_state" "common" {
  backend = "gcs"

  config = {
    bucket = "my-terraform-state-bucket"
    prefix = "network/common"
  }
}

locals {
  ip_address            = data.terraform_remote_state.networking.outputs.ip_addresses[var.region]
  ssh_user              = data.terraform_remote_state.common.outputs.ssh_user
  public_key            = data.terraform_remote_state.common.outputs.public_key
  service_account_email = data.terraform_remote_state.common.outputs.service_account_email
}


# Create the VM and assign the static IP
resource "google_compute_instance" "vm" {
  name         = "${var.network_name}-${var.region}-bootnode-vm"
  machine_type = var.machine_type
  zone         = "${var.region}-a"

  # Create a 50GB disk for the VM
  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 50
    }
  }

  network_interface {
    network = "default"

    # Assign the reserved static IP
    access_config {
      nat_ip = local.ip_address
    }
  }

  metadata = {
    ssh-keys       = "${local.ssh_user}:${local.public_key}"
    static-ip      = local.ip_address
    startup-script = templatefile(var.start_script, { STATIC_IP = local.ip_address, PEER_ID_PRIVATE_KEY = var.peer_id_private_key, DATA_STORE_MAP_SIZE = 67108864 })
  }

  tags = ["bootnode"]

  # Service account scopes to enable logging to GCP
  service_account {
    email  = local.service_account_email
    scopes = ["https://www.googleapis.com/auth/logging.write", "https://www.googleapis.com/auth/monitoring.write"]
  }
}


