output "eks_cluster_deployment" {
  description = "Details of the EKS cluster Helm deployment"
  value = {
    name        = helm_release.aztec-eks-cluster.name
    namespace   = helm_release.aztec-eks-cluster.namespace
    chart       = helm_release.aztec-eks-cluster.chart
    version     = helm_release.aztec-eks-cluster.version
    status      = helm_release.aztec-eks-cluster.status
    values_file = var.values-file
    cluster     = var.eks_cluster_context
  }
}

output "gke_cluster_deployment" {
  description = "Details of the GKE cluster Helm deployment"
  value = {
    name        = helm_release.aztec-gke-cluster.name
    namespace   = helm_release.aztec-gke-cluster.namespace
    chart       = helm_release.aztec-gke-cluster.chart
    version     = helm_release.aztec-gke-cluster.version
    status      = helm_release.aztec-gke-cluster.status
    values_file = var.values-file
    cluster     = var.gke_cluster_context
  }
}

# Get the LoadBalancer DNS name using a data source
data "kubernetes_service" "eks_boot_node_lb" {
  provider = kubernetes.eks-cluster
  metadata {
    name      = "${helm_release.aztec-eks-cluster.name}-boot-node-lb-tcp"
    namespace = helm_release.aztec-eks-cluster.namespace
  }
  depends_on = [helm_release.aztec-eks-cluster]
}

output "eks_boot_node_lb_hostname" {
  description = "DNS hostname of the EKS boot node LoadBalancer"
  value       = data.kubernetes_service.eks_boot_node_lb.status.0.load_balancer.0.ingress.0.hostname
}
