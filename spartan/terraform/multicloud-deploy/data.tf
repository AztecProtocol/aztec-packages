# Get the LoadBalancer DNS names using a data source
data "kubernetes_service" "lb_ethereum_tcp" {
  provider = kubernetes.eks-cluster
  metadata {
    name      = "ethereum-lb"
    namespace = var.testnet_name
  }
  depends_on = [helm_release.aztec-eks-cluster]
}

data "kubernetes_service" "lb_boot_node_tcp" {
  provider = kubernetes.eks-cluster
  metadata {
    name      = "boot-node-lb-tcp"
    namespace = var.testnet_name
  }
  depends_on = [helm_release.aztec-eks-cluster]
}

data "kubernetes_service" "lb_boot_node_udp" {
  provider = kubernetes.eks-cluster
  metadata {
    name      = "boot-node-lb-udp"
    namespace = var.testnet_name
  }
  depends_on = [helm_release.aztec-eks-cluster]
}

data "kubernetes_service" "lb_validator_tcp" {
  provider = kubernetes.eks-cluster
  metadata {
    name      = "validator-0-lb-tcp"
    namespace = var.testnet_name
  }
  depends_on = [helm_release.aztec-eks-cluster]
}

data "kubernetes_service" "lb_validator_udp" {
  provider = kubernetes.eks-cluster
  metadata {
    name      = "validator-0-lb-udp"
    namespace = var.testnet_name
  }
  depends_on = [helm_release.aztec-eks-cluster]
}

data "kubernetes_service" "lb_pxe_tcp" {
  provider = kubernetes.eks-cluster
  metadata {
    name      = "pxe-lb"
    namespace = var.testnet_name
  }
  depends_on = [helm_release.aztec-eks-cluster]
}
