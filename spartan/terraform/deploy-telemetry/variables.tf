variable "cluster" {
  description = "GKE cluster context"
  type        = string
  default     = "gke_testnet-440309_us-west1-a_aztec-gke-private"
}

variable "project" {
  default = "testnet-440309"
  type    = string
}

variable "region" {
  default = "us-west1"
  type    = string
}

variable "RELEASE_NAME" {
  description = "Name of helm deployment and k8s namespace"
  type        = string
  default     = "public-telemetry"
}

variable "HOSTNAME" {
  description = "The public hostname for the ingress"
  type        = string
  default     = "telemetry.alpha-testnet.aztec.network"
}
