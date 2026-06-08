mod test;
mod test_note;

// A contract used for testing a random hodgepodge of small features from simulator and end-to-end tests.
use aztec::macros::aztec;

// DEPRECATED: This contract is deprecated. If you want to test new features, create a simple new contract used
// to test only that one feature. See NoConstructor contract for example.
#[aztec]
pub contract Test {
    // Note: If you import a new kind of note you will most likely need to update the test_note_type_id test
    // as the note type ids of current notes might have changed.

    use aztec::{
        // Note related imports
        note::{
            constants::MAX_NOTES_PER_PAGE,
            lifecycle::{create_note, destroy_note},
            note_getter::{get_notes, view_notes},
            note_getter_options::{NoteGetterOptions, NoteStatus},
            note_viewer_options::NoteViewerOptions,
            ConfirmedNote,
            HintedNote,
        },
        // State variable types
        state_vars::{DelayedPublicMutable, Map, Owned, PrivateImmutable, PrivateMutable, PrivateSet, PublicImmutable},
        // Protocol types and constants
        protocol::{
            abis::function_selector::FunctionSelector,
            address::{AztecAddress, EthAddress},
            constants::MAX_PUBLIC_LOG_SIZE_IN_FIELDS,
            traits::{Hash, Packable, Serialize},
        },
        // Event related
        messages::delivery::MessageDelivery,
        // History and inclusion proofs
        history::note::assert_note_existed_by,
        // Key management
        keys::getters::get_public_keys,
        // Macros
        macros::{
            events::event,
            functions::{initializer, only_self, noinitcheck, external, allow_phase_change},
            storage::storage,
        },
        // Contract instance management
        publish_contract_instance::publish_contract_instance_for_public_execution,
    };
    use std::meta::derive;
    use token_portal_content_hash_lib::get_mint_to_private_content_hash;

    // We are importing different kinds of notes to test the note type ids
    use crate::test_note::TestNote;
    use address_note::AddressNote;
    use uint_note::{PartialUintNote, UintNote};

    #[event]
    struct ExampleEvent {
        value0: Field,
        value1: Field,
        value2: Field,
        value3: Field,
        value4: Field,
    }

    #[derive(Eq, Packable)]
    struct ExampleStruct {
        value0: Field,
        value1: Field,
        value2: Field,
        value3: Field,
        value4: Field,
    }

    global DELAYED_PUBLIC_MUTABLE_INITIAL_DELAY: u64 = 2;

    // This struct is used to test the storage slot allocation mechanism - if modified the test_storage_slot_allocation
    // test function must also be updated accordingly.
    #[storage]
    struct Storage {
        // docs:start:private_immutable
        note_in_private_immutable: Owned<PrivateImmutable<TestNote>>,
        // docs:end:private_immutable
        struct_in_private_immutable: Owned<PrivateImmutable<ExampleStruct>>,
        note_in_private_mutable: Owned<PrivateMutable<TestNote>>,
        struct_in_private_mutable: Owned<PrivateMutable<ExampleStruct>>,
        note_in_private_set: Owned<PrivateSet<AddressNote>>,
        struct_in_private_set: Owned<PrivateSet<ExampleStruct>>,
        note_in_public_immutable: PublicImmutable<TestNote>,
        struct_in_public_immutable: PublicImmutable<ExampleStruct>,
        struct_in_map: Map<AztecAddress, PublicImmutable<ExampleStruct>>,
        struct_in_delayed_public_mutable: DelayedPublicMutable<ExampleStruct, DELAYED_PUBLIC_MUTABLE_INITIAL_DELAY>,
        dummy_variable: Owned<PrivateImmutable<TestNote>>,
    }

    #[initializer]
    #[external("private")]
    // We can name our initializer anything we want as long as it's marked as aztec(initializer)
    fn initialize() {}

    #[external("private")]
    fn get_ovsk_app(ovpk_m_hash: Field) -> Field {
        self.context.request_ovsk_app(ovpk_m_hash)
    }

    #[external("private")]
    fn get_master_incoming_viewing_public_key(address: AztecAddress) -> [Field; 2] {
        let ivpk_m = get_public_keys(address).ivpk_m;

        [ivpk_m.inner.x, ivpk_m.inner.y]
    }

    // Get the address of this contract (taken from the input context)
    #[external("private")]
    fn get_this_address() -> AztecAddress {
        self.address
    }

    #[external("private")]
    fn set_expiration_timestamp(expiration_timestamp: u64, make_tx_hybrid: bool) {
        self.context.set_expiration_timestamp(expiration_timestamp);

        if make_tx_hybrid {
            self.enqueue_self.dummy_public_call()
        }
    }

    #[external("public")]
    #[only_self]
    fn dummy_public_call() {}

    #[external("private")]
    fn call_create_note(value: u128, owner: AztecAddress, storage_slot: Field, make_tx_hybrid: bool) {
        let note = UintNote { value };
        create_note(self.context, owner, storage_slot, note).deliver(MessageDelivery::onchain_constrained());

        if make_tx_hybrid {
            self.enqueue_self.dummy_public_call();
        }
    }

    #[external("private")]
    fn call_create_partial_note(owner: AztecAddress) -> PartialUintNote {
        UintNote::partial(owner, self.context, owner, self.address)
    }

    #[external("public")]
    fn call_complete_partial_note(partial_note: PartialUintNote, storage_slot: Field, value: u128) {
        partial_note.complete(self.context, self.address, storage_slot, value);
    }

    #[external("private")]
    fn call_create_and_complete_partial_note(owner: AztecAddress, storage_slot: Field, value: u128) {
        let partial_note = UintNote::partial(owner, self.context, owner, self.address);

        self.enqueue_self.call_complete_partial_note(partial_note, storage_slot, value);
    }

    #[external("private")]
    fn call_get_notes(owner: AztecAddress, storage_slot: Field, active_or_nullified: bool) -> u128 {
        let mut options = NoteGetterOptions::new().set_owner(owner);
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let confirmed_notes: BoundedVec<ConfirmedNote<UintNote>, _> = get_notes(self.context, storage_slot, options);

        confirmed_notes.get(0).note.value
    }

    #[external("private")]
    fn call_get_notes_many(owner: AztecAddress, storage_slot: Field, active_or_nullified: bool) -> [u128; 2] {
        let mut options = NoteGetterOptions::new().set_owner(owner);
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let confirmed_notes: BoundedVec<ConfirmedNote<UintNote>, _> = get_notes(self.context, storage_slot, options);

        [confirmed_notes.get(0).note.value, confirmed_notes.get(1).note.value]
    }

    #[external("utility")]
    unconstrained fn call_view_notes(owner: AztecAddress, storage_slot: Field, active_or_nullified: bool) -> u128 {
        let mut options = NoteViewerOptions::new().set_owner(owner);
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let notes: BoundedVec<UintNote, MAX_NOTES_PER_PAGE> = view_notes(storage_slot, options);

        notes.get(0).value
    }

    #[external("utility")]
    unconstrained fn call_view_notes_many(
        owner: AztecAddress,
        storage_slot: Field,
        active_or_nullified: bool,
    ) -> [u128; 2] {
        let mut options = NoteViewerOptions::new().set_owner(owner);
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let notes: BoundedVec<UintNote, MAX_NOTES_PER_PAGE> = view_notes(storage_slot, options);

        [notes.get(0).value, notes.get(1).value]
    }

    #[external("private")]
    fn call_destroy_note(owner: AztecAddress, storage_slot: Field) {
        let options = NoteGetterOptions::new().set_owner(owner);
        let confirmed_notes: BoundedVec<ConfirmedNote<UintNote>, _> = get_notes(self.context, storage_slot, options);

        destroy_note(self.context, confirmed_notes.get(0));
    }

    #[external("private")]
    fn test_note_inclusion(owner: AztecAddress, storage_slot: Field) {
        let options = NoteGetterOptions::new().set_owner(owner).set_limit(1);

        // We unfortunately do not currently have a convenient API that returned `HintedNote`, so for this invocation we
        // instead manually construct the value from a `ConfirmedNote` (which doesn't make sense, since `get_note`
        // already proves note inclusion).
        // TODO(F-255).
        let confirmed_note: ConfirmedNote<UintNote> = get_notes(self.context, storage_slot, options).get(0);
        let hinted_note = HintedNote {
            note: confirmed_note.note,
            contract_address: confirmed_note.contract_address,
            owner: confirmed_note.owner,
            randomness: confirmed_note.randomness,
            storage_slot: confirmed_note.storage_slot,
            metadata: confirmed_note.metadata,
        };

        let header = self.context.get_anchor_block_header();
        let _ = assert_note_existed_by(header, hinted_note);
    }

    #[external("private")]
    fn test_setting_teardown() {
        self.context.set_public_teardown_function(
            self.address,
            comptime { FunctionSelector::from_signature("dummy_public_call()") },
            [],
            false,
        );
    }

    #[external("private")]
    fn test_setting_fee_payer() {
        self.context.set_as_fee_payer();
    }

    #[external("private")]
    #[allow_phase_change]
    fn end_setup_checking_phases() {
        assert(!self.context.in_revertible_phase());
        self.context.end_setup();
        assert(self.context.in_revertible_phase());
    }

    #[external("private")]
    fn call_function_that_ends_setup() {
        // This function should error since it gets inadvertently phase changed by a nested call.
        self.call_self.end_setup_checking_phases();
    }

    #[external("private")]
    #[allow_phase_change]
    fn call_function_that_ends_setup_without_phase_check() {
        self.call_self.end_setup_checking_phases();
    }

    #[external("public")]
    fn create_l2_to_l1_message_arbitrary_recipient_public(content: Field, recipient: EthAddress) {
        // Public oracle call to emit new commitment.
        self.context.message_portal(recipient, content);
    }

    #[external("private")]
    fn create_l2_to_l1_message_arbitrary_recipient_private(content: Field, recipient: EthAddress) {
        // Public oracle call to emit new commitment.
        self.context.message_portal(recipient, content);
    }

    #[external("public")]
    fn emit_nullifier_public(nullifier: Field) {
        self.context.push_nullifier_unsafe(nullifier);
    }

    #[external("private")]
    #[noinitcheck]
    fn emit_nullifier(nullifier: Field) {
        self.context.push_nullifier_unsafe(nullifier);
    }

    // For testing non-note encrypted logs
    #[external("private")]
    fn emit_array_as_encrypted_log(tag: Field, fields: [Field; 5], owner: AztecAddress, nest: bool) {
        let event = ExampleEvent {
            value0: fields[0],
            value1: fields[1],
            value2: fields[2],
            value3: fields[3],
            value4: fields[4],
        };

        self.emit(event).deliver_to(owner, MessageDelivery::onchain_unconstrained());

        // this contract has reached max number of functions, so using this one fn
        // to test nested and non nested encrypted logs
        if nest {
            self.call_self.emit_array_as_encrypted_log(tag, [0, 0, 0, 0, 0], owner, false);

            // Emit a log with non-encrypted content for testing purpose.
            let leaky_log = BoundedVec::from_array(event.serialize());
            self.context.emit_private_log_unsafe(tag, leaky_log);
        }
    }

    #[external("public")]
    fn emit_public(value: Field) {
        self.context.emit_public_log_unsafe(0, /*message=*/ value);
        self.context.emit_public_log_unsafe(0, /*message=*/ [10, 20, 30]);
        self.context.emit_public_log_unsafe(0, /*message=*/ "Hello, world!");
    }

    #[external("public")]
    fn emit_full_size_public_log(value_offset: Field) {
        // -1 because emit_public_log_unsafe prepends the tag, so the emitted log is N + 1 fields.
        let log_fields = [0; MAX_PUBLIC_LOG_SIZE_IN_FIELDS - 1].mapi(|i, _| value_offset + i as Field);
        self.context.emit_public_log_unsafe(0, log_fields);
    }

    #[external("private")]
    fn consume_mint_to_private_message(
        amount: u128,
        secret_for_L1_to_L2_message_consumption: Field,
        portal_address: EthAddress,
        message_leaf_index: Field,
    ) {
        // Consume L1 to L2 message and emit nullifier
        let content_hash = get_mint_to_private_content_hash(amount);
        self.context.consume_l1_to_l2_message(
            content_hash,
            secret_for_L1_to_L2_message_consumption,
            portal_address,
            message_leaf_index,
        );
    }

    #[external("public")]
    fn consume_message_from_arbitrary_sender_public(
        content: Field,
        secret: Field,
        sender: EthAddress,
        message_leaf_index: Field,
    ) {
        // Consume message and emit nullifier
        self.context.consume_l1_to_l2_message(content, secret, sender, message_leaf_index);
    }

    #[external("private")]
    fn consume_message_from_arbitrary_sender_private(
        content: Field,
        secret: Field,
        sender: EthAddress,
        message_leaf_index: Field,
    ) {
        // Consume message and emit nullifier
        self.context.consume_l1_to_l2_message(content, secret, sender, message_leaf_index);
    }

    #[external("private")]
    fn assert_private_global_vars(chain_id: Field, version: Field) {
        assert(self.context.chain_id() == chain_id, "Invalid chain id");
        assert(self.context.version() == version, "Invalid version");
    }

    #[external("private")]
    fn assert_header_private(header_hash: Field) {
        assert(self.context.anchor_block_header.hash() == header_hash, "Invalid header hash");
    }

    // TODO(4840): add AVM opcodes for getting header (members)
    //#[external("public")]
    //fn assert_header_public(header_hash: Field) {
    //    assert(self.context.anchor_block_header.hash() == header_hash, "Invalid header hash");
    //}

    #[external("private")]
    fn publish_contract_instance(target: AztecAddress) {
        publish_contract_instance_for_public_execution(self.context, target);
    }

    #[derive(Serialize)]
    pub struct DummyNote {
        pub amount: Field,
        pub secret_hash: Field,
    }

    #[derive(Serialize)]
    pub struct DeepStruct {
        pub a_field: Field,
        pub a_bool: bool,
        pub a_note: DummyNote,
        pub many_notes: [DummyNote; 3],
    }
}
