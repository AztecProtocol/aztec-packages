
terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
  }
}

data "terraform_remote_state" "common" {
  backend = "gcs"

  config = {
    bucket = "aztec-terraform"
    prefix = "network/common"
  }
}

data "terraform_remote_state" "ip" {
  backend = "gcs"

  config = {
    bucket = "aztec-terraform"
    prefix = "network/${var.network_name}/ip/bootnode"
  }
}

locals {
  ssh_user              = data.terraform_remote_state.common.outputs.ssh_user
  public_key            = data.terraform_remote_state.common.outputs.public_key
  service_account_email = data.terraform_remote_state.common.outputs.service_account_email
}


# Create the VM and assign the static IP
resource "google_compute_instance" "vm" {
  count        = length(toset(var.regions))
  name         = "${var.network_name}-${var.regions[count.index]}-bootnode-vm"
  machine_type = var.machine_type
  zone         = "${var.regions[count.index]}-a"
  project      = var.project_id

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
      nat_ip = data.terraform_remote_state.ip.outputs.ip_addresses[var.regions[count.index]]
    }

  }

  metadata = {
    ssh-keys  = "${local.ssh_user}:${local.public_key}"
    static-ip = data.terraform_remote_state.ip.outputs.ip_addresses[var.regions[count.index]]
    startup-script = templatefile(var.start_script, {
      STATIC_IP              = data.terraform_remote_state.ip.outputs.ip_addresses[var.regions[count.index]],
      PEER_ID_PRIVATE_KEY    = var.peer_id_private_keys[count.index],
      LOCATION               = "GCP",
      DATA_STORE_MAP_SIZE_KB = 16777216,
      ENRS                   = var.enrs,
    })
  }

  tags = ["bootnode"]

  # Service account scopes to enable logging to GCP
  service_account {
    email  = local.service_account_email
    scopes = ["https://www.googleapis.com/auth/logging.write", "https://www.googleapis.com/auth/monitoring.write"]
  }
}


