use crate::{
    context::inputs::PrivateContextInputs, event::event_selector::EventSelector,
    test::helpers::utils::TestAccount,
};

use protocol_types::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::{
        CONTRACT_INSTANCE_LENGTH, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX,
        NULL_MSG_SENDER_CONTRACT_ADDRESS,
    },
    contract_instance::ContractInstance,
    traits::{Deserialize, ToField},
};

global MAX_PRIVATE_EVENTS_PER_TXE_QUERY: u32 = 5;
global MAX_EVENT_SERIALIZATION_LENGTH: u32 = 12;

pub unconstrained fn deploy<let M: u32, let N: u32, let P: u32>(
    path: str<N>,
    initializer: str<P>,
    args: [Field; M],
    secret: Field,
) -> ContractInstance {
    let instance_fields = deploy_oracle(path, initializer, args, secret);
    ContractInstance::deserialize(instance_fields)
}

pub unconstrained fn private_call_new_flow<let M: u32, let N: u32>(
    from: AztecAddress,
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field; M],
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

pub unconstrained fn public_call_new_flow<let M: u32, let N: u32>(
    from: Option<AztecAddress>,
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field; M],
    is_static_call: bool,
) -> [Field; N] {
    let calldata = [function_selector.to_field()].concat(args);

    let from = from.unwrap_or(NULL_MSG_SENDER_CONTRACT_ADDRESS);

    public_call_new_flow_oracle(from, contract_address, calldata, is_static_call)
}

pub unconstrained fn simulate_utility_function<let M: u32, let N: u32>(
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field; M],
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

#[oracle(txeGetDefaultAddress)]
pub unconstrained fn get_default_address() -> AztecAddress {}

// experimental
pub(crate) unconstrained fn get_private_events(
    selector: EventSelector,
    contract_address: AztecAddress,
    scope: AztecAddress,
    ) -> BoundedVec<BoundedVec<Field, MAX_EVENT_SERIALIZATION_LENGTH>, MAX_PRIVATE_EVENTS_PER_TXE_QUERY> {
    // This is a workaround as Noir does not currently let us return nested structs with arrays. We instead return a raw
    // multidimensional array in get_private_events_oracle and create the BoundedVecs here.

    let (raw_array_storage, event_lengths, query_length) =
        get_private_events_oracle(selector, contract_address, scope);

    let mut events = BoundedVec::new();
    for i in 0..query_length {
        events.push(BoundedVec::from_parts(raw_array_storage[i], event_lengths[i]));
    }

    events
}

#[oracle(txeGetPrivateEvents)]
unconstrained fn get_private_events_oracle(
    selector: EventSelector,
    contract_address: AztecAddress,
    scope: AztecAddress,
    ) -> ([[Field; MAX_EVENT_SERIALIZATION_LENGTH]; MAX_PRIVATE_EVENTS_PER_TXE_QUERY], [u32; MAX_PRIVATE_EVENTS_PER_TXE_QUERY], u32) {}

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
unconstrained fn private_call_new_flow_oracle<let M: u32, let N: u32>(
    _from: AztecAddress,
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args: [Field; M],
    _args_hash: Field,
    _is_static_call: bool,
) -> [Field; N] {}

#[oracle(txePublicCallNewFlow)]
unconstrained fn public_call_new_flow_oracle<let M: u32, let N: u32>(
    from: AztecAddress,
    contract_address: AztecAddress,
    calldata: [Field; M],
    is_static_call: bool,
) -> [Field; N] {}

#[oracle(txeSimulateUtilityFunction)]
unconstrained fn simulate_utility_function_oracle<let M: u32, let N: u32>(
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field; M],
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
