output "node_services" {
  description = "Ethereum node Service names and ports keyed by chain."
  value = {
    for chain, node in module.ethereum_nodes : chain => {
      namespace = node.namespace
      reth = {
        service                        = node.reth_service_name
        internal_load_balancer_service = node.reth_internal_load_balancer_service_name
        http_port                      = node.reth_http_port
        ws_port                        = node.reth_ws_port
        auth_port                      = node.reth_auth_port
      }
      lighthouse = {
        service                        = node.lighthouse_service_name
        internal_load_balancer_service = node.lighthouse_internal_load_balancer_service_name
        http_port                      = node.lighthouse_http_port
      }
    }
  }
}

output "internal_urls" {
  description = "Direct internal URLs keyed by chain. Cluster URLs are Kubernetes-local; VPC URLs use static internal LoadBalancer IPs."
  value = {
    for chain, node in module.ethereum_nodes : chain => {
      cluster = {
        reth_http       = node.reth_http_url
        reth_ws         = node.reth_ws_url
        lighthouse_http = node.lighthouse_http_url
      }
      vpc = {
        reth_http       = node.reth_internal_http_url
        reth_ws         = node.reth_internal_ws_url
        lighthouse_http = node.lighthouse_internal_http_url
      }
    }
  }
}

output "internal_load_balancer_ips" {
  description = "Static internal VPC IPs for direct Ethereum node access keyed by chain."
  value = {
    for chain, node in module.ethereum_nodes : chain => {
      execution = node.reth_internal_load_balancer_ip
      beacon    = node.lighthouse_internal_load_balancer_ip
    }
  }
}

output "external_hosts" {
  description = "External Kong hostnames keyed by chain."
  value = {
    for chain, config in local.ethereum_chains : chain => {
      execution = config.execution_hosts
      beacon    = config.beacon_hosts
    }
  }
}

output "kong_routes" {
  description = "Kong route names keyed by route alias."
  value       = module.rpc_gateway.route_names
}

output "consumer_credential_secret_names" {
  description = "Kubernetes Secret names referenced by KongConsumer credentials."
  value       = module.rpc_gateway.consumer_credential_secret_names
}

output "kong_metrics_service" {
  description = "Kong metrics Service details for scraping, or null fields when disabled."
  value = {
    namespace      = module.rpc_gateway.metrics_service_namespace
    service        = module.rpc_gateway.metrics_service_name
    port           = module.rpc_gateway.metrics_service_port
    otel_collector = try(module.ethereum_metrics_collector[0].deployment_name, null)
  }
}

output "frontend_load_balancer_ip" {
  description = "Global static IP assigned to the public GKE frontend Ingress."
  value       = module.rpc_gateway.frontend_load_balancer_ip
}

output "gcp_managed_certificate_names" {
  description = "GKE ManagedCertificate resource names keyed by Ethereum gateway host."
  value       = module.rpc_gateway.gcp_managed_certificate_names
}
