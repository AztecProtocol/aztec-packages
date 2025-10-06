terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "terraform/state"
  }
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.16.1"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.24.0"
    }
  }
}

# Configure the Google Cloud provider
provider "google" {
  project = var.project
  region  = var.region
}

data "terraform_remote_state" "ssl" {
  backend = "gcs"
  config = {
    bucket = "aztec-terraform"
    prefix = "ssl/terraform.tfstate"
  }
}

resource "google_compute_address" "grafana_ip" {
  provider     = google
  name         = "grafana-ip"
  address_type = "EXTERNAL"
  region       = var.region

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_address" "otel_collector_ip" {
  provider     = google
  name         = "otel-ip"
  address_type = "EXTERNAL"
  region       = var.region

  lifecycle {
    prevent_destroy = true
  }
}

provider "kubernetes" {
  alias          = "gke-cluster"
  config_path    = "~/.kube/config"
  config_context = var.GKE_CLUSTER_CONTEXT
}

provider "helm" {
  alias = "gke-cluster"
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = var.GKE_CLUSTER_CONTEXT
  }
}

data "google_secret_manager_secret_version" "grafana_password" {
  secret  = var.GRAFANA_PASSWORD_SECRET_NAME
  project = var.project
}

data "google_secret_manager_secret_version" "slack_webhook" {
  secret  = var.SLACK_WEBHOOK_SECRET_NAME
  project = var.project
}

data "google_secret_manager_secret_version" "slack_webhook_staging_public" {
  secret  = var.SLACK_WEBHOOK_STAGING_PUBLIC_SECRET_NAME
  project = var.project
}

data "google_secret_manager_secret_version" "slack_webhook_staging_ignition" {
  secret  = var.SLACK_WEBHOOK_STAGING_IGNITION_SECRET_NAME
  project = var.project
}

data "google_secret_manager_secret_version" "slack_webhook_next_scenario" {
  secret  = var.SLACK_WEBHOOK_NEXT_SCENARIO_SECRET_NAME
  project = var.project
}

data "google_secret_manager_secret_version" "slack_webhook_testnet" {
  secret  = var.SLACK_WEBHOOK_TESTNET_SECRET_NAME
  project = var.project
}

data "google_secret_manager_secret_version" "slack_webhook_mainnet" {
  secret  = var.SLACK_WEBHOOK_MAINNET_SECRET_NAME
  project = var.project
}

# Aztec Helm release for gke-cluster
resource "helm_release" "aztec-gke-cluster" {
  provider          = helm.gke-cluster
  name              = var.RELEASE_NAME
  repository        = "../../"
  chart             = "metrics"
  namespace         = var.RELEASE_NAME
  create_namespace  = true
  upgrade_install   = true
  dependency_update = true
  force_update      = true
  reuse_values      = true

  # base values file
  values = [
    file("../../metrics/values.yaml"),
    file("../../metrics/values/${var.VALUES_FILE}"),
    yamlencode({
      grafana = {
        service = {
          annotations = {
            "cloud.google.com/neg" = jsonencode({ ingress = true })
          }
        }
        ingress = {
          enabled = true
          hosts   = [data.terraform_remote_state.ssl.outputs.grafana_host]
          annotations = {
            "kubernetes.io/ingress.class"                 = "gce"
            "kubernetes.io/ingress.allow-http"            = "false"
            "kubernetes.io/ingress.global-static-ip-name" = data.terraform_remote_state.ssl.outputs.grafana_ip_name
            "ingress.gcp.kubernetes.io/pre-shared-cert"   = data.terraform_remote_state.ssl.outputs.grafana_cert_name
          }
        }
      }
    })
  ]

  set {
    name  = "grafana.service.loadBalancerIP"
    value = google_compute_address.grafana_ip.address
  }

  set {
    name  = "grafana.grafana\\.ini.server.root_url"
    value = "https://${data.terraform_remote_state.ssl.outputs.grafana_host}"
  }

  set {
    name  = "grafana.adminPassword"
    value = data.google_secret_manager_secret_version.grafana_password.secret_data
  }

  set {
    name  = "grafana.env.SLACK_WEBHOOK_URL"
    value = data.google_secret_manager_secret_version.slack_webhook.secret_data
  }

  set {
    name  = "grafana.env.SLACK_WEBHOOK_STAGING_PUBLIC_URL"
    value = data.google_secret_manager_secret_version.slack_webhook_staging_public.secret_data
  }

  set {
    name  = "grafana.env.SLACK_WEBHOOK_STAGING_IGNITION_URL"
    value = data.google_secret_manager_secret_version.slack_webhook_staging_ignition.secret_data
  }

  set {
    name  = "grafana.env.SLACK_WEBHOOK_NEXT_SCENARIO_URL"
    value = data.google_secret_manager_secret_version.slack_webhook_next_scenario.secret_data
  }

  set {
    name  = "grafana.env.SLACK_WEBHOOK_TESTNET_URL"
    value = data.google_secret_manager_secret_version.slack_webhook_testnet.secret_data
  }

  set {
    name  = "grafana.env.SLACK_WEBHOOK_MAINNET_URL"
    value = data.google_secret_manager_secret_version.slack_webhook_mainnet.secret_data
  }

  set {
    name  = "opentelemetry-collector.service.loadBalancerIP"
    value = google_compute_address.otel_collector_ip.address
  }

  set {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[0].job_name"
    value = "prometheus"
  }

  set {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[0].static_configs[0].targets[0]"
    value = "127.0.0.1:9090"
  }

  set {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[1].job_name"
    value = "otel-collector"
  }

  set {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[1].static_configs[0].targets[0]"
    value = "${google_compute_address.otel_collector_ip.address}:8888"
  }

  set {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[2].job_name"
    value = "aztec"
  }

  set {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[2].static_configs[0].targets[0]"
    value = "${google_compute_address.otel_collector_ip.address}:8889"
  }
  # Setting timeout and wait conditions
  timeout       = 600 # 10 minutes in seconds
  wait          = true
  wait_for_jobs = true

}
