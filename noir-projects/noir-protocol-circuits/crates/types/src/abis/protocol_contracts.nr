use crate::{
    address::aztec_address::AztecAddress,
    constants::{GENERATOR_INDEX__PROTOCOL_CONTRACTS, MAX_PROTOCOL_CONTRACTS},
    hash::poseidon2_hash_with_separator,
    traits::{Deserialize, Empty, Serialize, ToField},
};

#[derive(Eq, Serialize, Deserialize)]
pub struct ProtocolContracts {
    derived_addresses: [AztecAddress; MAX_PROTOCOL_CONTRACTS],
}

impl ProtocolContracts {
    pub fn new(derived_addresses: [AztecAddress; MAX_PROTOCOL_CONTRACTS]) -> Self {
        Self { derived_addresses }
    }

    pub fn is_protocol_contract_address(contract_address: AztecAddress) -> bool {
        // Address zero is not a protocol contract. Address 1 is the derived address index 0, address 2 is the derived address index 1, etc.
        // Underflow will happen if trying to check address zero, but that is fine, since it'll fail the lt check.
        (contract_address.to_field() - 1).lt(MAX_PROTOCOL_CONTRACTS as Field)
    }

    /// Obtains the derived address for a given canonical address
    /// Important! This assumes that the called has already validated that the address is indeed a protocol contract address.
    pub fn get_derived_address(self, protocol_contract_address: AztecAddress) -> AztecAddress {
        self.derived_addresses[(protocol_contract_address.to_field() - 1) as u32]
    }

    pub fn hash(self) -> Field {
        poseidon2_hash_with_separator(
            self.derived_addresses.map(|address| address.to_field()),
            GENERATOR_INDEX__PROTOCOL_CONTRACTS,
        )
    }
}

impl Empty for ProtocolContracts {
    fn empty() -> Self {
        Self { derived_addresses: [AztecAddress::zero(); MAX_PROTOCOL_CONTRACTS] }
    }
}
