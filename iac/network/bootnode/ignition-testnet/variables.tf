variable "regions" {
  description = "List of GCP regions to create VM instances in."
  type        = list(string)
  default     = ["us-central1"]
}

variable "project_id" {
  description = "The project ID"
  type        = string
  default     = "testnet-440309"
}

variable "p2p_tcp_ports" {
  description = "List of allowed P2P TCP ports"
  type        = list(string)
  default     = ["40400"]
}

variable "p2p_udp_ports" {
  description = "List of allowed P2P UDP ports"
  type        = list(string)
  default     = ["40400"]
}
