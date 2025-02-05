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
