mod multisig_note;
mod capsule;

use dep::protocol_circuits::{grumpkin_point::GrumpkinPoint};
use dep::protocol_circuits::grumpkin_private_key::GrumpkinPrivateKey;
use dep::std::{cmp::Eq, grumpkin_scalar::GrumpkinScalar, grumpkin_scalar_mul::grumpkin_fixed_base};

fn compute_public_key(private_key: Field) -> GrumpkinPoint {
    let (low, high) = dep::std::field::bn254::decompose(private_key);
    let public_key = grumpkin_fixed_base(GrumpkinScalar { high, low });
    GrumpkinPoint { x: public_key[0], y: public_key[1] }
}

contract MultiSigAccount {
    use dep::aztec::protocol_types::{abis::call_context::CallContext, address::AztecAddress, abis::function_selector::FunctionSelector};
    use crate::compute_public_key;

    use dep::aztec::{
        context::{PrivateContext, PublicContext, Context},
        note::{note_header::NoteHeader, utils as note_utils}, oracle::get_public_key::get_public_key,
        state_vars::singleton::Singleton,
        oracle::debug_log::{debug_log_format, debug_log_array_with_prefix}
    };
    use dep::authwit::{
        auth::{IS_VALID_SELECTOR, assert_valid_authwit}, entrypoint::{app::AppPayload, fee::FeePayload},
        account::AccountActions, auth_witness::get_auth_witness
    };

    use crate::multisig_note::{MultiSigNote, MAX_MULTISIG_OWNERS};
    use crate::capsule::pop_capsule;
    use dep::std::{cmp::Eq, grumpkin_scalar::GrumpkinScalar, grumpkin_scalar_mul::grumpkin_fixed_base};

    struct Storage {
        // Warning: this will be nullified on every read.
        // There are alternatives: ImmutableSingleton, Slow update trees.
        state: Singleton<MultiSigNote>,
    }

    global ACCOUNT_ACTIONS_STORAGE_SLOT = 2;

    #[aztec(private)]
    fn constructor(owners: [AztecAddress; MAX_MULTISIG_OWNERS], private_key: Field, threshold: u8) {
        let contract_address = context.this_address();
        assert(
            compute_public_key(private_key).eq(get_public_key(contract_address)), "Mismatching private key"
        );
        let mut note = MultiSigNote::new(owners, private_key, threshold, contract_address);
        storage.state.initialize(&mut note, /*broadcast=*/ true);
    }

    #[aztec(private)]
    fn entrypoint(app_payload: pub AppPayload, fee_payload: pub FeePayload) {
        // We make an external call to is_valid instead of an internal one to create a new
        // function call frame, otherwise all the is_valid calls to the owners' account contracts
        // for authorizing the app and fee payload would get done from the same frame, along with
        // the ones from the payloads, which would go over the limit of 4 calls per frame.
        // We should roll back to using the default implementation from AccountActions once
        // we bump that limit.
        // To make things worse, we cannot call is_valid twice because of a bug in the private simulator
        // where we cannot get the same singleton note twice in the same tx. So we extract the logic
        // to a "collect_auths" internal method that receives the state, which we read from the caller.
        let collect_auths_selector = FunctionSelector::from_signature("collect_auths(Field,[(Field);5],u8)");
        let this = context.this_address();
        let storage = Storage::init(Context::private(&mut context));
        let state = storage.state.get_note(/*broadcast=*/ true);
        let owners = state.owners;
        let threshold = state.threshold;

        debug_log_format(
            "MultisigAccount.entrypoint fee_payload_hash={0} fee_payload_len={1}",
            [fee_payload.hash(), fee_payload.function_calls.len()]
        );
        let fee_auths = context.call_private_function(
            this,
            collect_auths_selector,
            [
            fee_payload.hash(), owners[0].to_field(), owners[1].to_field(), owners[2].to_field(), owners[3].to_field(), owners[4].to_field(), threshold as Field
        ]
        )[0] as u8;
        assert(fee_auths >= threshold, "Fee payload not authorized by multisig owners");
        fee_payload.execute_calls(&mut context);
        context.capture_max_non_revertible_side_effect_counter();

        debug_log_format(
            "MultisigAccount.entrypoint app_payload_hash={0} app_payload_len={1}",
            [app_payload.hash(), app_payload.function_calls.len()]
        );
        let app_auths = context.call_private_function(
            this,
            collect_auths_selector,
            [
            app_payload.hash(), owners[0].to_field(), owners[1].to_field(), owners[2].to_field(), owners[3].to_field(), owners[4].to_field(), threshold as Field
        ]
        )[0] as u8;
        assert(app_auths >= threshold, "App payload not authorized by multisig owners");
        app_payload.execute_calls(&mut context);
        debug_log_format("MultisigAccount.entrypoint successfully finished", []);
    }

    #[aztec(private)]
    fn is_valid(message_hash: Field) -> Field {
        let actions = AccountActions::private(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.is_valid(message_hash)
    }

    #[aztec(public)]
    fn is_valid_public(message_hash: Field) -> Field {
        let actions = AccountActions::public(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.is_valid_public(message_hash)
    }

    #[aztec(public)]
    internal fn set_is_valid_storage(message_hash: Field, value: bool) {
        let actions = AccountActions::public(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.internal_set_is_valid_storage(message_hash, value)
    }

    #[aztec(private)]
    internal fn collect_auths(
        message_field: Field,
        owners: [AztecAddress; MAX_MULTISIG_OWNERS],
        threshold: u8
    ) -> u8 {
        collect_auths_impl(&mut context, message_field, owners, threshold)
    }

    // add owners
    #[aztec(private)]
    fn add_owner(new_owner: AztecAddress) {
        // Safeguard mimicking the "internal" keyword which we cannot use here.
        assert(context.this_address().eq(context.msg_sender()));

        let storage = Storage::init(Context::private(&mut context));
        let state = storage.state.get_note(/*broadcast=*/ true);
        let mut pos : u8 = MAX_MULTISIG_OWNERS as u8;
        for i in 1..MAX_MULTISIG_OWNERS {
            if (state.owners[i].eq(AztecAddress::zero()) & !state.owners[i - 1].eq(AztecAddress::zero())) {
                pos = i as u8;
            }
        }

        if (state.owners[0].eq(AztecAddress::zero())) {
            pos = 0;
        }

        assert(pos < MAX_MULTISIG_OWNERS as u8);

        let mut new_owners: [AztecAddress; MAX_MULTISIG_OWNERS] = state.owners;
        new_owners[pos] = new_owner;
        let mut new_note: MultiSigNote = MultiSigNote::new(
            new_owners,
            state.private_key,
            state.threshold,
            state.contract_address
        );
        storage.state.replace(&mut new_note, /*broadcast*/ true);
    }

    #[contract_library_method]
    fn is_valid_impl(context: &mut PrivateContext, message_field: Field) -> bool {
        debug_log_format(
            "MultisigAccount.is_valid_impl message_field={0}",
            [message_field]
        );
        let storage = Storage::init(Context::private(context));
        let state = storage.state.get_note(/*broadcast=*/ true);

        let auths_collected = collect_auths_impl(context, message_field, state.owners, state.threshold);
        debug_log_format(
            "MultisigAccount.is_valid_impl auths_collected={0}",
            [auths_collected as Field]
        );
        auths_collected >= state.threshold
    }

    #[contract_library_method]
    fn collect_auths_impl(
        context: &mut PrivateContext,
        message_field: Field,
        owners: [AztecAddress; MAX_MULTISIG_OWNERS],
        threshold: u8
    ) -> u8 {
        let is_valid_selector = FunctionSelector::from_field(IS_VALID_SELECTOR);

        let mut auths_collected : u8 = 0;
        for owner in owners {
            if (!owner.is_zero()) & (auths_collected < threshold) {
                let message_field_for_owner = dep::aztec::protocol_types::hash::pedersen_hash([message_field, owner.to_field()], 0);
                debug_log_format(
                    "MultisigAccount.is_valid_impl owner={0} message_field_for_owner={1}",
                    [owner.to_field(), message_field_for_owner]
                );
                let result = context.call_private_function(owner, is_valid_selector, [message_field_for_owner])[0];
                if result == IS_VALID_SELECTOR {
                    auths_collected += 1;
                }
                debug_log_format(
                    "MultisigAccount.is_valid_impl owner={0} result={1}, auths_collected={2}",
                    [owner.to_field(), result as Field, auths_collected as Field]
                );
            }
        }
        auths_collected
    }
}
