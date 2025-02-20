locals {
  chain_id = "ignition"
}

terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "bootnodes/ignition-testnet"
  }
}
provider "google" {
  project = var.project_id
  region  = "us-west1"
}

data "google_secret_manager_secret_version" "peer_private_keys" {
  secret = "ignition-peer-private-keys"
}

locals {
  json_data = jsondecode(data.google_secret_manager_secret_version.peer_private_keys.secret_data)
}

data "terraform_remote_state" "common" {
  backend = "gcs"

  config = {
    bucket = "aztec-terraform"
    prefix = "bootnode/common"
  }
}

module "vm_instances" {
  source                = "./../vm"
  for_each              = toset(var.regions)
  region                = each.key
  ssh_user              = data.terraform_remote_state.common.outputs.ssh_key_outputs.ssh_user
  public_key            = data.terraform_remote_state.common.outputs.ssh_key_outputs.public_key
  private_key           = "" # Stored in Secret Manager
  peer_id_private_key   = local.json_data[each.key]
  start_script          = "../../../scripts/init_bootnode.sh.tpl"
  chain_id              = local.chain_id
  service_account_email = data.terraform_remote_state.common.outputs.sa_outputs.service_account_email
}

module "firewall" {
  source        = "./../firewall"
  p2p_tcp_ports = var.p2p_tcp_ports
  p2p_udp_ports = var.p2p_udp_ports
  chain_id      = local.chain_id
}


