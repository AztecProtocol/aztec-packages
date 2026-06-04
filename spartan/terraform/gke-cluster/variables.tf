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

variable "npm_registry_repository_id" {
  description = "Artifact Registry npm repository ID for internal Aztec packages."
  type        = string
  default     = "aztec-npm"
}

variable "ci_service_account_id" {
  description = "Service account ID for CI jobs that publish internal artifacts."
  type        = string
  default     = "aztec-ci"
}

variable "npm_registry_reader_service_account_id" {
  description = "Service account ID for CI jobs that install internal npm packages."
  type        = string
  default     = "aztec-npm-reader"
}
