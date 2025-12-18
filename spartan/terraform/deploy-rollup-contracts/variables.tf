variable "registry_address" {
  description = "Registry contract address"
  type        = string
  default     = ""
}

variable "slash_factory_address" {
  description = "Slash factory contract address"
  type        = string
  default     = ""
}

variable "fee_asset_handler_address" {
  description = "Fee asset handler contract address"
  type        = string
  default     = ""
}

variable "rollup_address" {
  description = "Rollup contract address"
  type        = string
  default     = ""
}

variable "deployed_at" {
  description = "Timestamp when contracts were deployed"
  type        = string
  default     = ""
}
