variable "region" {
  description = "Region for the VM instance"
  type        = string
}

variable "ssh_user" {
  description = "The username for SSH access"
  type        = string
}

variable "public_key" {
  description = "Public SSH key for access"
  type        = string
}

variable "private_key" {
  description = "Private SSH key for remote provisioning"
  type        = string
}

variable "start_script" {
  description = "Path to a template file to run on startup"
  type        = string
}

variable "chain_id" {
  description = "A chain identifier"
  type        = string
}

variable "service_account_email" {
  description = "The email of a service account for the VM"
  type        = string
}

variable "peer_id_private_key" {
  description = "The peer id private key of the boot node"
  type        = string
}
