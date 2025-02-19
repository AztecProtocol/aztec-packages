use dep::protocol_types::{
    address::AztecAddress, block_header::BlockHeader, constants::DEPLOYER_CONTRACT_ADDRESS,
    hash::compute_siloed_nullifier,
};

trait ProveContractDeployment {
    fn prove_contract_deployment(header: BlockHeader, contract_address: AztecAddress);
}

impl ProveContractDeployment for BlockHeader {
    fn prove_contract_deployment(self, contract_address: AztecAddress) {
        // Compute deployment nullifier
        let nullifier =
            compute_siloed_nullifier(DEPLOYER_CONTRACT_ADDRESS, contract_address.to_field());

        self.prove_nullifier_inclusion(nullifier);
    }
}

trait ProveContractNonDeployment {
    fn prove_contract_non_deployment(header: BlockHeader, contract_address: AztecAddress);
}

impl ProveContractNonDeployment for BlockHeader {
    fn prove_contract_non_deployment(self, contract_address: AztecAddress) {
        // Compute deployment nullifier
        let nullifier =
            compute_siloed_nullifier(DEPLOYER_CONTRACT_ADDRESS, contract_address.to_field());

        // docs:start:prove_nullifier_non_inclusion
        self.prove_nullifier_non_inclusion(nullifier);
        // docs:end:prove_nullifier_non_inclusion
    }
}

trait ProveContractInitialization {
    fn prove_contract_initialization(header: BlockHeader, contract_address: AztecAddress);
}

impl ProveContractInitialization for BlockHeader {
    fn prove_contract_initialization(self, contract_address: AztecAddress) {
        // Compute initialization nullifier
        let nullifier = compute_siloed_nullifier(contract_address, contract_address.to_field());

        self.prove_nullifier_inclusion(nullifier);
    }
}

trait ProveContractNonInitialization {
    fn prove_contract_non_initialization(header: BlockHeader, contract_address: AztecAddress);
}

impl ProveContractNonInitialization for BlockHeader {
    fn prove_contract_non_initialization(self, contract_address: AztecAddress) {
        // Compute initialization nullifier
        let nullifier = compute_siloed_nullifier(contract_address, contract_address.to_field());

        self.prove_nullifier_non_inclusion(nullifier);
    }
}
