variable "R2_API_TOKEN" {
  type = string
}

variable "R2_ACCOUNT_ID" {
  type = string
}

variable "DOMAIN" {
  type    = string
  default = "aztec-labs.com"
}

variable "SUBDOMAIN" {
  type    = string
  default = "aztec-testnet"
}

variable "BUCKET_NAME" {
  type    = string
  default = "testnet-bucket"
}
