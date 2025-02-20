variable "project_id" {
  description = "The project ID"
  type        = string
  default     = "testnet-440309"
}

variable "ssh_user" {
  description = "Username to use for SSH access"
  type        = string
  default     = "aztec"
}

variable "ssh_key_secret_name" {
  description = "The name to assign to the ssh key secret in secrets manager"
  type        = string
  default     = "bootnode-ssh-key"
}