use crate::{context::inputs::PrivateContextInputs, test::helpers::utils::TestAccount};

use protocol_types::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::CONTRACT_INSTANCE_LENGTH,
    contract_instance::ContractInstance,
    traits::{Deserialize, ToField},
    utils::reader::Reader,
};

pub unconstrained fn deploy<let N: u32, let P: u32>(
    path: str<N>,
    initializer: str<P>,
    args: [Field],
    secret: Field,
) -> ContractInstance {
    let instance_fields = deploy_oracle(path, initializer, args, secret);
    ContractInstance::deserialize(instance_fields)
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

#[oracle(txeGetLastBlockTimestamp)]
pub unconstrained fn get_last_block_timestamp() -> u64 {}

#[oracle(txeAdvanceBlocksBy)]
pub unconstrained fn advance_blocks_by(blocks: u32) {}

#[oracle(txeAdvanceTimestampBy)]
pub unconstrained fn advance_timestamp_by(duration: u64) {}

#[oracle(txeDeploy)]
pub unconstrained fn deploy_oracle<let N: u32, let P: u32>(
    path: str<N>,
    initializer: str<P>,
    args: [Field],
    secret: Field,
) -> [Field; CONTRACT_INSTANCE_LENGTH] {}

#[oracle(txeCreateAccount)]
pub unconstrained fn create_account(secret: Field) -> TestAccount {}

#[oracle(txeAddAccount)]
pub unconstrained fn add_account(secret: Field) -> TestAccount {}

#[oracle(txeAddAuthWitness)]
pub unconstrained fn add_authwit(address: AztecAddress, message_hash: Field) {}

#[oracle(txePrivateCallNewFlow)]
unconstrained fn private_call_new_flow_oracle(
    _from: AztecAddress,
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args: [Field],
    _args_hash: Field,
    _is_static_call: bool,
) -> [Field; 3] {}

#[oracle(txePublicCallNewFlow)]
unconstrained fn public_call_new_flow_oracle(
    from: AztecAddress,
    contract_address: AztecAddress,
    calldata: [Field],
    is_static_call: bool,
) -> [Field; 2] {}

#[oracle(txeSetTopLevelTXEContext)]
pub unconstrained fn set_top_level_txe_context() {}

#[oracle(txeSetPrivateTXEContext)]
pub unconstrained fn set_private_txe_context(
    contract_address: Option<AztecAddress>,
    historical_block_number: Option<u32>,
) -> PrivateContextInputs {}

#[oracle(txeSetPublicTXEContext)]
pub unconstrained fn set_public_txe_context(contract_address: Option<AztecAddress>) {}

#[oracle(txeSetUtilityTXEContext)]
pub unconstrained fn set_utility_txe_context(contract_address: Option<AztecAddress>) {}
