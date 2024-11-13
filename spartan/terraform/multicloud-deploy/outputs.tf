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
