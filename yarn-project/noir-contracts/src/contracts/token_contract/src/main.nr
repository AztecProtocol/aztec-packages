mod types;
mod account_interface;
mod util;

// Minimal token implementation that supports `AuthWit` accounts.
// The auth message follows a similar pattern to the cross-chain message and includes a designated caller.
// The designated caller is ALWAYS used here, and not based on a flag as cross-chain.
// message hash = H([caller, selector, , ...args])
// To be read as `caller` calls function defined by `selector` with `args`

contract Token {
    // Libs
    use dep::std::option::Option;

    use dep::safe_math::SafeU120;

    use dep::value_note::{
        balance_utils,
        utils::{increment, decrement},
        value_note::{VALUE_NOTE_LEN, ValueNoteMethods, ValueNote},
    };

    use dep::aztec::{
        note::{
            note_header::NoteHeader,
            utils as note_utils,
        },
        context::{PrivateContext, PublicContext},
        state_vars::{map::Map, public_state::PublicState, set::Set},
        types::type_serialisation::field_serialisation::{
            FieldSerialisationMethods, FIELD_SERIALISED_LEN,
        },
        oracle::compute_selector::compute_selector,
    };

    use crate::types::{AztecAddress, TransparentNote, TransparentNoteMethods, TRANSPARENT_NOTE_LEN};
    use crate::account_interface::AccountContract;
    use crate::util::compute_message_hash;

    

    struct Storage {
        admin: PublicState<Field, FIELD_SERIALISED_LEN>,
        minters: Map<PublicState<Field, FIELD_SERIALISED_LEN>>,
        balances: Map<Set<ValueNote, VALUE_NOTE_LEN>>,
        total_supply: PublicState<Field, FIELD_SERIALISED_LEN>,
        pending_shields: Set<TransparentNote, TRANSPARENT_NOTE_LEN>,
        public_balances: Map<PublicState<Field, FIELD_SERIALISED_LEN>>,
    }

    impl Storage {
        fn init(
            private_context: Option<&mut PrivateContext>,
            public_context: Option<&mut PublicContext>,
        ) -> pub Self {
            Storage {
                admin: PublicState::new(
                    private_context,
                    public_context,
                    1,
                    FieldSerialisationMethods,
                ),
                minters: Map::new(
                    private_context,
                    public_context,
                    2,
                    |private_context, public_context, slot| {
                        PublicState::new(
                            private_context,
                            public_context,
                            slot,
                            FieldSerialisationMethods,
                        )
                    },
                ),
                balances: Map::new(
                    private_context,
                    public_context,
                    3,
                    |private_context, public_context, slot| {
                        Set::new(private_context, public_context, slot, ValueNoteMethods)
                    },
                ),
                total_supply: PublicState::new(
                    private_context,
                    public_context,
                    4,
                    FieldSerialisationMethods,
                ),
                pending_shields: Set::new(private_context, public_context, 5, TransparentNoteMethods),
                public_balances: Map::new(
                    private_context,
                    public_context,
                    6,
                    |private_context, public_context, slot| {
                        PublicState::new(
                            private_context,
                            public_context,
                            slot,
                            FieldSerialisationMethods,
                        )
                    },
                ),
            }
        }
    }

    #[aztec(private)]
    fn constructor() {
        // Currently not possible to execute public calls from constructor as code not yet available to sequencer.
        // let selector = compute_selector("_initialize((Field))");
        // let _callStackItem = context.call_public_function(context.this_address(), selector, [context.msg_sender()]);
    }

    #[aztec(public)]
    fn set_admin(
        new_admin: AztecAddress,
    ) {
        let storage = Storage::init(Option::none(), Option::some(&mut context));
        assert(storage.admin.read() == context.msg_sender(), "caller is not admin");
        storage.admin.write(new_admin.address);
    }

    #[aztec(public)]
    fn set_minter(
        minter: AztecAddress,
        approve: Field,
    ) {
        assert((approve == 1) | (approve == 0), "not providing boolean");
        let storage = Storage::init(Option::none(), Option::some(&mut context));
        assert(storage.admin.read() == context.msg_sender(), "caller is not admin");
        storage.minters.at(minter.address).write(approve as Field);
    }

    #[aztec(public)]
    fn mint_pub(
        to: AztecAddress,
        amount: Field,
    ) -> Field {
        let storage = Storage::init(Option::none(), Option::some(&mut context));
        assert(storage.minters.at(context.msg_sender()).read() == 1, "caller is not minter");
        let amount = SafeU120::new(amount);
        let new_balance = SafeU120::new(storage.public_balances.at(to.address).read()).add(amount);
        let supply = SafeU120::new(storage.total_supply.read()).add(amount);

        storage.public_balances.at(to.address).write(new_balance.value as Field);
        storage.total_supply.write(supply.value as Field);
        1
    }

    #[aztec(public)]
    fn mint_priv(
        amount: Field,
        secret_hash: Field,
    ) -> Field {
        let storage = Storage::init(Option::none(), Option::some(&mut context));
        assert(storage.minters.at(context.msg_sender()).read() == 1, "caller is not minter");
        let pending_shields = storage.pending_shields;
        let mut note = TransparentNote::new(amount, secret_hash);
        let supply = SafeU120::new(storage.total_supply.read()).add(SafeU120::new(amount));

        storage.total_supply.write(supply.value as Field);
        pending_shields.insert_from_public(&mut note);
        1
    }

    #[aztec(public)]
    fn shield(
        from: AztecAddress,
        amount: Field,
        secret_hash: Field,
    ) -> Field {
        let storage = Storage::init(Option::none(), Option::some(&mut context));

        if (from.address != context.msg_sender()) {
            let selector = compute_selector("shield((Field),Field,Field)");
            let message_field = compute_message_hash([context.msg_sender(), selector, from.address, amount, secret_hash]);
            assert(AccountContract::at(from.address).is_valid(Option::none(), Option::some(context), message_field) == 0xe86ab4ff, "invalid call");
        }

        let amount = SafeU120::new(amount);
        let from_balance = SafeU120::new(storage.public_balances.at(from.address).read()).sub(amount);

        let pending_shields = storage.pending_shields;
        let mut note = TransparentNote::new(amount.value as Field, secret_hash);

        storage.public_balances.at(from.address).write(from_balance.value as Field);
        pending_shields.insert_from_public(&mut note);
        1
    }

    #[aztec(public)]
    fn transfer_public(
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
    ) -> Field {
        let storage = Storage::init(Option::none(), Option::some(&mut context));

        if (from.address != context.msg_sender()) {
            let selector = compute_selector("transfer_public((Field),(Field),Field)");
            let message_field = compute_message_hash([context.msg_sender(), selector, from.address, to.address, amount]);
            assert(AccountContract::at(from.address).is_valid(Option::none(), Option::some(context), message_field) == 0xe86ab4ff, "invalid call");
        }

        let amount = SafeU120::new(amount);
        let from_balance = SafeU120::new(storage.public_balances.at(from.address).read()).sub(amount);
        storage.public_balances.at(from.address).write(from_balance.value as Field);

        let to_balance = SafeU120::new(storage.public_balances.at(to.address).read()).add(amount);
        storage.public_balances.at(to.address).write(to_balance.value as Field);
    }

    #[aztec(private)]
    fn redeem_shield(
        to: AztecAddress,
        amount: Field,
        secret: Field,
    ) -> Field {
        // @todo @lherskind consider Altering the value note as well to be safemath
        let storage = Storage::init(Option::some(&mut context), Option::none());
        let pending_shields = storage.pending_shields;
        let balance = storage.balances.at(to.address);
        let public_note = TransparentNote::new_from_secret(amount, secret);
        
        pending_shields.assert_contains_and_remove(public_note);
        increment(balance, amount, to.address);
    }

    #[aztec(private)]
    fn unshield(
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
    ) -> Field {
        let storage = Storage::init(Option::some(&mut context), Option::none());

        if (from.address != context.msg_sender()) {
            let selector = compute_selector("unshield((Field),(Field),Field)");
            let message_field = compute_message_hash([context.msg_sender(), selector, from.address, to.address, amount]);
            assert(AccountContract::at(from.address).is_valid(Option::some(&mut context), Option::none(), message_field) == 0xe86ab4ff, "invalid call");
        }

        let from_balance = storage.balances.at(from.address);
        decrement(from_balance, amount, from.address);

        let selector = compute_selector("_increase_public_balance((Field),Field)");
        let _void = context.call_public_function(context.this_address(), selector, [to.address, amount]);
    }

    #[aztec(private)]
    fn transfer(
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
    ) -> Field {
        let storage = Storage::init(Option::some(&mut context), Option::none());

        if (from.address != context.msg_sender()) {
            let selector = compute_selector("transfer((Field),(Field),Field)");
            let message_field = compute_message_hash([context.msg_sender(), selector, from.address, to.address, amount]);
            assert(AccountContract::at(from.address).is_valid(Option::some(&mut context), Option::none(), message_field) == 0xe86ab4ff, "invalid call");
        }

        let from_balance = storage.balances.at(from.address);
        let to_balance = storage.balances.at(to.address);

        decrement(from_balance, amount, from.address);
        increment(to_balance, amount, to.address);
    }   

    /// SHOULD BE Internal ///

    // We cannot do this from the constructor currently 
    // Since this should be internal, for now, we ignore the safety checks of it, as they are 
    // enforced by it being internal and only called from the constructor.
    #[aztec(public)]
    fn _initialize(
        new_admin: AztecAddress,
    ) {
        let storage = Storage::init(Option::none(), Option::some(&mut context));
        storage.admin.write(new_admin.address);
        storage.minters.at(new_admin.address).write(1);
    }

    /// Internal ///

    #[aztec(public)]
    internal fn _increase_public_balance(
        to: AztecAddress,
        amount: Field,
    ) {
        let storage = Storage::init(Option::none(), Option::some(&mut context));
        let new_balance = SafeU120::new(storage.public_balances.at(to.address).read()).add(SafeU120::new(amount));
        storage.public_balances.at(to.address).write(new_balance.value as Field);
    }

    /// Unconstrained /// 

    unconstrained fn admin() -> Field {
        let storage = Storage::init(Option::none(), Option::none());
        storage.admin.read()
    }

    unconstrained fn is_minter(
        minter: AztecAddress,
    ) -> bool {
        let storage = Storage::init(Option::none(), Option::none());
        storage.minters.at(minter.address).read() as bool
    }

    unconstrained fn total_supply() -> Field {
        let storage = Storage::init(Option::none(), Option::none());
        storage.total_supply.read()
    }

    unconstrained fn balance_of_private(
        owner: AztecAddress,
    ) -> Field {
        let storage = Storage::init(Option::none(), Option::none());
        let owner_balance = storage.balances.at(owner.address);

        balance_utils::get_balance(owner_balance)
    }

    unconstrained fn balance_of_public(
        owner: AztecAddress,
    ) -> Field {
        let storage = Storage::init(Option::none(), Option::none());
        storage.public_balances.at(owner.address).read()
    }

    // Below this point is the stuff of nightmares.
    // This should ideally not be required. What do we do if vastly different types of preimages?

    // Computes note hash and nullifier.
    // Note 1: Needs to be defined by every contract producing logs.
    // Note 2: Having it in all the contracts gives us the ability to compute the note hash and nullifier differently for different kind of notes.
    unconstrained fn compute_note_hash_and_nullifier(contract_address: Field, nonce: Field, storage_slot: Field, preimage: [Field; VALUE_NOTE_LEN]) -> [Field; 4] {
        let note_header = NoteHeader { contract_address, nonce, storage_slot };
        if (storage_slot == 5) {
            note_utils::compute_note_hash_and_nullifier(TransparentNoteMethods, note_header, preimage)
        } else {
            note_utils::compute_note_hash_and_nullifier(ValueNoteMethods, note_header, preimage)
        }
    }

}
