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
  default = "1.33.10-gke.1067000"
}

variable "enable_workload_identity" {
  description = "Enable Workload Identity on the cluster"
  type        = bool
  default     = false
}


variable "infra_8core_pool_size" {
  description = "how many 8 core nodes to schedule for this cluster"
  type = object({
    min = number
    max = number
  })
  default = {
    min = 0
    max = 4
  }
}

variable "infra_16core_pool_size" {
  description = "how many 16 core nodes to schedule for this cluster"
  type = object({
    min = number
    max = number
  })
  default = {
    min = 0
    max = 4
  }
}
