variable "project" {
  description = "GCP project ID"
  type        = string
  default     = "testnet-440309"
}

variable "GKE_CLUSTER_CONTEXT" {
  description = "GKE cluster context"
  type        = string
  default     = "gke_testnet-440309_us-west1-a_aztec-gke-private"
}
