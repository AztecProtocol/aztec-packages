variable "tcp_ports" {
  description = "List of allowed TCP ports"
  type        = list(string)
}

variable "udp_ports" {
  description = "List of allowed UDP ports"
  type        = list(string)
}
