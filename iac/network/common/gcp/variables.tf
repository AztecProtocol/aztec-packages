variable "project_id" {
  description = "The project ID"
  type        = string
}

variable "sa_account_id" {
  description = "The service account ID"
  type        = string
}

variable "p2p_ports" {
  description = "List of allowed P2P ports"
  type        = list(string)
}
