use dep::protocol_types::{
    address::AztecAddress, contract_instance::ContractInstance, constants::CONTRACT_INSTANCE_LENGTH,
    utils::reader::Reader
};

#[oracle(getContractInstance)]
unconstrained fn get_contract_instance_oracle(_address: AztecAddress) -> [Field; CONTRACT_INSTANCE_LENGTH] {}

unconstrained fn get_contract_instance_internal(address: AztecAddress) -> [Field; CONTRACT_INSTANCE_LENGTH] {
    get_contract_instance_oracle(address)
}

pub fn get_contract_instance(address: AztecAddress) -> ContractInstance {
    let instance = unsafe {
        ContractInstance::deserialize(get_contract_instance_internal(address))
    };
    // The to_address function combines all values in the instance object to produce an address, so by checking that we
    // get the expected address we validate the entire struct.
    assert_eq(instance.to_address(), address);

    instance
}

// Returns a ContractInstance plus a boolean indicating whether the instance was found.
#[oracle(avmOpcodeGetContractInstanceDeployer)]
unconstrained fn get_contract_instance_deployer_oracle_avm(_address: AztecAddress) -> (Field, bool) {}
#[oracle(avmOpcodeGetContractInstanceClassId)]
unconstrained fn get_contract_instance_class_id_oracle_avm(_address: AztecAddress) -> (Field, bool) {}
#[oracle(avmOpcodeGetContractInstanceInitializationHash)]
unconstrained fn get_contract_instance_initialization_hash_oracle_avm(_address: AztecAddress) -> (Field, bool) {}

pub unconstrained fn get_contract_instance_deployer_internal_avm(address: AztecAddress) -> (Field, bool) {
    get_contract_instance_deployer_oracle_avm(address)
}
pub unconstrained fn get_contract_instance_class_id_internal_avm(address: AztecAddress) -> (Field, bool) {
    get_contract_instance_class_id_oracle_avm(address)
}
pub unconstrained fn get_contract_instance_initialization_hash_internal_avm(address: AztecAddress) -> (Field, bool) {
    get_contract_instance_initialization_hash_oracle_avm(address)
}

pub fn get_contract_instance_deployer_avm(address: AztecAddress) -> Option<Field> {
    let (member, exists) = get_contract_instance_deployer_internal_avm(address);
    if exists == 0 {
        Option::none()
    } else {
        Option::some(member)
    }
}
pub fn get_contract_instance_class_id_avm(address: AztecAddress) -> Option<Field> {
    let (member, exists) = get_contract_instance_class_id_internal_avm(address);
    if exists == 0 {
        Option::none()
    } else {
        Option::some(member)
    }
}
pub fn get_contract_instance_initialization_hash_avm(address: AztecAddress) -> Option<Field> {
    let (member, exists) = get_contract_instance_initialization_hash_internal_avm(address);
    if exists == 0 {
        Option::none()
    } else {
        Option::some(member)
    }
}
