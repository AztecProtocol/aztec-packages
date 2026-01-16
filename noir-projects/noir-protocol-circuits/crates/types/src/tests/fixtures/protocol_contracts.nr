use crate::{
    abis::protocol_contracts::ProtocolContracts, address::aztec_address::AztecAddress,
    constants::MAX_PROTOCOL_CONTRACTS, tests::fixtures::contracts::get_protocol_contract,
};

global NUM_PROTOCOL_CONTRACTS_FOR_TESTING: u32 = 3;

pub fn get_protocol_contracts() -> ProtocolContracts {
    let mut derived_addresses = [AztecAddress::zero(); MAX_PROTOCOL_CONTRACTS];
    for i in 0..NUM_PROTOCOL_CONTRACTS_FOR_TESTING {
        derived_addresses[i] = get_protocol_contract(i).address;
    }
    ProtocolContracts::new(derived_addresses)
}
