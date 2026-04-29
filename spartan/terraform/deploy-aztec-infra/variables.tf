# Inputs for the deploy-aztec-infra Terraform module.
#
# All deploy-script and per-network configuration flows through three
# structured inputs, populated by spartan/scripts/deploy_network.sh from
# spartan/scripts/load_network_config.sh's `--format=tfvars` output plus
# deploy-time-computed values (cluster context, contract addresses, image
# overrides, admin API key hash, etc.).
#
# main.tf reads these as `var.deploy.<KEY>`, `var.env.<KEY>`, and
# `var.releases.<RELEASE>.<...>` -- never as individual `var.<KEY>` legacy
# variables (those have all been deleted; defaults live in
# spartan/environments/network-defaults.yml `_deploy_defaults`).

variable "deploy" {
  description = "Deploy-time config (cluster, namespace, ingress, mnemonics, contract addresses, ...). Loaded from per-network YAML's `deploy:` block by load_network_config.sh and merged with script-computed values by deploy_network.sh."
  type        = any
}

variable "env" {
  description = "Network-wide pod env baseline (UPPER_SNAKE keys) loaded from per-network YAML's `env:` block."
  type        = map(string)
  default     = {}
}

variable "releases" {
  description = "Per-release Helm values keyed by release name (validator, prover, rpc, ...). Loaded from per-network YAML's per-release blocks."
  type        = any
  default     = {}
}
