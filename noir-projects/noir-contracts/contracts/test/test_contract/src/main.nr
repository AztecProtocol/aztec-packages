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
            lifecycle::{create_note, destroy_note_unsafe},
            note_getter::{get_notes, view_notes},
            note_getter_options::{NoteGetterOptions, NoteStatus},
            note_viewer_options::NoteViewerOptions,
            retrieved_note::RetrievedNote,
        },
        // State variable types
        state_vars::{
            DelayedPublicMutable, Map, PrivateImmutable, PrivateMutable, PrivateSet,
            PublicImmutable,
        },
        // Protocol types and constants
        protocol_types::{
            abis::function_selector::FunctionSelector,
            address::{AztecAddress, EthAddress},
            constants::{MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, PRIVATE_LOG_SIZE_IN_FIELDS},
            traits::{Hash, Packable, Serialize},
        },
        // Event related
        messages::message_delivery::MessageDelivery,
        // Hashing
        hash::pedersen_hash,
        // History and inclusion proofs
        history::note_inclusion::ProveNoteInclusion,
        // Key management
        keys::getters::get_public_keys,
        // Macros
        macros::{
            events::event,
            functions::{initializer, only_self, noinitcheck, external},
            storage::storage,
        },
        // Contract instance management
        publish_contract_instance::publish_contract_instance_for_public_execution,
    };
    use std::meta::derive;
    use token_portal_content_hash_lib::get_mint_to_private_content_hash;

    // We are importing different kinds of notes to test the note type ids
    use crate::test_note::TestNote;
    use address_note::address_note::AddressNote;
    use uint_note::uint_note::{PartialUintNote, UintNote};

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
    struct Storage<Context> {
        note_in_private_immutable: PrivateImmutable<TestNote, Context>,
        struct_in_private_immutable: PrivateImmutable<ExampleStruct, Context>,
        note_in_private_mutable: PrivateMutable<TestNote, Context>,
        struct_in_private_mutable: PrivateMutable<ExampleStruct, Context>,
        note_in_private_set: PrivateSet<AddressNote, Context>,
        struct_in_private_set: PrivateSet<ExampleStruct, Context>,
        note_in_public_immutable: PublicImmutable<TestNote, Context>,
        struct_in_public_immutable: PublicImmutable<ExampleStruct, Context>,
        struct_in_map: Map<AztecAddress, PrivateImmutable<ExampleStruct, Context>, Context>,
        struct_in_delayed_public_mutable: DelayedPublicMutable<ExampleStruct, DELAYED_PUBLIC_MUTABLE_INITIAL_DELAY, Context>,
        dummy_variable: PrivateImmutable<TestNote, Context>,
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
    fn set_include_by_timestamp(include_by_timestamp: u64, make_tx_hybrid: bool) {
        self.context.set_include_by_timestamp(include_by_timestamp);

        if make_tx_hybrid {
            self.enqueue_self.dummy_public_call()
        }
    }

    #[external("public")]
    #[only_self]
    fn dummy_public_call() {}

    #[external("private")]
    fn call_create_note(
        value: u128,
        owner: AztecAddress,
        storage_slot: Field,
        make_tx_hybrid: bool,
    ) {
        let note = UintNote::new(value, owner);
        create_note(self.context, storage_slot, note).emit(
            owner,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );

        if make_tx_hybrid {
            self.enqueue_self.dummy_public_call();
        }
    }

    #[external("private")]
    fn call_create_partial_note(owner: AztecAddress, storage_slot: Field) -> PartialUintNote {
        UintNote::partial(owner, storage_slot, self.context, owner, self.address)
    }

    #[external("public")]
    fn call_complete_partial_note(partial_note: PartialUintNote, value: u128) {
        partial_note.complete(self.context, self.address, value);
    }

    #[external("private")]
    fn call_create_and_complete_partial_note(
        owner: AztecAddress,
        storage_slot: Field,
        value: u128,
    ) {
        let partial_note =
            UintNote::partial(owner, storage_slot, self.context, owner, self.address);

        self.enqueue_self.call_complete_partial_note(partial_note, value);
    }

    #[external("private")]
    fn call_get_notes(storage_slot: Field, active_or_nullified: bool) -> u128 {
        let mut options = NoteGetterOptions::new();
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let (retrieved_notes, _): (BoundedVec<RetrievedNote<UintNote>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<Field, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
            get_notes(self.context, storage_slot, options);

        retrieved_notes.get(0).note.get_value()
    }

    #[external("private")]
    fn call_get_notes_many(storage_slot: Field, active_or_nullified: bool) -> [u128; 2] {
        let mut options = NoteGetterOptions::new();
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let (retrieved_notes, _): (BoundedVec<RetrievedNote<UintNote>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<Field, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
            get_notes(self.context, storage_slot, options);

        [retrieved_notes.get(0).note.get_value(), retrieved_notes.get(1).note.get_value()]
    }

    #[external("utility")]
    unconstrained fn call_view_notes(storage_slot: Field, active_or_nullified: bool) -> u128 {
        let mut options = NoteViewerOptions::new();
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let notes: BoundedVec<UintNote, MAX_NOTES_PER_PAGE> = view_notes(storage_slot, options);

        notes.get(0).get_value()
    }

    #[external("utility")]
    unconstrained fn call_view_notes_many(
        storage_slot: Field,
        active_or_nullified: bool,
    ) -> [u128; 2] {
        let mut options = NoteViewerOptions::new();
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let notes: BoundedVec<UintNote, MAX_NOTES_PER_PAGE> = view_notes(storage_slot, options);

        [notes.get(0).get_value(), notes.get(1).get_value()]
    }

    #[external("private")]
    fn call_destroy_note(storage_slot: Field) {
        let options = NoteGetterOptions::new();
        let (retrieved_notes, note_hashes): (BoundedVec<RetrievedNote<UintNote>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<Field, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
            get_notes(self.context, storage_slot, options);

        let retrieved_note = retrieved_notes.get(0);
        let note_hash = note_hashes.get(0);

        destroy_note_unsafe(self.context, retrieved_note, note_hash);
    }

    #[external("private")]
    fn test_note_inclusion(owner: AztecAddress, storage_slot: Field) {
        let mut options = NoteGetterOptions::new();
        options = options.set_limit(1);

        let (retrieved_notes, _): (BoundedVec<RetrievedNote<UintNote>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<Field, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
            get_notes(self.context, storage_slot, options);

        let header = self.context.get_anchor_block_header();

        header.prove_note_inclusion(retrieved_notes.get(0), storage_slot);
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
        self.context.push_nullifier(nullifier);
    }

    #[external("private")]
    #[noinitcheck]
    fn emit_nullifier(nullifier: Field) {
        self.context.push_nullifier(nullifier);
    }

    // For testing non-note encrypted logs
    #[external("private")]
    fn emit_array_as_encrypted_log(fields: [Field; 5], owner: AztecAddress, nest: bool) {
        let event = ExampleEvent {
            value0: fields[0],
            value1: fields[1],
            value2: fields[2],
            value3: fields[3],
            value4: fields[4],
        };

        self.emit(event, owner, MessageDelivery.UNCONSTRAINED_ONCHAIN);

        // this contract has reached max number of functions, so using this one fn
        // to test nested and non nested encrypted logs
        if nest {
            self.call_self.emit_array_as_encrypted_log([0, 0, 0, 0, 0], owner, false);

            // Emit a log with non-encrypted content for testing purpose.
            let leaky_log = event.serialize().concat([0; PRIVATE_LOG_SIZE_IN_FIELDS - 5]);
            self.context.emit_private_log(leaky_log, 5);
        }
    }

    #[external("public")]
    fn emit_public(value: Field) {
        self.context.emit_public_log(/*message=*/ value);
        self.context.emit_public_log(/*message=*/ [10, 20, 30]);
        self.context.emit_public_log(/*message=*/ "Hello, world!");
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

    impl DummyNote {
        fn new(amount: Field, secret_hash: Field) -> Self {
            Self { amount, secret_hash }
        }

        fn get_commitment(self) -> Field {
            pedersen_hash([self.amount, self.secret_hash], 0)
        }
    }

    #[derive(Serialize)]
    pub struct DeepStruct {
        pub a_field: Field,
        pub a_bool: bool,
        pub a_note: DummyNote,
        pub many_notes: [DummyNote; 3],
    }
}
