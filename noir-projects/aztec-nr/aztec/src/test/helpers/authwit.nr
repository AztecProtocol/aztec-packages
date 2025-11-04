use crate::{
    authwit::auth::{compute_authwit_message_hash, compute_inner_authwit_hash},
    context::call_interfaces::{CallInterface, PublicCallInterface},
    hash::hash_args,
    test::helpers::{test_environment::TestEnvironment, txe_oracles},
};

use protocol_types::{
    abis::function_selector::FunctionSelector, address::AztecAddress,
    constants::CANONICAL_AUTH_REGISTRY_ADDRESS, traits::ToField,
};

pub unconstrained fn add_private_authwit_from_call_interface<C, let M: u32>(
    env: TestEnvironment,
    on_behalf_of: AztecAddress,
    caller: AztecAddress,
    call_interface: C,
)
where
    C: CallInterface<M>,
{
    // The creation of this utility context results in the TXE session needing to keep track of authwits over its
    // lifetime, as we'd otherwise be unable to store more than one authwit due to them getting reset when restoring the
    // top-level TXE context.
    // Ideally authwits would be passed alongside a contract call instead of pre-seeded.
    let (chain_id, version) =
        env.utility_context(|context| (context.chain_id(), context.version()));

    let target = call_interface.get_contract_address();
    let args_hash = hash_args(call_interface.get_args());
    let selector = call_interface.get_selector();
    let inner_hash =
        compute_inner_authwit_hash([caller.to_field(), selector.to_field(), args_hash]);
    let message_hash = compute_authwit_message_hash(target, chain_id, version, inner_hash);
    txe_oracles::add_authwit(on_behalf_of, message_hash);
}

pub unconstrained fn add_public_authwit_from_call_interface<C, let M: u32>(
    env: TestEnvironment,
    on_behalf_of: AztecAddress,
    caller: AztecAddress,
    call_interface: C,
)
where
    C: CallInterface<M>,
{
    let (chain_id, version) =
        env.utility_context(|context| (context.chain_id(), context.version()));

    let target = call_interface.get_contract_address();
    let args_hash = hash_args(call_interface.get_args());
    let selector = call_interface.get_selector();
    let inner_hash =
        compute_inner_authwit_hash([caller.to_field(), selector.to_field(), args_hash]);
    let message_hash = compute_authwit_message_hash(target, chain_id, version, inner_hash);

    env.call_public(
        on_behalf_of,
        PublicCallInterface::<_, ()>::new(
            CANONICAL_AUTH_REGISTRY_ADDRESS,
            comptime { FunctionSelector::from_signature("set_authorized(Field,bool)") },
            "set_authorized",
            [message_hash, true as Field].as_slice(),
            false,
        ),
    );
}
