variable "eks_cluster_context" {
  description = "EKS cluster context"
  type        = string
  default     = "arn:aws:eks:us-east-1:278380418400:cluster/spartan"
}

variable "gke_cluster_context" {
  description = "GKE cluster context"
  type        = string
  default     = "gke_testnet-440309_us-east1_spartan-provers"
}

variable "testnet_name" {
  description = "Name of helm deployment and k8s namespace"
  type        = string
  default     = "terratest"
}

variable "eks-values-file" {
  description = "Name of the values file to use for eks cluster"
  type        = string
  default     = "1-validator-0-prover.yaml"
}

variable "gke-values-file" {
  description = "Name of the values file to use for gke cluster"
  type        = string
  default     = "0-validator-1-prover.yaml"
}
