// docs:start:token_all
// docs:start:imports
mod types;
mod interfaces;

// Minimal token implementation that supports `AuthWit` accounts.
// The auth message follows a similar pattern to the cross-chain message and includes a designated caller.
// The designated caller is ALWAYS used here, and not based on a flag as cross-chain.
// message hash = H([caller, contract, selector, ...args])
// To be read as `caller` calls function at `contract` defined by `selector` with `args`
// Including a nonce in the message hash ensures that the message can only be used once.


// TODO's: @LHerskind
// We are currently unable to do constructor -> private calls

contract TokenBlacklist {
    // Libs
    use dep::std::option::Option;

    use dep::safe_math::SafeU120;

    use dep::aztec::{
        note::{
            note_getter_options::NoteGetterOptions,
            note_header::NoteHeader,
            utils as note_utils,
        },
        context::{PrivateContext, PublicContext, Context},
        hash::{compute_secret_hash},
        state_vars::{map::Map, public_state::PublicState, set::Set, immutable_singleton::ImmutableSingleton},
        types::type_serialization::{
            field_serialization::{FieldSerializationMethods, FIELD_SERIALIZED_LEN},
            bool_serialization::{BoolSerializationMethods, BOOL_SERIALIZED_LEN},
            aztec_address_serialization::{AztecAddressSerializationMethods, AZTEC_ADDRESS_SERIALIZED_LEN},
        },
        types::address::{AztecAddress},
        selector::compute_selector,
    };

    use dep::field_note::field_note::{FieldNote, FieldNoteMethods, FIELD_NOTE_LEN};


    // docs:start:import_authwit
    use dep::authwit::{
        auth::{
            assert_current_call_valid_authwit,
            assert_current_call_valid_authwit_public,
        },
    };
    // docs:end:import_authwit

    use crate::types::{
        transparent_note::{TransparentNote, TransparentNoteMethods, TRANSPARENT_NOTE_LEN},
        token_note::{TokenNote, TokenNoteMethods, TOKEN_NOTE_LEN},
        balances_map::{BalancesMap},
        safe_u120_serialization::{SafeU120SerializationMethods, SAFE_U120_SERIALIZED_LEN},
        roles::UserFlags,
    };
    use crate::interfaces::SlowMap;
    // docs:end::imports

    // docs:start:storage_struct
    struct Storage {
        // docs:start:storage_admin
        admin: PublicState<AztecAddress, AZTEC_ADDRESS_SERIALIZED_LEN>,
        // docs:end:storage_admin
        // docs:start:storage_balances
        balances: BalancesMap,
        // docs:end:storage_balances
        total_supply: PublicState<SafeU120, SAFE_U120_SERIALIZED_LEN>,
        // docs:start:storage_pending_shields
        pending_shields: Set<TransparentNote, TRANSPARENT_NOTE_LEN>,
        // docs:end:storage_pending_shields
        public_balances: Map<PublicState<SafeU120, SAFE_U120_SERIALIZED_LEN>>,
        slow_update: ImmutableSingleton<FieldNote, FIELD_NOTE_LEN>,
        public_slow_update: PublicState<AztecAddress, AZTEC_ADDRESS_SERIALIZED_LEN>,
    }
    // docs:end:storage_struct

    // docs:start:storage_init
    impl Storage {
        fn init(context: Context) -> pub Self {
            Storage {
                // docs:start:storage_admin_init
                admin: PublicState::new(
                    context,
                    1,
                    AztecAddressSerializationMethods,
                ),
                // docs:end:storage_admin_init
                balances: BalancesMap::new(context, 3),
                total_supply: PublicState::new(
                    context,
                    4,
                    SafeU120SerializationMethods,
                ),
                // docs:start:storage_pending_shields_init
                pending_shields: Set::new(context, 5, TransparentNoteMethods),
                // docs:end:storage_pending_shields_init
                public_balances: Map::new(
                    context,
                    6,
                    |context, slot| {
                        PublicState::new(
                            context,
                            slot,
                            SafeU120SerializationMethods,
                        )
                    },
                ),
                // Below is an abomination to have same value in private and public (immutable in solidity).
                slow_update: ImmutableSingleton::new(context, 7, FieldNoteMethods),
                public_slow_update: PublicState::new(
                    context,
                    8,
                    AztecAddressSerializationMethods,
                ),
            }
        }
    }
    // docs:end:storage_init

    // docs:start:constructor
    #[aztec(private)]
    fn constructor(admin: AztecAddress, slow_updates_contract: AztecAddress) {
        let mut slow_note = FieldNote::new(slow_updates_contract.address);
        storage.slow_update.initialize(&mut slow_note, Option::none(), false);

        let selector = compute_selector("_initialize((Field),(Field))");
        context.call_public_function(context.this_address(), selector, [admin.address, slow_updates_contract.address]);

        // We cannot do the following atm
        // let roles = UserFlags{is_admin: true, is_minter: false, is_blacklisted: false}.get_value() as Field;
        // SlowMap::at(slow_updates_contract).update_at_private(&mut context, admin.address, roles);
    }

    ////////
    // Looking ugly because we cannot do constructor -> private calls

    #[aztec(private)]
    fn init_slow_tree(
        user: AztecAddress
    ) {
        let roles = UserFlags{is_admin: true, is_minter: false, is_blacklisted: false}.get_value() as Field;
        let slow = SlowMap::at(AztecAddress::new(storage.slow_update.get_note().value));
        slow.update_at_private(&mut context, user.address, roles);
        context.call_public_function(
            context.this_address(),
            compute_selector("_init_slow_tree((Field))"),
            [context.msg_sender()],
        );
    }

    #[aztec(public)]
    internal fn _init_slow_tree(caller: AztecAddress) {
        assert(storage.admin.read().eq(caller), "caller is not admin");
    }

    ///////

    // docs:end:constructor
    #[aztec(private)]
    fn update_roles(
        user: AztecAddress,
        roles: Field,
    ) {
        let slow = SlowMap::at(AztecAddress::new(storage.slow_update.get_note().value));
        let caller_roles = UserFlags::new(slow.read_at(&mut context, context.msg_sender()) as u120);
        assert(caller_roles.is_admin, "caller is not admin");

        slow.update_at_private(&mut context, user.address, roles);
    }

    // docs:start:mint_public
    #[aztec(public)]
    fn mint_public(
        to: AztecAddress,
        amount: Field,
    ) -> Field {
        let slow = SlowMap::at(storage.public_slow_update.read());
        let to_roles = UserFlags::new(slow.read_at_pub(context, to.address) as u120);
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        let caller_roles = UserFlags::new(slow.read_at_pub(context, context.msg_sender()) as u120);
        assert(caller_roles.is_minter, "caller is not minter");

        let amount = SafeU120::new(amount);
        let new_balance = storage.public_balances.at(to.address).read().add(amount);
        let supply = storage.total_supply.read().add(amount);

        storage.public_balances.at(to.address).write(new_balance);
        storage.total_supply.write(supply);
        1
    }
    // docs:end:mint_public

    // docs:start:mint_private
    #[aztec(public)]
    fn mint_private(
        amount: Field,
        secret_hash: Field,
    ) -> Field {
        let slow = SlowMap::at(storage.public_slow_update.read());
        let caller_roles = UserFlags::new(slow.read_at_pub(context, context.msg_sender()) as u120);
        assert(caller_roles.is_minter, "caller is not minter");

        let pending_shields = storage.pending_shields;
        let mut note = TransparentNote::new(amount, secret_hash);
        let supply = storage.total_supply.read().add(SafeU120::new(amount));

        storage.total_supply.write(supply);
        // docs:start:insert_from_public
        pending_shields.insert_from_public(&mut note);
        // docs:end:insert_from_public
        1
    }
    // docs:end:mint_private

    // docs:start:shield
    #[aztec(public)]
    fn shield(
        from: AztecAddress,
        amount: Field,
        secret_hash: Field,
        nonce: Field,
    ) -> Field {
        let slow = SlowMap::at(storage.public_slow_update.read());
        let from_roles = UserFlags::new(slow.read_at_pub(context, from.address) as u120);
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");

        if (from.address != context.msg_sender()) {
            // The redeem is only spendable once, so we need to ensure that you cannot insert multiple shields from the same message.
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let amount = SafeU120::new(amount);
        let from_balance = storage.public_balances.at(from.address).read().sub(amount);

        let pending_shields = storage.pending_shields;
        let mut note = TransparentNote::new(amount.value as Field, secret_hash);

        storage.public_balances.at(from.address).write(from_balance);
        pending_shields.insert_from_public(&mut note);
        1
    }
    // docs:end:shield

    // docs:start:transfer_public
    #[aztec(public)]
    fn transfer_public(
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
        nonce: Field,
    ) -> Field {
        let slow = SlowMap::at(storage.public_slow_update.read());        
        let from_roles = UserFlags::new(slow.read_at_pub(context, from.address) as u120);
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");
        let to_roles = UserFlags::new(slow.read_at_pub(context, to.address) as u120);
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        if (from.address != context.msg_sender()) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let amount = SafeU120::new(amount);
        let from_balance = storage.public_balances.at(from.address).read().sub(amount);
        storage.public_balances.at(from.address).write(from_balance);

        let to_balance = storage.public_balances.at(to.address).read().add(amount);
        storage.public_balances.at(to.address).write(to_balance);

        1
    }
    // docs:end:transfer_public

    // docs:start:burn_public
    #[aztec(public)]
    fn burn_public(
        from: AztecAddress,
        amount: Field,
        nonce: Field,
    ) -> Field {
        let slow = SlowMap::at(storage.public_slow_update.read());        
        let from_roles = UserFlags::new(slow.read_at_pub(context, from.address) as u120);
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");

        if (from.address != context.msg_sender()) {
            assert_current_call_valid_authwit_public(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let amount = SafeU120::new(amount);
        let from_balance = storage.public_balances.at(from.address).read().sub(amount);
        storage.public_balances.at(from.address).write(from_balance);

        let new_supply = storage.total_supply.read().sub(amount);
        storage.total_supply.write(new_supply);

        1
    }
    // docs:end:burn_public

    // docs:start:redeem_shield
    #[aztec(private)]
    fn redeem_shield(
        to: AztecAddress,
        amount: Field,
        secret: Field,
    ) -> Field {
        let slow = SlowMap::at(AztecAddress::new(storage.slow_update.get_note().value));        
        let to_roles = UserFlags::new(slow.read_at(&mut context, to.address) as u120);
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        let pending_shields = storage.pending_shields;
        let secret_hash = compute_secret_hash(secret);
        // Get 1 note (set_limit(1)) which has amount stored in field with index 0 (select(0, amount)) and secret_hash
        // stored in field with index 1 (select(1, secret_hash)).
        let options = NoteGetterOptions::new().select(0, amount).select(1, secret_hash).set_limit(1);
        let notes = pending_shields.get_notes(options);
        let note = notes[0].unwrap_unchecked();
        // Remove the note from the pending shields set 
        pending_shields.remove(note);

        // Add the token note to user's balances set
        storage.balances.at(to).add(SafeU120::new(amount));

        1
    }
    // docs:end:redeem_shield

    // docs:start:unshield
    #[aztec(private)]
    fn unshield(
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
        nonce: Field,
    ) -> Field {
        let slow = SlowMap::at(AztecAddress::new(storage.slow_update.get_note().value));
        let from_roles = UserFlags::new(slow.read_at(&mut context, from.address) as u120);
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");
        let to_roles = UserFlags::new(slow.read_at(&mut context, to.address) as u120);
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        if (from.address != context.msg_sender()) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        storage.balances.at(from).sub(SafeU120::new(amount));

        let selector = compute_selector("_increase_public_balance((Field),Field)");
        let _void = context.call_public_function(context.this_address(), selector, [to.address, amount]);

        1
    }
    // docs:end:unshield

    // docs:start:transfer
    #[aztec(private)]
    fn transfer(
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
        nonce: Field,
    ) -> Field {
        let slow = SlowMap::at(AztecAddress::new(storage.slow_update.get_note().value));
        let from_roles = UserFlags::new(slow.read_at(&mut context, from.address) as u120);
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");
        let to_roles = UserFlags::new(slow.read_at(&mut context, to.address) as u120);
        assert(!to_roles.is_blacklisted, "Blacklisted: Recipient");

        if (from.address != context.msg_sender()) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        let amount = SafeU120::new(amount);
        storage.balances.at(from).sub(amount);
        storage.balances.at(to).add(amount);

        1
    }
    // docs:end:transfer

    // docs:start:burn
    #[aztec(private)]
    fn burn(
        from: AztecAddress,
        amount: Field,
        nonce: Field,
    ) -> Field {
        let slow = SlowMap::at(AztecAddress::new(storage.slow_update.get_note().value));
        let from_roles = UserFlags::new(slow.read_at(&mut context, from.address) as u120);
        assert(!from_roles.is_blacklisted, "Blacklisted: Sender");

        if (from.address != context.msg_sender()) {
            assert_current_call_valid_authwit(&mut context, from);
        } else {
            assert(nonce == 0, "invalid nonce");
        }

        storage.balances.at(from).sub(SafeU120::new(amount));

        let selector = compute_selector("_reduce_total_supply(Field)");
        let _void = context.call_public_function(context.this_address(), selector, [amount]);

        1
    }
    // docs:end:burn

    // docs:start:initialize
    #[aztec(public)]
    internal fn _initialize(
        new_admin: AztecAddress,
        slow_updates_contract: AztecAddress
    ) {
        assert(new_admin.address != 0, "invalid admin");
        storage.admin.write(new_admin);
        storage.public_slow_update.write(slow_updates_contract);
        SlowMap::at(slow_updates_contract).initialize(context);
    }
    // docs:end:initialize

    /// Internal ///

    // docs:start:increase_public_balance
    #[aztec(public)]
    internal fn _increase_public_balance(
        to: AztecAddress,
        amount: Field,
    ) {
        let new_balance = storage.public_balances.at(to.address).read().add(SafeU120::new(amount));
        storage.public_balances.at(to.address).write(new_balance);
    }
    // docs:end:increase_public_balance

    // docs:start:reduce_total_supply
    #[aztec(public)]
    internal fn _reduce_total_supply(
        amount: Field,
    ) {
        // Only to be called from burn.
        let new_supply = storage.total_supply.read().sub(SafeU120::new(amount));
        storage.total_supply.write(new_supply);
    }
    // docs:end:reduce_total_supply

    /// Unconstrained ///

    // docs:start:total_supply
    unconstrained fn total_supply() -> u120 {
        storage.total_supply.read().value
    }
    // docs:end:total_supply

    // docs:start:balance_of_private
    unconstrained fn balance_of_private(
        owner: AztecAddress,
    ) -> u120 {
        storage.balances.at(owner).balance_of().value
    }
    // docs:end:balance_of_private

    // docs:start:balance_of_public
    unconstrained fn balance_of_public(
        owner: AztecAddress,
    ) -> u120 {
        storage.public_balances.at(owner.address).read().value
    }
    // docs:end:balance_of_public

    // Below this point is the stuff of nightmares.
    // This should ideally not be required. What do we do if vastly different types of preimages?

    // docs:start:compute_note_hash_and_nullifier
    // Computes note hash and nullifier.
    // Note 1: Needs to be defined by every contract producing logs.
    // Note 2: Having it in all the contracts gives us the ability to compute the note hash and nullifier differently for different kind of notes.
    unconstrained fn compute_note_hash_and_nullifier(contract_address: Field, nonce: Field, storage_slot: Field, preimage: [Field; TOKEN_NOTE_LEN]) -> [Field; 4] {
        let note_header = NoteHeader::new(contract_address, nonce, storage_slot);
        if (storage_slot == 5) {
            note_utils::compute_note_hash_and_nullifier(TransparentNoteMethods, note_header, preimage)
        } else if (storage_slot == 7) {
            note_utils::compute_note_hash_and_nullifier(FieldNoteMethods, note_header, preimage)
        } else {
            note_utils::compute_note_hash_and_nullifier(TokenNoteMethods, note_header, preimage)
        } 
    }
    // docs:end:compute_note_hash_and_nullifier
}
// docs:end:token_all
