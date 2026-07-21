terraform {
  backend "gcs" {
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

provider "kubernetes" {
  config_path    = "~/.kube/config"
  config_context = var.GKE_CLUSTER_CONTEXT
}

provider "helm" {
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = var.GKE_CLUSTER_CONTEXT
  }
}

data "terraform_remote_state" "gke_cluster" {
  backend = "gcs"
  config = {
    bucket = "aztec-terraform"
    prefix = "terraform/state/gke-cluster"
  }
}

resource "helm_release" "external_secrets" {
  name             = "external-secrets"
  chart            = "${path.module}/external-secrets-2.2.0.tgz"
  namespace        = "external-secrets"
  create_namespace = true
  upgrade_install  = true

  set {
    name  = "serviceAccount.annotations.iam\\.gke\\.io/gcp-service-account"
    value = data.terraform_remote_state.gke_cluster.outputs.eso_service_account_email
  }

  set {
    name  = "nodeSelector.node-type"
    value = "infra"
  }

  set {
    name  = "webhook.nodeSelector.node-type"
    value = "infra"
  }

  set {
    name  = "certController.nodeSelector.node-type"
    value = "infra"
  }

  timeout = 300
  wait    = true
}

# NOTE: this will fail the very first time because it needs the custom resource defined by the helm release above.
# Either use -target=helm_release.external_secrets or comment out this manifest to very first time this tf is applied to a cluster
resource "kubernetes_manifest" "cluster_secret_store" {
  manifest = {
    apiVersion = "external-secrets.io/v1"
    kind       = "ClusterSecretStore"
    metadata = {
      name = "gcp-secret-store"
    }
    spec = {
      provider = {
        gcpsm = {
          projectID = var.project
          auth = {
            workloadIdentity = {
              serviceAccountRef = {
                name      = "external-secrets"
                namespace = "external-secrets"
              }
            }
          }
        }
      }
    }
  }

  depends_on = [helm_release.external_secrets]
}
