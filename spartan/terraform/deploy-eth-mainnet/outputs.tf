output "execution_svc_ip" {
  description = "Execution Service external IP (if LoadBalancer) or Cluster IP"
  value       = coalesce(try(data.kubernetes_service.mainnet_eth_execution.status[0].load_balancer[0].ingress[0].ip, null), data.kubernetes_service.mainnet_eth_execution.spec[0].cluster_ip)
}
