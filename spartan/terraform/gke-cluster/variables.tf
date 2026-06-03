variable "project" {
  default = "testnet-440309"
}

variable "region" {
  default = "us-west1"
}

variable "zone" {
  default = "us-west1-a"
}

variable "docker_registry_repository_id" {
  description = "Artifact Registry Docker repository ID for Spartan images."
  type        = string
  default     = "aztec"
}

variable "ci_service_account_id" {
  description = "Service account ID for CI jobs that push images to the Docker registry."
  type        = string
  default     = "aztec-ci"
}
