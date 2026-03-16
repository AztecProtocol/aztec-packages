use crate::{context::inputs::PrivateContextInputs, event::EventSelector, test::helpers::utils::TestAccount};

use crate::protocol::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::{
        CONTRACT_INSTANCE_LENGTH, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, NULL_MSG_SENDER_CONTRACT_ADDRESS,
    },
    contract_instance::ContractInstance,
    traits::{Deserialize, ToField},
};

global MAX_PRIVATE_EVENTS_PER_TXE_QUERY: u32 = 5;
global MAX_EVENT_SERIALIZATION_LENGTH: u32 = 10;

pub unconstrained fn deploy<let M: u32, let N: u32, let P: u32>(
    path: str<N>,
    initializer: str<P>,
    args: [Field; M],
    secret: Field,
    salt: Field,
    deployer: AztecAddress,
) -> ContractInstance {
    let instance_fields = deploy_oracle(path, initializer, args, secret, salt, deployer);
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

pub unconstrained fn execute_utility_function<let M: u32, let N: u32>(
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field; M],
) -> [Field; N] {
    execute_utility_function_oracle(contract_address, function_selector, args)
}

#[oracle(aztec_txe_getNextBlockNumber)]
pub unconstrained fn get_next_block_number() -> u32 {}

#[oracle(aztec_txe_getNextBlockTimestamp)]
pub unconstrained fn get_next_block_timestamp() -> u64 {}

#[oracle(aztec_txe_getLastBlockTimestamp)]
pub unconstrained fn get_last_block_timestamp() -> u64 {}

#[oracle(aztec_txe_getLastTxEffects)]
pub unconstrained fn get_last_tx_effects() -> (Field, BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>, BoundedVec<Field, MAX_NULLIFIERS_PER_TX>) {}

#[oracle(aztec_txe_getDefaultAddress)]
pub unconstrained fn get_default_address() -> AztecAddress {}

// experimental
pub(crate) unconstrained fn get_private_events(
    selector: EventSelector,
    contract_address: AztecAddress,
    scope: AztecAddress,
) -> BoundedVec<BoundedVec<Field, MAX_EVENT_SERIALIZATION_LENGTH>, MAX_PRIVATE_EVENTS_PER_TXE_QUERY> {
    // This is a workaround as Noir does not currently let us return nested structs with arrays. We instead return a
    // raw multidimensional array in get_private_events_oracle and create the BoundedVecs here.

    let (raw_array_storage, event_lengths, query_length) = get_private_events_oracle(selector, contract_address, scope);

    let mut events = BoundedVec::new();
    for i in 0..query_length {
        events.push(BoundedVec::from_parts(raw_array_storage[i], event_lengths[i]));
    }

    events
}

#[oracle(aztec_txe_getPrivateEvents)]
unconstrained fn get_private_events_oracle(
    selector: EventSelector,
    contract_address: AztecAddress,
    scope: AztecAddress,
    ) -> ([[Field; MAX_EVENT_SERIALIZATION_LENGTH]; MAX_PRIVATE_EVENTS_PER_TXE_QUERY], [u32; MAX_PRIVATE_EVENTS_PER_TXE_QUERY], u32) {}

#[oracle(aztec_txe_advanceBlocksBy)]
pub unconstrained fn advance_blocks_by(blocks: u32) {}

#[oracle(aztec_txe_advanceTimestampBy)]
pub unconstrained fn advance_timestamp_by(duration: u64) {}

#[oracle(aztec_txe_deploy)]
pub unconstrained fn deploy_oracle<let N: u32, let P: u32>(
    path: str<N>,
    initializer: str<P>,
    args: [Field],
    secret: Field,
    salt: Field,
    deployer: AztecAddress,
) -> [Field; CONTRACT_INSTANCE_LENGTH] {}

#[oracle(aztec_txe_createAccount)]
pub unconstrained fn create_account(secret: Field) -> TestAccount {}

#[oracle(aztec_txe_addAccount)]
pub unconstrained fn add_account(secret: Field) -> TestAccount {}

#[oracle(aztec_txe_addAuthWitness)]
pub unconstrained fn add_authwit(address: AztecAddress, message_hash: Field) {}

#[oracle(aztec_txe_privateCallNewFlow)]
unconstrained fn private_call_new_flow_oracle<let M: u32, let N: u32>(
    _from: AztecAddress,
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args: [Field; M],
    _args_hash: Field,
    _is_static_call: bool,
) -> [Field; N] {}

#[oracle(aztec_txe_publicCallNewFlow)]
unconstrained fn public_call_new_flow_oracle<let M: u32, let N: u32>(
    from: AztecAddress,
    contract_address: AztecAddress,
    calldata: [Field; M],
    is_static_call: bool,
) -> [Field; N] {}

#[oracle(aztec_txe_executeUtilityFunction)]
unconstrained fn execute_utility_function_oracle<let M: u32, let N: u32>(
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field; M],
) -> [Field; N] {}

#[oracle(aztec_txe_setTopLevelTXEContext)]
pub unconstrained fn set_top_level_txe_context() {}

#[oracle(aztec_txe_setPrivateTXEContext)]
pub unconstrained fn set_private_txe_context(
    contract_address: Option<AztecAddress>,
    anchor_block_number: Option<u32>,
) -> PrivateContextInputs {}

#[oracle(aztec_txe_setPublicTXEContext)]
pub unconstrained fn set_public_txe_context(contract_address: Option<AztecAddress>) {}

#[oracle(aztec_txe_setUtilityTXEContext)]
pub unconstrained fn set_utility_txe_context(contract_address: Option<AztecAddress>) {}
