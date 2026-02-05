use aztec::macros::aztec;

// The sole purpose of this contract is to serve as a Noir interface for the real ContractInstanceRegistry contract.
// This was done because the real ContractInstanceRegistry contract has been stripped of `aztec-nr` macros which
// results in the nice Noir interface no longer being generated.
//
// (We've stripped the contract of `aztec-nr` macros in order for auditors to not need to audit them - protocol
// contracts were audited during the protocol circuits audit).
//
// For context, this is the interface I am talking about:
// ```noir
// let update_delay = self.view(ContractInstanceRegistry::at(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS).get_update_delay());
// ```
// where the macros generate the `ContractInstanceRegistry` struct.
#[aztec]
pub contract ContractInstanceRegistry {
    use aztec::{
        macros::functions::{external, view},
        protocol::{contract_class_id::ContractClassId, public_keys::PublicKeys},
    };

    #[external("private")]
    fn publish_for_public_execution(
        salt: Field,
        contract_class_id: ContractClassId,
        initialization_hash: Field,
        public_keys: PublicKeys,
        universal_deploy: bool,
    ) {}

    #[external("public")]
    fn update(new_contract_class_id: ContractClassId) {}

    #[external("public")]
    fn set_update_delay(new_update_delay: u64) {}

    #[external("public")]
    #[view]
    fn get_update_delay() -> u64 {
        0
    }
}
