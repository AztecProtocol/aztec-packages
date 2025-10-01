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

variable "SLACK_WEBHOOK_STAGING_PUBLIC_SECRET_NAME" {
  description = "Webhook for staging-public alerts"
  type        = string
  default     = "slack-webhook-staging-public-url"
}

variable "SLACK_WEBHOOK_STAGING_IGNITION_SECRET_NAME" {
  description = "Webhook for staging-ignition alerts"
  type        = string
  default     = "slack-webhook-staging-ignition-url"
}

variable "SLACK_WEBHOOK_NEXT_SCENARIO_SECRET_NAME" {
  description = "Webhook for next-scenario alerts"
  type        = string
  default     = "slack-webhook-next-scenario-url"
}

variable "SLACK_WEBHOOK_TESTNET_SECRET_NAME" {
  description = "Webhook for testnet alerts"
  type        = string
  default     = "slack-webhook-testnet-url"
}

variable "SLACK_WEBHOOK_MAINNET_SECRET_NAME" {
  description = "Webhook for mainnet alerts"
  type        = string
  default     = "slack-webhook-mainnet-url"
}

variable "project" {
  default = "testnet-440309"
  type    = string
}

variable "region" {
  default = "us-west1"
  type    = string
}
