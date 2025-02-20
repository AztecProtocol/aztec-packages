variable "ssh_user" {
  description = "The username for SSH access"
  type        = string
}

variable "secret_name" {
  description = "Name of the Google Secret Manager secret"
  type        = string
}
