use crate::context::inputs::PrivateContextInputs;
use crate::test::helpers::utils::TestAccount;
use dep::protocol_types::{
    abis::function_selector::FunctionSelector, address::AztecAddress,
    constants::CONTRACT_INSTANCE_LENGTH, contract_instance::ContractInstance,
    public_keys::PublicKeys,
};

pub unconstrained fn reset() {
    oracle_reset();
}

pub unconstrained fn get_side_effects_counter() -> u32 {
    oracle_get_side_effects_counter()
}

pub unconstrained fn set_contract_address(address: AztecAddress) {
    oracle_set_contract_address(address);
}

pub unconstrained fn advance_blocks_by(blocks: u32) {
    oracle_advance_blocks_by(blocks);
}

pub unconstrained fn get_private_context_inputs(
    historical_block_number: u32,
) -> PrivateContextInputs {
    oracle_get_private_context_inputs(historical_block_number)
}

pub unconstrained fn deploy<let N: u32, let M: u32, let P: u32>(
    path: str<N>,
    name: str<M>,
    initializer: str<P>,
    args: [Field],
    public_keys_hash: Field,
) -> ContractInstance {
    let instance_fields = oracle_deploy(path, name, initializer, args, public_keys_hash);
    ContractInstance::deserialize(instance_fields)
}

pub unconstrained fn direct_storage_write<let N: u32>(
    contract_address: AztecAddress,
    storage_slot: Field,
    fields: [Field; N],
) {
    let _hash = direct_storage_write_oracle(contract_address, storage_slot, fields);
}

pub unconstrained fn create_account() -> TestAccount {
    oracle_create_account()
}

pub unconstrained fn add_account(secret: Field) -> TestAccount {
    oracle_add_account(secret)
}

pub unconstrained fn derive_keys(secret: Field) -> PublicKeys {
    oracle_derive_keys(secret)
}

pub unconstrained fn add_authwit(address: AztecAddress, message_hash: Field) {
    orable_add_authwit(address, message_hash)
}

pub unconstrained fn assert_public_call_fails(
    target_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field],
) {
    oracle_assert_public_call_fails(target_address, function_selector, args)
}

pub unconstrained fn assert_private_call_fails(
    target_address: AztecAddress,
    function_selector: FunctionSelector,
    argsHash: Field,
    sideEffectsCounter: Field,
    isStaticCall: bool,
) {
    oracle_assert_private_call_fails(
        target_address,
        function_selector,
        argsHash,
        sideEffectsCounter,
        isStaticCall,
    )
}

#[oracle(reset)]
unconstrained fn oracle_reset() {}

#[oracle(setContractAddress)]
unconstrained fn oracle_set_contract_address(address: AztecAddress) {}

#[oracle(getSideEffectsCounter)]
unconstrained fn oracle_get_side_effects_counter() -> u32 {}

#[oracle(advanceBlocksBy)]
unconstrained fn oracle_advance_blocks_by(blocks: u32) {}

#[oracle(getPrivateContextInputs)]
unconstrained fn oracle_get_private_context_inputs(
    historical_block_number: u32,
) -> PrivateContextInputs {}

#[oracle(deploy)]
unconstrained fn oracle_deploy<let N: u32, let M: u32, let P: u32>(
    path: str<N>,
    name: str<M>,
    initializer: str<P>,
    args: [Field],
    public_keys_hash: Field,
) -> [Field; CONTRACT_INSTANCE_LENGTH] {}

#[oracle(directStorageWrite)]
unconstrained fn direct_storage_write_oracle<let N: u32>(
    _contract_address: AztecAddress,
    _storage_slot: Field,
    _values: [Field; N],
) -> [Field; N] {}

#[oracle(createAccount)]
unconstrained fn oracle_create_account() -> TestAccount {}

#[oracle(addAccount)]
unconstrained fn oracle_add_account(secret: Field) -> TestAccount {}

#[oracle(deriveKeys)]
unconstrained fn oracle_derive_keys(secret: Field) -> PublicKeys {}

#[oracle(addAuthWitness)]
unconstrained fn orable_add_authwit(address: AztecAddress, message_hash: Field) {}

#[oracle(assertPublicCallFails)]
unconstrained fn oracle_assert_public_call_fails(
    target_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field],
) {}

#[oracle(assertPrivateCallFails)]
unconstrained fn oracle_assert_private_call_fails(
    target_address: AztecAddress,
    function_selector: FunctionSelector,
    argsHash: Field,
    sideEffectsCounter: Field,
    isStaticCall: bool,
) {}
