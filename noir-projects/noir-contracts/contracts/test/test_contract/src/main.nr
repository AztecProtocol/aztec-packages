mod test;
mod test_note;

// A contract used for testing a random hodgepodge of small features from simulator and end-to-end tests.
use dep::aztec::macros::aztec;

// DEPRECATED: This contract is deprecated. If you want to test new features, create a simple new contract used
// to test only that one feature. See NoConstructor contract for example.
#[aztec]
pub contract Test {
    // Note: If you import a new kind of note you will most likely need to update the test_note_type_id test
    // as the note type ids of current notes might have changed.

    use dep::aztec::messages::logs::note::encode_and_encrypt_note;
    use dep::aztec::prelude::{
        AztecAddress, EthAddress, FunctionSelector, Map, NoteGetterOptions, NoteViewerOptions,
        PrivateImmutable, PrivateMutable, PrivateSet, PublicImmutable, SharedMutable,
    };

    use dep::aztec::protocol_types::{
        constants::{MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, PRIVATE_LOG_SIZE_IN_FIELDS},
        traits::{Hash, Packable, Serialize},
        utils::arrays::array_concat,
    };

    use dep::aztec::keys::getters::get_public_keys;
    use dep::aztec::note::constants::MAX_NOTES_PER_PAGE;

    use dep::aztec::{
        deploy::deploy_contract as aztec_deploy_contract,
        event::event_interface::{emit_event_in_private_log, PrivateLogContent},
        hash::{ArgsHasher, pedersen_hash},
        history::note_inclusion::ProveNoteInclusion,
        macros::{
            events::event,
            functions::{initializer, internal, noinitcheck, private, public, utility},
            storage::storage,
        },
        note::{
            lifecycle::{create_note, destroy_note_unsafe},
            note_getter::{get_notes, view_notes},
            note_getter_options::NoteStatus,
            retrieved_note::RetrievedNote,
        },
        test::mocks::mock_struct::MockStruct,
    };
    use dep::token_portal_content_hash_lib::get_mint_to_private_content_hash;
    use std::meta::derive;

    // We are importing different kinds of notes to test the note type ids
    use crate::test_note::TestNote;
    use address_note::address_note::AddressNote;
    use value_note::value_note::ValueNote;

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

    global SHARED_MUTABLE_INITIAL_DELAY: u32 = 2;

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
        struct_in_shared_mutable: SharedMutable<ExampleStruct, SHARED_MUTABLE_INITIAL_DELAY, Context>,
        dummy_variable: PrivateImmutable<TestNote, Context>,
    }

    #[initializer]
    #[private]
    // We can name our initializer anything we want as long as it's marked as aztec(initializer)
    fn initialize() {}

    #[private]
    fn get_ovsk_app(ovpk_m_hash: Field) -> Field {
        context.request_ovsk_app(ovpk_m_hash)
    }

    #[private]
    fn get_master_incoming_viewing_public_key(address: AztecAddress) -> [Field; 2] {
        let ivpk_m = get_public_keys(address).ivpk_m;

        [ivpk_m.inner.x, ivpk_m.inner.y]
    }

    // Get the address of this contract (taken from the input context)
    #[private]
    fn get_this_address() -> AztecAddress {
        context.this_address()
    }

    #[private]
    fn set_tx_max_block_number(max_block_number: u32, enqueue_public_call: bool) {
        context.set_tx_max_block_number(max_block_number);

        if enqueue_public_call {
            Test::at(context.this_address()).dummy_public_call().enqueue(&mut context)
        }
    }

    #[public]
    #[internal]
    fn dummy_public_call() {}

    // docs:start:create_note
    #[private]
    fn call_create_note(
        value: Field,
        owner: AztecAddress,
        sender: AztecAddress,
        storage_slot: Field,
    ) {
        let note = ValueNote::new(value, owner);
        create_note(&mut context, storage_slot, note).emit(encode_and_encrypt_note(
            &mut context,
            owner,
            sender,
        ));
    }
    // docs:end:create_note

    #[private]
    fn call_get_notes(storage_slot: Field, active_or_nullified: bool) -> Field {
        let mut options = NoteGetterOptions::new();
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        // docs:start:get_note_from_pxe
        let (retrieved_notes, _): (BoundedVec<RetrievedNote<ValueNote>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<Field, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
            get_notes(&mut context, storage_slot, options);
        // docs:end:get_note_from_pxe

        retrieved_notes.get(0).note.value
    }

    #[private]
    fn call_get_notes_many(storage_slot: Field, active_or_nullified: bool) -> [Field; 2] {
        let mut options = NoteGetterOptions::new();
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let (retrieved_notes, _): (BoundedVec<RetrievedNote<ValueNote>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<Field, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
            get_notes(&mut context, storage_slot, options);

        [retrieved_notes.get(0).note.value, retrieved_notes.get(1).note.value]
    }

    #[utility]
    unconstrained fn call_view_notes(storage_slot: Field, active_or_nullified: bool) -> Field {
        let mut options = NoteViewerOptions::new();
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> = view_notes(storage_slot, options);

        notes.get(0).value
    }

    #[utility]
    unconstrained fn call_view_notes_many(
        storage_slot: Field,
        active_or_nullified: bool,
    ) -> [Field; 2] {
        let mut options = NoteViewerOptions::new();
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> = view_notes(storage_slot, options);

        [notes.get(0).value, notes.get(1).value]
    }

    #[private]
    fn call_destroy_note(storage_slot: Field) {
        let options = NoteGetterOptions::new();
        let (retrieved_notes, note_hashes): (BoundedVec<RetrievedNote<ValueNote>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<Field, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
            get_notes(&mut context, storage_slot, options);

        let retrieved_note = retrieved_notes.get(0);
        let note_hash = note_hashes.get(0);

        // docs:start:nullify_note
        destroy_note_unsafe(&mut context, retrieved_note, note_hash);
        // docs:end:nullify_note
    }

    #[private]
    fn test_note_inclusion(owner: AztecAddress, storage_slot: Field) {
        let mut options = NoteGetterOptions::new();
        options = options.set_limit(1);

        let (retrieved_notes, _): (BoundedVec<RetrievedNote<ValueNote>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<Field, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
            get_notes(&mut context, storage_slot, options);

        let header = context.get_block_header();

        header.prove_note_inclusion(retrieved_notes.get(0), storage_slot);
    }

    #[private]
    fn test_code_gen(
        a_field: Field,
        a_bool: bool,
        a_number: u32,
        an_array: [Field; 2],
        a_struct: DummyNote,
        a_deep_struct: DeepStruct,
    ) -> Field {
        let mut args = ArgsHasher::new();
        args.add(a_field);
        args.add(a_bool as Field);
        args.add(a_number as Field);
        args.add_multiple(an_array);
        args.add(a_struct.amount);
        args.add(a_struct.secret_hash);
        args.add(a_deep_struct.a_field);
        args.add(a_deep_struct.a_bool as Field);
        args.add(a_deep_struct.a_note.amount);
        args.add(a_deep_struct.a_note.secret_hash);
        for note in a_deep_struct.many_notes {
            args.add(note.amount);
            args.add(note.secret_hash);
        }
        args.hash()
    }

    #[private]
    fn test_setting_teardown() {
        context.set_public_teardown_function(
            context.this_address(),
            comptime { FunctionSelector::from_signature("dummy_public_call()") },
            [],
        );
    }

    #[private]
    fn test_setting_fee_payer() {
        context.set_as_fee_payer();
    }

    #[public]
    fn create_l2_to_l1_message_arbitrary_recipient_public(content: Field, recipient: EthAddress) {
        // Public oracle call to emit new commitment.
        context.message_portal(recipient, content);
    }

    #[private]
    fn create_l2_to_l1_message_arbitrary_recipient_private(content: Field, recipient: EthAddress) {
        // Public oracle call to emit new commitment.
        context.message_portal(recipient, content);
    }

    // Purely exists for testing
    #[public]
    fn emit_nullifier_public(nullifier: Field) {
        context.push_nullifier(nullifier);
    }

    // Forcefully emits a nullifier (for testing purposes)
    #[private]
    #[noinitcheck]
    fn emit_nullifier(nullifier: Field) {
        context.push_nullifier(nullifier);
    }

    // For testing non-note encrypted logs
    #[private]
    fn emit_array_as_encrypted_log(
        fields: [Field; 5],
        owner: AztecAddress,
        sender: AztecAddress,
        nest: bool,
    ) {
        let event = ExampleEvent {
            value0: fields[0],
            value1: fields[1],
            value2: fields[2],
            value3: fields[3],
            value4: fields[4],
        };

        emit_event_in_private_log(
            event,
            &mut context,
            sender,
            owner,
            PrivateLogContent.NO_CONSTRAINTS,
        );

        // this contract has reached max number of functions, so using this one fn
        // to test nested and non nested encrypted logs
        if nest {
            Test::at(context.this_address())
                .emit_array_as_encrypted_log([0, 0, 0, 0, 0], owner, sender, false)
                .call(&mut context);

            // Emit a log with non-encrypted content for testing purpose.
            let leaky_log = array_concat(event.serialize(), [0; PRIVATE_LOG_SIZE_IN_FIELDS - 5]);
            context.emit_private_log(leaky_log, 5);
        }
    }

    #[public]
    fn emit_public(value: Field) {
        // docs:start:emit_public
        context.emit_public_log(/*message=*/ value);
        context.emit_public_log(/*message=*/ [10, 20, 30]);
        context.emit_public_log(/*message=*/ "Hello, world!");
        // docs:end:emit_public
    }

    #[private]
    fn consume_mint_to_private_message(
        amount: u128,
        secret_for_L1_to_L2_message_consumption: Field,
        portal_address: EthAddress,
        message_leaf_index: Field,
    ) {
        // Consume L1 to L2 message and emit nullifier
        let content_hash = get_mint_to_private_content_hash(amount);
        context.consume_l1_to_l2_message(
            content_hash,
            secret_for_L1_to_L2_message_consumption,
            portal_address,
            message_leaf_index,
        );
    }

    #[public]
    fn consume_message_from_arbitrary_sender_public(
        content: Field,
        secret: Field,
        sender: EthAddress,
        message_leaf_index: Field,
    ) {
        // Consume message and emit nullifier
        context.consume_l1_to_l2_message(content, secret, sender, message_leaf_index);
    }

    #[private]
    fn consume_message_from_arbitrary_sender_private(
        content: Field,
        secret: Field,
        sender: EthAddress,
        message_leaf_index: Field,
    ) {
        // Consume message and emit nullifier
        context.consume_l1_to_l2_message(content, secret, sender, message_leaf_index);
    }

    #[private]
    fn assert_private_global_vars(chain_id: Field, version: Field) {
        assert(context.chain_id() == chain_id, "Invalid chain id");
        assert(context.version() == version, "Invalid version");
    }

    #[private]
    fn assert_header_private(header_hash: Field) {
        assert(context.historical_header.hash() == header_hash, "Invalid header hash");
    }

    // TODO(4840): add AVM opcodes for getting header (members)
    //#[public]
    //fn assert_header_public(header_hash: Field) {
    //    assert(context.historical_header.hash() == header_hash, "Invalid header hash");
    //}

    #[private]
    fn deploy_contract(target: AztecAddress) {
        aztec_deploy_contract(&mut context, target);
    }

    #[derive(Serialize)]
    pub struct DummyNote {
        amount: Field,
        secret_hash: Field,
    }

    impl DummyNote {
        fn new(amount: Field, secret_hash: Field) -> Self {
            Self { amount, secret_hash }
        }

        fn get_commitment(self) -> Field {
            pedersen_hash([self.amount, self.secret_hash], 0)
        }
    }

    pub struct DeepStruct {
        a_field: Field,
        a_bool: bool,
        a_note: DummyNote,
        many_notes: [DummyNote; 3],
    }

    // Serializing using "canonical" form.
    // 1. Everything that fits in a field, *becomes* a Field
    // 2. Strings become arrays of bytes (no strings here)
    // 4. Arrays become arrays of Fields following rules 2 and 3 (no arrays here)
    // 5. Structs become arrays of Fields, with every item defined in the same order as they are in Noir code, following rules 2, 3, 4 and 5 (recursive)
    impl Serialize<10> for DeepStruct {
        fn serialize(self) -> [Field; 10] {
            let mut result = [0; 10];
            result[0] = self.a_field;
            result[1] = self.a_bool as Field;
            result[2] = self.a_note.amount;
            result[3] = self.a_note.secret_hash;
            for i in 0..3 {
                result[4 + i * 2] = self.many_notes[i].amount;
                result[5 + i * 2] = self.many_notes[i].secret_hash;
            }
            result
        }
    }
}
