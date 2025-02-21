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

variable "enrs" {
  description = "The ENRS of all the bootnodes"
  type        = string
}

variable "machine_type" {
  description = "The machine type for the VM instance"
  type        = string
}

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}
