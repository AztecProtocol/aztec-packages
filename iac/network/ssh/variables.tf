variable "ssh_user" {
  description = "The username for SSH access"
  type        = string
}

variable "ssh_secret_name" {
  description = "Name of the Google Secret Manager secret"
  type        = string
}

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}
