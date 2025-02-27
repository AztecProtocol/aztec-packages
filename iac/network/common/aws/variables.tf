variable "sa_account_id" {
  description = "The service account ID"
  type        = string
}

variable "p2p_tcp_ports" {
  description = "List of allowed P2P TCP ports"
  type        = list(string)
}

variable "p2p_udp_ports" {
  description = "List of allowed P2P UDP ports"
  type        = list(string)
}

variable "regions" {
  description = "Regions for the VM instances"
  type        = list(string)
}
