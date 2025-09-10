output "job_name" {
  description = "Name of the Kubernetes job that was created"
  value       = kubernetes_job_v1.deploy_rollup_contracts.metadata[0].name
}

output "job_namespace" {
  description = "Namespace where the job was deployed"
  value       = kubernetes_job_v1.deploy_rollup_contracts.metadata[0].namespace
}

output "job_uid" {
  description = "UID of the created job"
  value       = kubernetes_job_v1.deploy_rollup_contracts.metadata[0].uid
}

# Since wait_for_completion=true, if we reach here, the job completed successfully

output "contract_addresses_json" {
  description = "JSON output from deploy-l1-contracts command containing contract addresses"
  value       = data.external.contract_addresses.result
}

output "registry_address" {
  description = "Address of the deployed registry contract"
  value       = data.external.contract_addresses.result.registryAddress
}

output "governance_address" {
  description = "Address of the deployed governance contract"
  value       = data.external.contract_addresses.result.governanceAddress
}


output "governance_proposer_address" {
  description = "Address of the deployed governance proposer contract"
  value       = data.external.contract_addresses.result.governanceProposerAddress
}

output "rollup_address" {
  description = "Address of the deployed rollup contract"
  value       = data.external.contract_addresses.result.rollupAddress
}


output "inbox_address" {
  description = "Address of the deployed inbox contract"
  value       = data.external.contract_addresses.result.inboxAddress
}

output "outbox_address" {
  description = "Address of the deployed outbox contract"
  value       = data.external.contract_addresses.result.outboxAddress
}

output "fee_juice_portal_address" {
  description = "Address of the deployed fee juice portal contract"
  value       = data.external.contract_addresses.result.feeJuicePortalAddress
}

output "fee_juice_address" {
  description = "Address of the deployed fee juice contract"
  value       = data.external.contract_addresses.result.feeJuiceAddress
}

output "staking_asset_address" {
  description = "Address of the deployed staking asset contract"
  value       = data.external.contract_addresses.result.stakingAssetAddress
}

output "reward_distributor_address" {
  description = "Address of the deployed reward distributor contract"
  value       = data.external.contract_addresses.result.rewardDistributorAddress
}

output "gse_address" {
  description = "Address of the deployed gse contract"
  value       = data.external.contract_addresses.result.gseAddress
}

output "coin_issuer_address" {
  description = "Address of the deployed coin issuer contract"
  value       = data.external.contract_addresses.result.coinIssuerAddress
}

output "slash_factory_address" {
  description = "Address of the deployed slash factory contract"
  value       = data.external.contract_addresses.result.slashFactoryAddress
}

output "fee_asset_handler_address" {
  description = "Address of the deployed fee asset handler contract"
  value       = data.external.contract_addresses.result.feeAssetHandlerAddress
}

output "staking_asset_handler_address" {
  description = "Address of the deployed staking asset handler contract"
  value       = data.external.contract_addresses.result.stakingAssetHandlerAddress
}


output "zk_passport_verifier_address" {
  description = "Address of the deployed zk passport verifier contract"
  value       = data.external.contract_addresses.result.zkPassportVerifierAddress
}


output "docker_image_used" {
  description = "Docker image that was used for the deployment"
  value       = var.AZTEC_DOCKER_IMAGE
}

output "deployment_command" {
  description = "The full command that was executed"
  sensitive   = true
  value = concat(
    ["node", "--no-warnings", "/usr/src/yarn-project/aztec/dest/bin/index.js"],
    local.deploy_args
  )
}

output "deployment_successful" {
  description = "Whether the deployment completed successfully with valid contract addresses"
  value       = lookup(data.external.contract_addresses.result, "status", "success") != "no_json_found"
}

output "verification_json_b64" {
  description = "Base64-encoded contents of /tmp/l1-verify.json emitted by the job"
  value       = data.external.verification_json.result.b64
}
