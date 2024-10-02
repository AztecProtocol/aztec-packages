use dep::protocol_types::{
    address::AztecAddress, contract_instance::ContractInstance, constants::CONTRACT_INSTANCE_LENGTH,
    utils::reader::Reader
};

#[oracle(getContractInstance)]
unconstrained fn get_contract_instance_oracle(_address: AztecAddress) -> [Field; CONTRACT_INSTANCE_LENGTH] {}

// Returns a ContractInstance plus a boolean indicating whether the instance was found.
#[oracle(avmOpcodeGetContractInstance)]
unconstrained fn get_contract_instance_oracle_avm(_address: AztecAddress) -> [Field; CONTRACT_INSTANCE_LENGTH + 1] {}

unconstrained fn get_contract_instance_internal(address: AztecAddress) -> [Field; CONTRACT_INSTANCE_LENGTH] {
    get_contract_instance_oracle(address)
}

unconstrained pub fn get_contract_instance_internal_avm(address: AztecAddress) -> [Field; CONTRACT_INSTANCE_LENGTH + 1] {
    get_contract_instance_oracle_avm(address)
}

pub fn get_contract_instance(address: AztecAddress) -> ContractInstance {
    let instance = unsafe {
        ContractInstance::deserialize(get_contract_instance_internal(address))
    };
    // The to_address function combines all values in the instance object to produce an address, so by checking that we
    // get the expected address we validate the entire struct.
    // assert_eq(instance.to_address(), address);

    instance
}

pub fn get_contract_instance_avm(address: AztecAddress) -> Option<ContractInstance> {
    let mut reader = Reader::new(get_contract_instance_internal_avm(address));
    let found = reader.read();
    if found == 0 {
        Option::none()
    } else {
        Option::some(reader.read_struct(ContractInstance::deserialize))
    }
}
