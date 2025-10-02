output "web3signer_url" {
  description = "URL to access the web3signer instance"
  value       = "http://${var.RELEASE_NAME}-signer-web3signer.${var.NAMESPACE}.svc.cluster.local:9000"
}

output "addresses_configmap_name" {
  description = "ConfigMap name containing the published addresses"
  value       = var.ADDRESS_CONFIGMAP_NAME
}
