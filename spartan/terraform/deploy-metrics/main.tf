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

locals {
  metrics_chart_path = "${path.module}/../../metrics"
  metrics_chart_trigger_files = sort(concat(
    tolist(fileset(local.metrics_chart_path, "Chart.yaml")),
    tolist(fileset(local.metrics_chart_path, "Chart.lock")),
    tolist(fileset(local.metrics_chart_path, "templates/**")),
    tolist(fileset(local.metrics_chart_path, "grafana/**")),
  ))
  metrics_chart_content_hash = sha256(join("", [
    for file in local.metrics_chart_trigger_files : "${file}:${filesha256("${local.metrics_chart_path}/${file}")}"
  ]))
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
  reuse_values      = false

  # base values file
  values = [
    file("../../metrics/values.yaml"),
    file("../../metrics/values/${var.VALUES_FILE}"),
    yamlencode({
      aztecMetricsChart = {
        contentHash = local.metrics_chart_content_hash
      }
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
        podAnnotations = {
          "aztec.network/metrics-chart-content-hash" = local.metrics_chart_content_hash
        }
        admin = {
          existingSecret = "grafana-admin"
          passwordKey    = "admin-password"
        }

        env = {
          # we have to set an admin username through env vars otherwise the chart expects to find an 'admin-user' key in the admin secret
          GF_SECURITY_ADMIN_USER       = "admin"
          SLACK_ALERT_MENTION_USER_IDS = join(",", var.SLACK_ALERT_MENTION_USER_IDS)
        }

        sidecar = {
          alerts = {
            env = {
              REQ_USERNAME = "admin"
            }
          }
          dashboards = {
            env = {
              REQ_USERNAME = "admin"
            }
          }
        }

        envFromSecrets = [
          {
            name     = "grafana-webhooks"
            optional = false
          }
        ]

        extraObjects = [
          {
            apiVersion = "external-secrets.io/v1"
            kind       = "ExternalSecret"
            metadata = {
              name = "grafana-admin"
            }
            spec = {
              refreshInterval = "1m"
              secretStoreRef = {
                name = "gcp-secret-store"
                kind = "ClusterSecretStore"
              }
              data = [
                { secretKey = "admin-password", remoteRef = { key = var.GRAFANA_PASSWORD_SECRET_NAME } },
              ]
            }
          },
          {
            apiVersion = "external-secrets.io/v1"
            kind       = "ExternalSecret"
            metadata = {
              name = "grafana-webhooks"
            }
            spec = {
              secretStoreRef = {
                name = "gcp-secret-store"
                kind = "ClusterSecretStore"
              }
              data = [
                { secretKey = "SLACK_WEBHOOK_URL", remoteRef = { key = var.SLACK_WEBHOOK_SECRET_NAME } },
                { secretKey = "SLACK_WEBHOOK_STAGING_PUBLIC_URL", remoteRef = { key = var.SLACK_WEBHOOK_STAGING_PUBLIC_SECRET_NAME } },
                { secretKey = "SLACK_WEBHOOK_NEXT_SCENARIO_URL", remoteRef = { key = var.SLACK_WEBHOOK_NEXT_SCENARIO_SECRET_NAME } },
                { secretKey = "SLACK_WEBHOOK_NEXT_NET_URL", remoteRef = { key = var.SLACK_WEBHOOK_NEXT_NET_SECRET_NAME } },
                { secretKey = "SLACK_WEBHOOK_DEVNET_URL", remoteRef = { key = var.SLACK_WEBHOOK_DEVNET_SECRET_NAME } },
                { secretKey = "SLACK_WEBHOOK_TESTNET_URL", remoteRef = { key = var.SLACK_WEBHOOK_TESTNET_SECRET_NAME } },
                { secretKey = "SLACK_WEBHOOK_MAINNET_URL", remoteRef = { key = var.SLACK_WEBHOOK_MAINNET_SECRET_NAME } },
              ]
            }
          }
        ]
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
