variable "eks_cluster_context" {
  description = "EKS cluster context"
  type        = string
  default     = "arn:aws:eks:us-east-1:278380418400:cluster/spartan"
}

variable "gke_cluster_context" {
  description = "GKE cluster context"
  type        = string
  default     = "gke_testnet-440309_us-east4-a_spartan-gke"
}

variable "testnet_name" {
  description = "Name of helm deployment and k8s namespace"
  type        = string
  default     = "multicloud"
}

variable "values-file" {
  description = "Name of the values file to use for deployment"
  type        = string
  default     = "16-validators.yaml"
}

variable "image" {
  description = "Aztec node image"
  type        = string
  default     = "aztecprotocol/aztec:master"
}

variable "telemetry" {
  description = "Toogle telemetry on/off"
  type        = bool
  default     = false
}
