terraform {
  required_providers {
    helm = {
      source = "hashicorp/helm"
    }
    kubernetes = {
      source = "hashicorp/kubernetes"
    }
    random = {
      source = "hashicorp/random"
    }
  }
}

resource "random_bytes" "jwt" {
  length = 32
}

locals {
  eth_panda_ops_repo = var.ETHEREUM_HELM_REPOSITORY

  reth_image_parts      = split(":", var.RETH_IMAGE)
  reth_image_repository = join(":", slice(local.reth_image_parts, 0, length(local.reth_image_parts) - 1))
  reth_image_tag        = local.reth_image_parts[length(local.reth_image_parts) - 1]

  lighthouse_image_parts      = split(":", var.LIGHTHOUSE_IMAGE)
  lighthouse_image_repository = join(":", slice(local.lighthouse_image_parts, 0, length(local.lighthouse_image_parts) - 1))
  lighthouse_image_tag        = local.lighthouse_image_parts[length(local.lighthouse_image_parts) - 1]

  reth_release_name       = "${var.RELEASE_PREFIX}-reth"
  lighthouse_release_name = "${var.RELEASE_PREFIX}-lighthouse"
  reth_pvc_name           = "storage-${local.reth_release_name}-0"
  lighthouse_pvc_name     = "storage-${local.lighthouse_release_name}-0"

  common_values = {
    replicas     = 1
    jwt          = nonsensitive(random_bytes.jwt.hex)
    nodeSelector = var.NODE_SELECTOR
  }

  reth_values = merge(local.common_values, {
    fullnameOverride = local.reth_release_name
    image = {
      pullPolicy = var.IMAGE_PULL_POLICY
      repository = local.reth_image_repository
      tag        = local.reth_image_tag
    }
    resources = var.RETH_RESOURCES
    p2pNodePort = {
      enabled = true
      port    = var.RETH_P2P_PORT
    }
    extraArgs = concat([
      "--chain=${var.CHAIN}",
    ], var.RETH_EXTRA_ARGS)
    persistence = {
      enabled       = true
      existingClaim = kubernetes_persistent_volume_claim_v1.reth_storage.metadata[0].name
    }
    fileLogging = {
      enabled = var.RETH_FILE_LOGGING_ENABLED
    }
    service = {
      type                  = "ClusterIP"
      internalTrafficPolicy = var.INTERNAL_TRAFFIC_POLICY
    }
  })

  lighthouse_values = merge(local.common_values, {
    fullnameOverride = local.lighthouse_release_name
    image = {
      pullPolicy = var.IMAGE_PULL_POLICY
      repository = local.lighthouse_image_repository
      tag        = local.lighthouse_image_tag
    }
    resources = var.LIGHTHOUSE_RESOURCES
    checkpointSync = {
      enabled = true
      url     = var.CHECKPOINT_SYNC_URL
    }
    p2pNodePort = {
      enabled = true
      port    = var.LIGHTHOUSE_P2P_PORT
    }
    extraArgs = concat([
      "--execution-endpoint=http://${local.reth_release_name}.${var.NAMESPACE}.svc.cluster.local:8551",
      "--semi-supernode",
      "--network=${var.CHAIN}",
    ], var.LIGHTHOUSE_EXTRA_ARGS)
    persistence = {
      enabled       = true
      existingClaim = kubernetes_persistent_volume_claim_v1.lighthouse_storage.metadata[0].name
    }
    service = {
      type                  = "ClusterIP"
      internalTrafficPolicy = var.INTERNAL_TRAFFIC_POLICY
    }
  })
}

resource "kubernetes_persistent_volume_claim_v1" "reth_storage" {
  metadata {
    name      = local.reth_pvc_name
    namespace = var.NAMESPACE
    labels = {
      "app.kubernetes.io/instance"   = local.reth_release_name
      "app.kubernetes.io/name"       = "reth"
      "app.kubernetes.io/managed-by" = "Terraform"
    }
  }

  spec {
    access_modes       = ["ReadWriteOnce"]
    storage_class_name = var.STORAGE_CLASS_NAME

    resources {
      requests = {
        storage = var.RETH_STORAGE
      }
    }
  }

  wait_until_bound = false
}

