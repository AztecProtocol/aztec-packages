variable "project" {
  default = "testnet-440309"
}

variable "region" {
  default = "us-west1"
}

variable "zone" {
  default = "us-west1-a"
}

variable "cluster_name" {
}

variable "service_account" {

}

variable "node_version" {
  default = "1.30.5-gke.1713000"
}

variable "enable_workload_identity" {
  description = "Enable Workload Identity on the cluster"
  type        = bool
  default     = false
}

