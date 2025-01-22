variable "grafana_url" {
  type = string
}

variable "grafana_auth" {
  type      = string
  sensitive = true
}

variable "slack_url" {
  type      = string
  sensitive = true
}
