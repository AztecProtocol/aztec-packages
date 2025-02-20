variable "ssh_user" {
  description = "The username for SSH access"
  type        = string
}

variable "ssh_secret_name" {
  description = "Name of the Google Secret Manager secret for the ssh private key"
  type        = string
}

variable "project_id" {
  description = "The project ID"
  type        = string
  default     = "testnet-440309"
}

variable "sa_account_id" {
  description = "The service account ID"
  type        = string
}
