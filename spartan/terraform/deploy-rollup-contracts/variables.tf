
# Inputs for the deploy-rollup-contracts Terraform module.
#
# All configuration flows through two structured inputs populated by
# spartan/scripts/deploy_network.sh from the YAML loader output plus
# deploy-time-computed values (private key, validator addresses, L1 RPC URLs,
# Etherscan key, etc.).
#
# main.tf reads these as var.deploy.<KEY> and var.env.<KEY> -- never as
# individual legacy var.<KEY> variables.

variable "deploy" {
  description = "Deploy-time config (cluster context, namespace, image, L1 endpoints, private key, validator addresses, job settings, ...). Loaded from per-network YAML deploy: block and merged with script-computed values by deploy_network.sh."
  type        = any
}

variable "env" {
  description = "Network env vars (AZTEC_* overrides, NETWORK, ...) loaded from per-network YAML env: block."
  type        = map(string)
  default     = {}
}
