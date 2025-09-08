
terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
  }
}

data "terraform_remote_state" "ssh" {
  backend = "gcs"

  config = {
    bucket = "aztec-terraform"
    prefix = "network/ssh"
  }
}

data "terraform_remote_state" "common" {
  backend = "gcs"

  config = {
    bucket = "aztec-terraform"
    prefix = "network/common/gcp"
  }
}

data "terraform_remote_state" "ip" {
  backend = "gcs"

  config = {
    bucket = "aztec-terraform"
    prefix = "network/${var.network_name}/bootnode/ip/gcp"
  }
}

data "terraform_remote_state" "metrics" {
  backend = "gcs"
  config = {
    bucket = "aztec-terraform"
    prefix = "metrics-deploy/us-west1-a/aztec-gke-private/metrics/terraform.tfstate"
  }
}

locals {
  ssh_user              = data.terraform_remote_state.ssh.outputs.ssh_user
  public_key            = data.terraform_remote_state.ssh.outputs.public_key
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
      PUBLIC_IP              = data.terraform_remote_state.ip.outputs.ip_addresses[var.regions[count.index]],
      PEER_ID_PRIVATE_KEY    = var.peer_id_private_keys[count.index],
      LOCATION               = "GCP",
      REGION                 = var.regions[count.index],
      DATA_STORE_MAP_SIZE_KB = 16777216,
      P2P_PORT               = var.p2p_port,
      SSH_USER               = local.ssh_user,
      L1_CHAIN_ID            = var.l1_chain_id,
      NETWORK_NAME           = var.network_name
      TAG                    = var.image_tag
      OTEL_COLLECTOR_URL     = "http://${data.terraform_remote_state.metrics.outputs.otel_collector_ip}:4318"
    })
    # Trigger resource recreation if the startup script changes
    startup-script-hash = filemd5(var.start_script)
  }

  tags = ["bootnode"]

  # Service account scopes to enable logging to GCP
  service_account {
    email  = local.service_account_email
    scopes = ["https://www.googleapis.com/auth/logging.write", "https://www.googleapis.com/auth/monitoring.write"]
  }

  lifecycle {
    create_before_destroy = true
  }
}


