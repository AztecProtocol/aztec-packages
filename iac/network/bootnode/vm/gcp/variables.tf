variable "region" {
  description = "Region for the VM instance"
  type        = string
}

variable "start_script" {
  description = "Path to a template file to run on startup"
  type        = string
}

variable "network_name" {
  description = "A network identifier"
  type        = string
}

variable "peer_id_private_key" {
  description = "The peer id private key of the boot node"
  type        = string
}

variable "enr" {
  description = "The ENR of the boot node"
  type        = string
}

variable "machine_type" {
  description = "The machine type for the VM instance"
  type        = string
}
