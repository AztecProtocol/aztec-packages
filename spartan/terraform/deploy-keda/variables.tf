variable "GKE_CLUSTER_CONTEXT" {
  description = "GKE cluster context"
  type        = string
  default     = "gke_testnet-440309_us-west1-a_aztec-gke-private"
}

variable "RELEASE_NAME" {
  description = "Helm release name for KEDA"
  type        = string
  default     = "keda"
}

variable "KEDA_NAMESPACE" {
  description = "Namespace to install KEDA into"
  type        = string
  default     = "keda"
}

