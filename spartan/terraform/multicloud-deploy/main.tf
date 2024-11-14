terraform {
  backend "s3" {
    bucket = "aztec-terraform"
    key    = "multicloud-deploy/terraform.tfstate"
    region = "eu-west-2"
  }
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12.1"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.24.0"
    }
  }
}

# Define providers for different contexts
provider "kubernetes" {
  alias          = "eks-cluster"
  config_path    = "~/.kube/config"
  config_context = var.eks_cluster_context
}

provider "kubernetes" {
  alias          = "gke-cluster"
  config_path    = "~/.kube/config"
  config_context = var.gke_cluster_context
}

# Helm providers for each cluster
provider "helm" {
  alias = "eks-cluster"
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = var.eks_cluster_context
  }
}

provider "helm" {
  alias = "gke-cluster"
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = var.gke_cluster_context
  }
}

# Aztec Helm release for eks-cluster
resource "helm_release" "aztec-eks-cluster" {
  provider         = helm.eks-cluster
  name             = var.testnet_name
  repository       = "../../"
  chart            = "aztec-network"
  namespace        = var.testnet_name
  create_namespace = true

  # base values file
  values = [file("../../aztec-network/values/${var.values-file}")]

  # removing prover nodes
  set {
    name  = "network.public"
    value = true
  }

  set {
    name  = "proverNode.replicas"
    value = "0"
  }

  set {
    name  = "proverAgent.replicas"
    value = "0"
  }

  # Setting timeout and wait conditions
  timeout       = 600 # 10 minutes in seconds
  wait          = true
  wait_for_jobs = true
}

# Aztec Helm release for gke-cluster
resource "helm_release" "aztec-gke-cluster" {
  provider         = helm.gke-cluster
  name             = var.testnet_name
  repository       = "../../"
  chart            = "aztec-network"
  namespace        = var.testnet_name
  create_namespace = true

  # base values file
  values = [file("../../aztec-network/values/${var.values-file}")]

  # disabling all nodes except provers
  set {
    name  = "network.setupL2Contracts"
    value = false
  }

  set {
    name  = "proverNode.public"
    value = true
  }

  set {
    name  = "bootNode.replicas"
    value = "0"
  }

  set {
    name  = "validator.replicas"
    value = "0"
  }

  set {
    name  = "pxe.replicas"
    value = "0"
  }

  set {
    name  = "bot.replicas"
    value = "0"
  }

  set {
    name  = "ethereum.replicas"
    value = "0"
  }

  # pointing Google Cloud provers to nodes in AWS
  set {
    name  = "ethereum.externalHost"
    value = data.kubernetes_service.lb_ethereum_tcp.status.0.load_balancer.0.ingress.0.hostname
  }

  set {
    name  = "bootNode.externalTcpHost"
    value = data.kubernetes_service.lb_boot_node_tcp.status.0.load_balancer.0.ingress.0.hostname
  }

  set {
    name  = "bootNode.externalUdpHost"
    value = data.kubernetes_service.lb_boot_node_udp.status.0.load_balancer.0.ingress.0.hostname
  }

  set {
    name  = "validator.externalTcpHost"
    value = data.kubernetes_service.lb_validator_tcp.status.0.load_balancer.0.ingress.0.hostname
  }

  set {
    name  = "validator.externalUdpHost"
    value = data.kubernetes_service.lb_validator_udp.status.0.load_balancer.0.ingress.0.hostname
  }

  set {
    name  = "pxe.externalHost"
    value = data.kubernetes_service.lb_pxe_tcp.status.0.load_balancer.0.ingress.0.hostname
  }

  # Setting timeout and wait conditions
  timeout       = 600 # 10 minutes in seconds
  wait          = true
  wait_for_jobs = true

  depends_on = [
    helm_release.aztec-eks-cluster
  ]
}
