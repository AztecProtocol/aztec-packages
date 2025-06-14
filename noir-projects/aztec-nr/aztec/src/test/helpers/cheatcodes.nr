use crate::context::inputs::PrivateContextInputs;
use crate::test::helpers::utils::TestAccount;
use dep::protocol_types::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::CONTRACT_INSTANCE_LENGTH,
    contract_instance::ContractInstance,
    public_keys::PublicKeys,
    traits::{Deserialize, ToField},
    utils::reader::Reader,
};

pub unconstrained fn reset() {
    oracle_reset();
}

pub unconstrained fn get_side_effects_counter() -> u32 {
    oracle_get_side_effects_counter()
}

pub unconstrained fn get_contract_address() -> AztecAddress {
    oracle_get_contract_address()
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
    secret: Field,
) -> ContractInstance {
    let instance_fields = oracle_deploy(path, name, initializer, args, secret);
    ContractInstance::deserialize(instance_fields)
}

pub unconstrained fn direct_storage_write<let N: u32>(
    contract_address: AztecAddress,
    storage_slot: Field,
    fields: [Field; N],
) {
    let _hash = direct_storage_write_oracle(contract_address, storage_slot, fields);
}

pub unconstrained fn create_account(secret: Field) -> TestAccount {
    oracle_create_account(secret)
}

pub unconstrained fn add_account(secret: Field) -> TestAccount {
    oracle_add_account(secret)
}

pub unconstrained fn derive_keys(secret: Field) -> PublicKeys {
    oracle_derive_keys(secret)
}

pub unconstrained fn add_authwit(address: AztecAddress, message_hash: Field) {
    oracle_add_authwit(address, message_hash)
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

pub unconstrained fn private_call_new_flow(
    from: AztecAddress,
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field],
    args_hash: Field,
    is_static_call: bool,
) -> (u32, Field, Field) {
    let fields = oracle_private_call_new_flow(
        from,
        contract_address,
        function_selector,
        args,
        args_hash,
        is_static_call,
    );

    let mut reader = Reader::new(fields);
    let end_side_effect_counter = reader.read_u32();
    let returns_hash = reader.read();
    let tx_hash = reader.read();

    (end_side_effect_counter, returns_hash, tx_hash)
}

pub unconstrained fn public_call_new_flow(
    from: AztecAddress,
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field],
    is_static_call: bool,
) -> (Field, Field) {
    let calldata = args.push_front(function_selector.to_field());

    let fields = oracle_public_call_new_flow(from, contract_address, calldata, is_static_call);

    let mut reader = Reader::new(fields);
    let returns_hash = reader.read();
    let tx_hash = reader.read();

    (returns_hash, tx_hash)
}

pub unconstrained fn disable_oracles() {
    oracle_disable_oracles();
}

pub unconstrained fn enable_oracles() {
    oracle_enable_oracles();
}

#[oracle(reset)]
unconstrained fn oracle_reset() {}

#[oracle(setContractAddress)]
unconstrained fn oracle_set_contract_address(address: AztecAddress) {}

#[oracle(getContractAddress)]
unconstrained fn oracle_get_contract_address() -> AztecAddress {}

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
    secret: Field,
) -> [Field; CONTRACT_INSTANCE_LENGTH] {}

#[oracle(directStorageWrite)]
unconstrained fn direct_storage_write_oracle<let N: u32>(
    _contract_address: AztecAddress,
    _storage_slot: Field,
    _values: [Field; N],
) -> [Field; N] {}

#[oracle(createAccount)]
unconstrained fn oracle_create_account(secret: Field) -> TestAccount {}

#[oracle(addAccount)]
unconstrained fn oracle_add_account(secret: Field) -> TestAccount {}

#[oracle(deriveKeys)]
unconstrained fn oracle_derive_keys(secret: Field) -> PublicKeys {}

#[oracle(addAuthWitness)]
unconstrained fn oracle_add_authwit(address: AztecAddress, message_hash: Field) {}

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

#[oracle(privateCallNewFlow)]
unconstrained fn oracle_private_call_new_flow(
    _from: AztecAddress,
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args: [Field],
    _args_hash: Field,
    _is_static_call: bool,
) -> [Field; 3] {}

#[oracle(enableOracles)]
unconstrained fn oracle_disable_oracles() {}

#[oracle(disableOracles)]
unconstrained fn oracle_enable_oracles() {}

#[oracle(publicCallNewFlow)]
unconstrained fn oracle_public_call_new_flow(
    from: AztecAddress,
    contract_address: AztecAddress,
    calldata: [Field],
    is_static_call: bool,
) -> [Field; 2] {}
