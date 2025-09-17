use crate::{context::inputs::PrivateContextInputs, test::helpers::utils::TestAccount};

use protocol_types::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::{CONTRACT_INSTANCE_LENGTH, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX},
    contract_instance::ContractInstance,
    traits::{Deserialize, ToField},
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

pub unconstrained fn private_call_new_flow<let N: u32>(
    from: AztecAddress,
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field],
    args_hash: Field,
    is_static_call: bool,
) -> [Field; N] {
    private_call_new_flow_oracle(
        from,
        contract_address,
        function_selector,
        args,
        args_hash,
        is_static_call,
    )
}

pub unconstrained fn public_call_new_flow<let N: u32>(
    from: AztecAddress,
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field],
    is_static_call: bool,
) -> [Field; N] {
    let calldata = args.push_front(function_selector.to_field());
    public_call_new_flow_oracle(from, contract_address, calldata, is_static_call)
}

pub unconstrained fn simulate_utility_function<let N: u32>(
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field],
) -> [Field; N] {
    simulate_utility_function_oracle(contract_address, function_selector, args)
}

#[oracle(txeGetNextBlockNumber)]
pub unconstrained fn get_next_block_number() -> u32 {}

#[oracle(txeGetNextBlockTimestamp)]
pub unconstrained fn get_next_block_timestamp() -> u64 {}

#[oracle(txeGetLastBlockTimestamp)]
pub unconstrained fn get_last_block_timestamp() -> u64 {}

#[oracle(txeGetLastTxEffects)]
pub unconstrained fn get_last_tx_effects() -> (Field, BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>, BoundedVec<Field, MAX_NULLIFIERS_PER_TX>) {}

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
unconstrained fn private_call_new_flow_oracle<let N: u32>(
    _from: AztecAddress,
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args: [Field],
    _args_hash: Field,
    _is_static_call: bool,
) -> [Field; N] {}

#[oracle(txePublicCallNewFlow)]
unconstrained fn public_call_new_flow_oracle<let N: u32>(
    from: AztecAddress,
    contract_address: AztecAddress,
    calldata: [Field],
    is_static_call: bool,
) -> [Field; N] {}

#[oracle(txeSimulateUtilityFunction)]
unconstrained fn simulate_utility_function_oracle<let N: u32>(
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field],
) -> [Field; N] {}

#[oracle(txeSetTopLevelTXEContext)]
pub unconstrained fn set_top_level_txe_context() {}

#[oracle(txeSetPrivateTXEContext)]
pub unconstrained fn set_private_txe_context(
    contract_address: Option<AztecAddress>,
    anchor_block_number: Option<u32>,
) -> PrivateContextInputs {}

#[oracle(txeSetPublicTXEContext)]
pub unconstrained fn set_public_txe_context(contract_address: Option<AztecAddress>) {}

#[oracle(txeSetUtilityTXEContext)]
pub unconstrained fn set_utility_txe_context(contract_address: Option<AztecAddress>) {}
