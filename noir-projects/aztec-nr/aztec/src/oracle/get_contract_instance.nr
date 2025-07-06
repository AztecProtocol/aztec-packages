use protocol_types::{
    address::AztecAddress, contract_class_id::ContractClassId, contract_instance::ContractInstance,
    traits::FromField,
};

// NOTE: this is for use in private only
#[oracle(getContractInstance)]
unconstrained fn get_contract_instance_oracle(_address: AztecAddress) -> ContractInstance {}

// NOTE: this is for use in private only
unconstrained fn get_contract_instance_internal(address: AztecAddress) -> ContractInstance {
    get_contract_instance_oracle(address)
}

// NOTE: this is for use in private only
pub fn get_contract_instance(address: AztecAddress) -> ContractInstance {
    // Safety: The to_address function combines all values in the instance object to produce an address,
    // so by checking that we get the expected address we validate the entire struct.
    let instance = unsafe { get_contract_instance_internal(address) };
    assert_eq(instance.to_address(), address);

    instance
}

struct GetContractInstanceResult {
    exists: bool,
    member: Field,
}

// These oracles each return a ContractInstance member
// plus a boolean indicating whether the instance was found.
#[oracle(avmOpcodeGetContractInstanceDeployer)]
unconstrained fn get_contract_instance_deployer_oracle_avm(
    _address: AztecAddress,
) -> [GetContractInstanceResult; 1] {}
#[oracle(avmOpcodeGetContractInstanceClassId)]
unconstrained fn get_contract_instance_class_id_oracle_avm(
    _address: AztecAddress,
) -> [GetContractInstanceResult; 1] {}
#[oracle(avmOpcodeGetContractInstanceInitializationHash)]
unconstrained fn get_contract_instance_initialization_hash_oracle_avm(
    _address: AztecAddress,
) -> [GetContractInstanceResult; 1] {}

unconstrained fn get_contract_instance_registry_deployer_avm(
    address: AztecAddress,
) -> [GetContractInstanceResult; 1] {
    get_contract_instance_deployer_oracle_avm(address)
}
unconstrained fn get_contract_instance_class_id_internal_avm(
    address: AztecAddress,
) -> [GetContractInstanceResult; 1] {
    get_contract_instance_class_id_oracle_avm(address)
}
unconstrained fn get_contract_instance_initialization_hash_internal_avm(
    address: AztecAddress,
) -> [GetContractInstanceResult; 1] {
    get_contract_instance_initialization_hash_oracle_avm(address)
}

pub fn get_contract_instance_deployer_avm(address: AztecAddress) -> Option<AztecAddress> {
    // Safety: AVM opcodes are constrained by the AVM itself
    let GetContractInstanceResult { exists, member } =
        unsafe { get_contract_instance_registry_deployer_avm(address)[0] };
    if exists {
        Option::some(AztecAddress::from_field(member))
    } else {
        Option::none()
    }
}
pub fn get_contract_instance_class_id_avm(address: AztecAddress) -> Option<ContractClassId> {
    // Safety: AVM opcodes are constrained by the AVM itself
    let GetContractInstanceResult { exists, member } =
        unsafe { get_contract_instance_class_id_internal_avm(address)[0] };
    if exists {
        Option::some(ContractClassId::from_field(member))
    } else {
        Option::none()
    }
}
pub fn get_contract_instance_initialization_hash_avm(address: AztecAddress) -> Option<Field> {
    // Safety: AVM opcodes are constrained by the AVM itself
    let GetContractInstanceResult { exists, member } =
        unsafe { get_contract_instance_initialization_hash_internal_avm(address)[0] };
    if exists {
        Option::some(member)
    } else {
        Option::none()
    }
}
