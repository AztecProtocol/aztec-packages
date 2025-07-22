use crate::{context::inputs::PrivateContextInputs, test::helpers::utils::TestAccount};

use protocol_types::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::CONTRACT_INSTANCE_LENGTH,
    contract_instance::ContractInstance,
    public_keys::PublicKeys,
    traits::{Deserialize, ToField},
    utils::reader::Reader,
};

pub unconstrained fn deploy<let N: u32, let M: u32, let P: u32>(
    path: str<N>,
    name: str<M>,
    initializer: str<P>,
    args: [Field],
    secret: Field,
) -> ContractInstance {
    let instance_fields = deploy_oracle(path, name, initializer, args, secret);
    ContractInstance::deserialize(instance_fields)
}

pub unconstrained fn direct_storage_write<let N: u32>(
    contract_address: AztecAddress,
    storage_slot: Field,
    fields: [Field; N],
) {
    let _hash = direct_storage_write_oracle(contract_address, storage_slot, fields);
}

pub unconstrained fn private_call_new_flow(
    from: AztecAddress,
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field],
    args_hash: Field,
    is_static_call: bool,
) -> (u32, Field, Field) {
    let fields = private_call_new_flow_oracle(
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

    let fields = public_call_new_flow_oracle(from, contract_address, calldata, is_static_call);

    let mut reader = Reader::new(fields);
    let returns_hash = reader.read();
    let tx_hash = reader.read();

    (returns_hash, tx_hash)
}

#[oracle(getLastBlockTimestamp)]
pub unconstrained fn get_last_block_timestamp() -> u64 {}

#[oracle(setContractAddress)]
pub unconstrained fn set_contract_address(address: AztecAddress) {}

#[oracle(getContractAddress)]
pub unconstrained fn get_contract_address() -> AztecAddress {}

#[oracle(getSideEffectsCounter)]
pub unconstrained fn get_side_effects_counter() -> u32 {}

#[oracle(advanceBlocksBy)]
pub unconstrained fn advance_blocks_by(blocks: u32) {}

#[oracle(advanceTimestampBy)]
pub unconstrained fn advance_timestamp_by(duration: u64) {}

#[oracle(getPrivateContextInputs)]
pub unconstrained fn get_private_context_inputs(
    historical_block_number: Option<u32>,
) -> PrivateContextInputs {}

#[oracle(deploy)]
pub unconstrained fn deploy_oracle<let N: u32, let M: u32, let P: u32>(
    path: str<N>,
    name: str<M>,
    initializer: str<P>,
    args: [Field],
    secret: Field,
) -> [Field; CONTRACT_INSTANCE_LENGTH] {}

#[oracle(directStorageWrite)]
pub unconstrained fn direct_storage_write_oracle<let N: u32>(
    _contract_address: AztecAddress,
    _storage_slot: Field,
    _values: [Field; N],
) -> [Field; N] {}

#[oracle(createAccount)]
pub unconstrained fn create_account(secret: Field) -> TestAccount {}

#[oracle(addAccount)]
pub unconstrained fn add_account(secret: Field) -> TestAccount {}

#[oracle(deriveKeys)]
pub unconstrained fn derive_keys(secret: Field) -> PublicKeys {}

#[oracle(addAuthWitness)]
pub unconstrained fn add_authwit(address: AztecAddress, message_hash: Field) {}

#[oracle(assertPublicCallFails)]
pub unconstrained fn assert_public_call_fails(
    target_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field],
) {}

#[oracle(assertPrivateCallFails)]
pub unconstrained fn assert_private_call_fails(
    target_address: AztecAddress,
    function_selector: FunctionSelector,
    argsHash: Field,
    sideEffectsCounter: Field,
    isStaticCall: bool,
) {}

#[oracle(privateCallNewFlow)]
unconstrained fn private_call_new_flow_oracle(
    _from: AztecAddress,
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args: [Field],
    _args_hash: Field,
    _is_static_call: bool,
) -> [Field; 3] {}

#[oracle(publicCallNewFlow)]
unconstrained fn public_call_new_flow_oracle(
    from: AztecAddress,
    contract_address: AztecAddress,
    calldata: [Field],
    is_static_call: bool,
) -> [Field; 2] {}

#[oracle(enableContextChecks)]
pub unconstrained fn enable_context_checks() {}

#[oracle(setTopLevelTXEContext)]
pub unconstrained fn set_top_level_txe_context() {}

#[oracle(setPrivateTXEContext)]
pub unconstrained fn set_private_txe_context() {}

#[oracle(setPublicTXEContext)]
pub unconstrained fn set_public_txe_context() {}

#[oracle(setUtilityTXEContext)]
pub unconstrained fn set_utility_txe_context() {}
