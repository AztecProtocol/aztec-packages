variable "regions" {
  description = "Regions for the VM instances"
  type        = list(string)
}

variable "start_script" {
  description = "Path to a template file to run on startup"
  type        = string
}

variable "network_name" {
  description = "A network identifier"
  type        = string
}

variable "peer_id_private_keys" {
  description = "The peer id private key of the boot node"
  type        = list(string)
}

variable "machine_type" {
  description = "The machine type for the VM instance"
  type        = string
}

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "p2p_port" {
  description = "The P2P port"
  type        = number
}

variable "l1_chain_id" {
  description = "The L1 chain ID"
  type        = number
}

variable "image_tag" {
  description = "The Aztec image tag to deploy"
  type        = string
}
