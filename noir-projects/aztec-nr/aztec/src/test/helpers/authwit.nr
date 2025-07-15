use crate::{
    authwit::auth::{compute_authwit_message_hash, compute_inner_authwit_hash, set_authorized},
    context::{call_interfaces::CallInterface, public_context::PublicContext},
    hash::hash_args,
    oracle::execution::get_contract_address,
    test::helpers::txe_oracles,
};

use protocol_types::{address::AztecAddress, traits::ToField};

pub unconstrained fn add_private_authwit_from_call_interface<C, let M: u32>(
    on_behalf_of: AztecAddress,
    caller: AztecAddress,
    call_interface: C,
)
where
    C: CallInterface<M>,
{
    let target = call_interface.get_contract_address();
    let inputs = txe_oracles::get_private_context_inputs(Option::none());
    let chain_id = inputs.tx_context.chain_id;
    let version = inputs.tx_context.version;
    let args_hash = hash_args(call_interface.get_args());
    let selector = call_interface.get_selector();
    let inner_hash =
        compute_inner_authwit_hash([caller.to_field(), selector.to_field(), args_hash]);
    let message_hash = compute_authwit_message_hash(target, chain_id, version, inner_hash);
    txe_oracles::add_authwit(on_behalf_of, message_hash);
}

pub unconstrained fn add_public_authwit_from_call_interface<C, let M: u32>(
    on_behalf_of: AztecAddress,
    caller: AztecAddress,
    call_interface: C,
)
where
    C: CallInterface<M>,
{
    let current_contract = get_contract_address();
    txe_oracles::set_contract_address(on_behalf_of);
    let target = call_interface.get_contract_address();
    let inputs = txe_oracles::get_private_context_inputs(Option::none());
    let chain_id = inputs.tx_context.chain_id;
    let version = inputs.tx_context.version;
    let args_hash = hash_args(call_interface.get_args());
    let selector = call_interface.get_selector();
    let inner_hash =
        compute_inner_authwit_hash([caller.to_field(), selector.to_field(), args_hash]);
    let message_hash = compute_authwit_message_hash(target, chain_id, version, inner_hash);
    let mut context = PublicContext::new(|| panic(f"Provide args hash manually"));
    context.args_hash = Option::some(args_hash);
    set_authorized(&mut context, message_hash, true);
    txe_oracles::set_contract_address(current_contract);
}
