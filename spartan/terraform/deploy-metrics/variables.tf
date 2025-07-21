variable "GKE_CLUSTER_CONTEXT" {
  description = "GKE cluster context"
  type        = string
  default     = "gke_testnet-440309_us-west1-a_aztec-gke-private"
}

variable "RELEASE_NAME" {
  description = "Name of helm deployment and k8s namespace"
  type        = string
  default     = "metrics"
}

variable "VALUES_FILE" {
  description = "Name of the values file to use for deployment"
  type        = string
  default     = "prod.yaml"
}

variable "GRAFANA_PASSWORD_SECRET_NAME" {
  description = "Grafana dashboard password"
  type        = string
  default     = "grafana-dashboard-password"
}

variable "SLACK_WEBHOOK_SECRET_NAME" {
  description = "Webhook to use to send to notifications"
  type        = string
  default     = "slack-webhook-url"
}

variable "project" {
  default = "testnet-440309"
  type    = string
}

variable "region" {
  default = "us-west1"
  type    = string
}
