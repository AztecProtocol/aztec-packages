# Static IP addresses for load balancers
resource "google_compute_address" "reth_rpc_ip" {
  provider = google
  name     = "${var.namespace}-reth-rpc-ip"
  region   = var.gcp_region
  project  = var.gcp_project_id
}

resource "google_compute_address" "lighthouse_rpc_ip" {
  provider = google
  name     = "${var.namespace}-lighthouse-rpc-ip"
  region   = var.gcp_region
  project  = var.gcp_project_id
}

# Temporary public static IP addresses for testing
resource "google_compute_address" "reth_rpc_public_ip" {
  provider = google
  name     = "${var.namespace}-reth-rpc-public-ip"
  region   = var.gcp_region
  project  = var.gcp_project_id
}

resource "google_compute_address" "lighthouse_rpc_public_ip" {
  provider = google
  name     = "${var.namespace}-lighthouse-rpc-public-ip"
  region   = var.gcp_region
  project  = var.gcp_project_id
}

# Load Balancer service for Reth RPC
resource "kubernetes_service" "reth_rpc_lb" {
  provider = kubernetes.gke-cluster

  metadata {
    name      = "reth-rpc-lb"
    namespace = var.namespace
    annotations = {
      "cloud.google.com/load-balancer-type" = "External"
    }
  }

  spec {
    type                    = "LoadBalancer"
    load_balancer_ip        = google_compute_address.reth_rpc_ip.address
    external_traffic_policy = "Local"

    selector = {
      "app.kubernetes.io/name"     = "reth"
      "app.kubernetes.io/instance" = local.reth_name
    }

    port {
      name        = "http-rpc"
      port        = 8545
      target_port = 8545
      protocol    = "TCP"
    }

    port {
      name        = "ws-rpc"
      port        = 8546
      target_port = 8546
      protocol    = "TCP"
    }
  }

  depends_on = [helm_release.releases]
}

# Load Balancer service for Lighthouse RPC
resource "kubernetes_service" "lighthouse_rpc_lb" {
  provider = kubernetes.gke-cluster

  metadata {
    name      = "lighthouse-rpc-lb"
    namespace = var.namespace
    annotations = {
      "cloud.google.com/load-balancer-type" = "External"
    }
  }

  spec {
    type                    = "LoadBalancer"
    load_balancer_ip        = google_compute_address.lighthouse_rpc_ip.address
    external_traffic_policy = "Local"

    selector = {
      "app.kubernetes.io/name"     = "lighthouse"
      "app.kubernetes.io/instance" = "lighthouse"
    }

    port {
      name        = "http-rpc"
      port        = 5052
      target_port = 5052
      protocol    = "TCP"
    }
  }

  depends_on = [helm_release.releases]
}

# Temporary public Load Balancer service for Reth RPC
resource "kubernetes_service" "reth_rpc_public_lb" {
  provider = kubernetes.gke-cluster

  metadata {
    name      = "reth-rpc-public-lb"
    namespace = var.namespace
    annotations = {
      "cloud.google.com/load-balancer-type" = "External"
    }
  }

  spec {
    type                    = "LoadBalancer"
    load_balancer_ip        = google_compute_address.reth_rpc_public_ip.address
    external_traffic_policy = "Local"

    selector = {
      "app.kubernetes.io/name"     = "reth"
      "app.kubernetes.io/instance" = local.reth_name
    }

    port {
      name        = "http-rpc"
      port        = 8545
      target_port = 8545
      protocol    = "TCP"
    }

    port {
      name        = "ws-rpc"
      port        = 8546
      target_port = 8546
      protocol    = "TCP"
    }
  }

  depends_on = [helm_release.releases]
}

# Temporary public Load Balancer service for Lighthouse RPC
resource "kubernetes_service" "lighthouse_rpc_public_lb" {
  provider = kubernetes.gke-cluster

  metadata {
    name      = "lighthouse-rpc-public-lb"
    namespace = var.namespace
    annotations = {
      "cloud.google.com/load-balancer-type" = "External"
    }
  }

  spec {
    type                    = "LoadBalancer"
    load_balancer_ip        = google_compute_address.lighthouse_rpc_public_ip.address
    external_traffic_policy = "Local"

    selector = {
      "app.kubernetes.io/name"     = "lighthouse"
      "app.kubernetes.io/instance" = "lighthouse"
    }

    port {
      name        = "http-rpc"
      port        = 5052
      target_port = 5052
      protocol    = "TCP"
    }
  }

  depends_on = [helm_release.releases]
}