resource "kubernetes_persistent_volume_claim_v1" "lighthouse_storage" {
  metadata {
    name      = local.lighthouse_pvc_name
    namespace = var.NAMESPACE
    labels = {
      "app.kubernetes.io/instance"   = local.lighthouse_release_name
      "app.kubernetes.io/name"       = "lighthouse"
      "app.kubernetes.io/managed-by" = "Terraform"
    }
  }

  spec {
    access_modes       = ["ReadWriteOnce"]
    storage_class_name = var.STORAGE_CLASS_NAME

    resources {
      requests = {
        storage = var.LIGHTHOUSE_STORAGE
      }
    }
  }

  wait_until_bound = false
}

resource "helm_release" "reth" {
  name             = local.reth_release_name
  repository       = local.eth_panda_ops_repo
  chart            = "reth"
  version          = var.RETH_CHART_VERSION
  namespace        = var.NAMESPACE
  create_namespace = false
  upgrade_install  = true
  force_update     = true
  recreate_pods    = true
  reuse_values     = false
  timeout          = var.HELM_TIMEOUT_SECONDS
  wait             = var.HELM_WAIT

  values = [yamlencode(local.reth_values)]
}

resource "helm_release" "lighthouse" {
  name             = local.lighthouse_release_name
  repository       = local.eth_panda_ops_repo
  chart            = "lighthouse"
  version          = var.LIGHTHOUSE_CHART_VERSION
  namespace        = var.NAMESPACE
  create_namespace = false
  upgrade_install  = true
  force_update     = true
  recreate_pods    = true
  reuse_values     = false
  timeout          = var.HELM_TIMEOUT_SECONDS
  wait             = var.HELM_WAIT

  values = [yamlencode(local.lighthouse_values)]

  depends_on = [helm_release.reth]
}

resource "kubernetes_service_v1" "reth_internal_load_balancer" {
  count = var.RETH_INTERNAL_LOAD_BALANCER == null ? 0 : 1

  metadata {
    name      = "${local.reth_release_name}-internal"
    namespace = var.NAMESPACE
    annotations = {
      "networking.gke.io/load-balancer-type" = "Internal"
    }
    labels = {
      "app.kubernetes.io/instance" = local.reth_release_name
      "app.kubernetes.io/name"     = "reth"
    }
  }

  spec {
    type             = "LoadBalancer"
    load_balancer_ip = var.RETH_INTERNAL_LOAD_BALANCER.ip
    selector = {
      "app.kubernetes.io/instance" = local.reth_release_name
      "app.kubernetes.io/name"     = "reth"
    }

    port {
      name        = "http-rpc"
      port        = 8545
      protocol    = "TCP"
      target_port = "http-rpc"
    }

    port {
      name        = "ws-rpc"
      port        = 8546
      protocol    = "TCP"
      target_port = "ws-rpc"
    }
  }

  wait_for_load_balancer = false

  depends_on = [helm_release.reth]
}

resource "kubernetes_service_v1" "lighthouse_internal_load_balancer" {
  count = var.LIGHTHOUSE_INTERNAL_LOAD_BALANCER == null ? 0 : 1

  metadata {
    name      = "${local.lighthouse_release_name}-internal"
    namespace = var.NAMESPACE
    annotations = {
      "networking.gke.io/load-balancer-type" = "Internal"
    }
    labels = {
      "app.kubernetes.io/instance" = local.lighthouse_release_name
      "app.kubernetes.io/name"     = "lighthouse"
    }
  }

  spec {
    type             = "LoadBalancer"
    load_balancer_ip = var.LIGHTHOUSE_INTERNAL_LOAD_BALANCER.ip
    selector = {
      "app.kubernetes.io/instance" = local.lighthouse_release_name
      "app.kubernetes.io/name"     = "lighthouse"
    }

    port {
      name        = "http-api"
      port        = 5052
      protocol    = "TCP"
      target_port = "http-api"
    }
  }

  wait_for_load_balancer = false

  depends_on = [helm_release.lighthouse]
}
