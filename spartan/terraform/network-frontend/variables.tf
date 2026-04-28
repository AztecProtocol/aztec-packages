variable "project" {
  default = "testnet-440309"
}

variable "region" {
  default = "us-west1"
}

variable "NAMESPACE" {
  description = "Deployment namespace."
  type        = string
}

variable "RPC_HOSTNAMES" {
  description = "Fully-qualified hostnames served by this RPC ingress. All are covered by a single multi-domain managed cert; when CREATE_DNS=true each gets an A record in DNS_ZONE_NAME."
  type        = list(string)

  validation {
    condition     = length(var.RPC_HOSTNAMES) > 0
    error_message = "At least one hostname is required."
  }
}

variable "CREATE_DNS" {
  description = "Whether to create A records in DNS_ZONE_NAME pointing at the static IP."
  type        = bool
  default     = false
}

variable "DNS_ZONE_NAME" {
  description = "Cloud DNS managed zone name (only used when CREATE_DNS=true)."
  type        = string
  default     = ""
}
