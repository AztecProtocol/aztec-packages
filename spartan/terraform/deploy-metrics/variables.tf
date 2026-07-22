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

variable "PROPOSE_WATCHER_GRAFANA_DATASOURCE_SECRET_NAME" {
  description = "GCP Secret Manager JSON secret containing the propose-watcher Grafana datasource connection values"
  type        = string
  default     = "propose-watcher-grafana-datasource"
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

variable "SLACK_WEBHOOK_NEXT_SCENARIO_SECRET_NAME" {
  description = "Webhook for next-scenario alerts"
  type        = string
  default     = "slack-webhook-next-scenario-url"
}

variable "SLACK_WEBHOOK_NEXT_NET_SECRET_NAME" {
  description = "Webhook for next-net alerts"
  type        = string
  default     = "slack-webhook-next-net-url"
}

variable "SLACK_WEBHOOK_DEVNET_SECRET_NAME" {
  description = "Webhook for devnet alerts"
  type        = string
  default     = "slack-webhook-devnet-url"
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

variable "SLACK_ALERT_MENTION_USER_IDS" {
  description = "Optional Slack user IDs to mention on Grafana alert notifications."
  type        = list(string)
  default     = ["U0AHB6VR8N5"]
}

variable "project" {
  default = "testnet-440309"
  type    = string
}

variable "region" {
  default = "us-west1"
  type    = string
}
