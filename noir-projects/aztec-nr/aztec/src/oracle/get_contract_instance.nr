use dep::protocol_types::{
    address::AztecAddress, constants::CONTRACT_INSTANCE_LENGTH, contract_class_id::ContractClassId,
    contract_instance::ContractInstance,
};

// NOTE: this is for use in private only
#[oracle(getContractInstance)]
unconstrained fn get_contract_instance_oracle(
    _address: AztecAddress,
) -> [Field; CONTRACT_INSTANCE_LENGTH] {}

// NOTE: this is for use in private only
unconstrained fn get_contract_instance_internal(
    address: AztecAddress,
) -> [Field; CONTRACT_INSTANCE_LENGTH] {
    get_contract_instance_oracle(address)
}

// NOTE: this is for use in private only
pub fn get_contract_instance(address: AztecAddress) -> ContractInstance {
    /// Safety: The to_address function combines all values in the instance object to produce an address,
    /// so by checking that we get the expected address we validate the entire struct.
    let instance =
        unsafe { ContractInstance::deserialize(get_contract_instance_internal(address)) };
    assert_eq(instance.to_address(), address);

    instance
}

// These oracles each return a ContractInstance member
// plus a boolean indicating whether the instance was found.
#[oracle(avmOpcodeGetContractInstanceDeployer)]
unconstrained fn get_contract_instance_deployer_oracle_avm(
    _address: AztecAddress,
) -> (Field, bool) {}
#[oracle(avmOpcodeGetContractInstanceClassId)]
unconstrained fn get_contract_instance_class_id_oracle_avm(
    _address: AztecAddress,
) -> (Field, bool) {}
#[oracle(avmOpcodeGetContractInstanceInitializationHash)]
unconstrained fn get_contract_instance_initialization_hash_oracle_avm(
    _address: AztecAddress,
) -> (Field, bool) {}

pub unconstrained fn get_contract_instance_deployer_internal_avm(
    address: AztecAddress,
) -> (Field, bool) {
    get_contract_instance_deployer_oracle_avm(address)
}
pub unconstrained fn get_contract_instance_class_id_internal_avm(
    address: AztecAddress,
) -> (Field, bool) {
    get_contract_instance_class_id_oracle_avm(address)
}
pub unconstrained fn get_contract_instance_initialization_hash_internal_avm(
    address: AztecAddress,
) -> (Field, bool) {
    get_contract_instance_initialization_hash_oracle_avm(address)
}

pub fn get_contract_instance_deployer_avm(address: AztecAddress) -> Option<AztecAddress> {
    /// Safety: AVM opcodes are constrained by the AVM itself
    let (member, exists) = unsafe { get_contract_instance_deployer_internal_avm(address) };
    if exists {
        Option::some(AztecAddress::from_field(member))
    } else {
        Option::none()
    }
}
pub fn get_contract_instance_class_id_avm(address: AztecAddress) -> Option<ContractClassId> {
    /// Safety: AVM opcodes are constrained by the AVM itself
    let (member, exists) = unsafe { get_contract_instance_class_id_internal_avm(address) };
    if exists {
        Option::some(ContractClassId::from_field(member))
    } else {
        Option::none()
    }
}
pub fn get_contract_instance_initialization_hash_avm(address: AztecAddress) -> Option<Field> {
    /// Safety: AVM opcodes are constrained by the AVM itself
    let (member, exists) =
        unsafe { get_contract_instance_initialization_hash_internal_avm(address) };
    if exists {
        Option::some(member)
    } else {
        Option::none()
    }
}
