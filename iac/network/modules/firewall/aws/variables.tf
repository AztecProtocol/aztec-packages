variable "p2p_tcp_ports" {
  description = "List of allowed P2P TCP ports"
  type        = list(string)
}

variable "p2p_udp_ports" {
  description = "List of allowed P2P UDP ports"
  type        = list(string)
}

variable "vpc_ids" {
  type        = map(string)
  description = "Mapping of regions to VPC IDs"
}
