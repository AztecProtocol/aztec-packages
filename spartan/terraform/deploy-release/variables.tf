variable "gke_cluster_context" {
  description = "GKE cluster context"
  type        = string
  default     = "gke_testnet-440309_us-east4-a_spartan-gke"
}

variable "release_name" {
  description = "Name of helm deployment and k8s namespace"
  type        = string
}

variable "values_file" {
  description = "Name of the values file to use for deployment"
  type        = string
}

variable "aztec_docker_image" {
  description = "Docker image to use for the aztec network"
  type        = string
}
