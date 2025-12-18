terraform {
  required_providers {
    # No providers needed - just using terraform state for persistence
  }
}

# Store contract addresses in terraform state
# This resource is used purely for state persistence across ephemeral runners
resource "terraform_data" "contract_addresses" {
  input = {
    registry_address          = var.registry_address
    slash_factory_address     = var.slash_factory_address
    fee_asset_handler_address = var.fee_asset_handler_address
    rollup_address            = var.rollup_address
    deployed_at               = var.deployed_at
  }
}

output "registry_address" {
  value = terraform_data.contract_addresses.input.registry_address
}

output "slash_factory_address" {
  value = terraform_data.contract_addresses.input.slash_factory_address
}

output "fee_asset_handler_address" {
  value = terraform_data.contract_addresses.input.fee_asset_handler_address
}

output "rollup_address" {
  value = terraform_data.contract_addresses.input.rollup_address
}

output "deployed_at" {
  value = terraform_data.contract_addresses.input.deployed_at
}
