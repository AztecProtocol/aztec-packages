variable "regions" {
  description = "List of GCP regions to create VM instances in."
  type        = list(string)
  default     = ["us-central1", "europe-west1", "asia-east1"]
}

variable "udp_ports" {
  description = "List of UDP ports to allow."
  type        = list(string)
  default     = ["53"] # Example: Allow DNS traffic
}

variable "outbound_tcp_ports" {
  description = "List of TCP ports to allow for outbound traffic."
  type        = list(string)
  default     = ["80", "443"] # Example: HTTP and HTTPS
}

variable "outbound_udp_ports" {
  description = "List of UDP ports to allow for outbound traffic."
  type        = list(string)
  default     = [] # No specific outbound UDP ports by default
}

variable "project_id" {
  description = "The project ID"
  type        = string

}
