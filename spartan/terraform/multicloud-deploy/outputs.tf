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

# output "gke_cluster_deployment" {
#   description = "Details of the GKE cluster Helm deployment"
#   value = {
#     name        = helm_release.aztec-gke-cluster.name
#     namespace   = helm_release.aztec-gke-cluster.namespace
#     chart       = helm_release.aztec-gke-cluster.chart
#     version     = helm_release.aztec-gke-cluster.version
#     status      = helm_release.aztec-gke-cluster.status
#     values_file = var.values-file
#     cluster     = var.gke_cluster_context
#   }
# }

output "external_ethereum_tcp" {
  description = "DNS hostname of the EKS Ethereum LoadBalancer"
  value       = data.kubernetes_service.lb_ethereum_tcp.status.0.load_balancer.0.ingress.0.hostname
  depends_on  = [helm_release.aztec-eks-cluster]
}

output "external_boot_node_tcp" {
  description = "DNS hostname of the EKS boot node LoadBalancer"
  value       = data.kubernetes_service.lb_boot_node_tcp.status.0.load_balancer.0.ingress.0.hostname
  depends_on  = [helm_release.aztec-eks-cluster]
}

output "external_boot_node_udp" {
  description = "DNS hostname of the EKS boot node LoadBalancer"
  value       = data.kubernetes_service.lb_boot_node_udp.status.0.load_balancer.0.ingress.0.hostname
  depends_on  = [helm_release.aztec-eks-cluster]
}

output "external_validator_tcp" {
  description = "DNS hostname of the EKS validator LoadBalancer"
  value       = data.kubernetes_service.lb_validator_tcp.status.0.load_balancer.0.ingress.0.hostname
  depends_on  = [helm_release.aztec-eks-cluster]
}

output "external_validator_udp" {
  description = "DNS hostname of the EKS validator LoadBalancer"
  value       = data.kubernetes_service.lb_validator_udp.status.0.load_balancer.0.ingress.0.hostname
  depends_on  = [helm_release.aztec-eks-cluster]
}

output "external_pxe_tcp" {
  description = "DNS hostname of the EKS PXE LoadBalancer"
  value       = data.kubernetes_service.lb_pxe_tcp.status.0.load_balancer.0.ingress.0.hostname
  depends_on  = [helm_release.aztec-eks-cluster]
}
