variable "regions" {
  description = "Regions for the IP addresses"
  type        = list(string)
}

variable "name" {
  description = "Name (or scope) for the IP addresses"
  type        = string
}

variable "project_id" {
  description = "The project ID"
  type        = string
  default     = "testnet-440309"
}
