variable "R2_API_TOKEN" {
  type = string
}

variable "R2_ACCOUNT_ID" {
  type = string
}

variable "DOMAIN" {
  type    = string
  default = "aztec-labs-snapshots.com"
}

variable "SUBDOMAIN" {
  type    = string
  default = "aztec-testnet"
}

variable "BUCKET_NAME" {
  type    = string
  default = "testnet-bucket"
}

variable "R2_ZONE_ID" {
  type = string
}

variable "BLOB_RETENTION_DAYS" {
  type        = number
  default     = 7
  description = "Number of days to retain objects blobs"
}

variable "SNAPSHOT_RETENTION_DAYS" {
  type        = number
  default     = 7
  description = "Number of days to retain snapshots"
}
