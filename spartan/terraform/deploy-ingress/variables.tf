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
  description = "The network to add the ingress to"
  type        = string
  default     = "staging-rc-1"
}

variable "NAMESPACE" {
  description = "The k8s namespace where the network was deployed to"
  type        = string
  default     = "staging-rc-1"
}

variable "SERVICE" {
  description = "The service name"
  type        = string
  default     = "staging-rc-1-aztec-network-full-node"
}

variable "HOSTNAME" {
  description = "The public hostname for the ingress"
  type        = string
  default     = "staging.alpha-testnet.aztec.network"
}
