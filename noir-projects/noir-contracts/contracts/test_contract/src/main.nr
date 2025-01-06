mod test_note;

// A contract used for testing a random hodgepodge of small features from simulator and end-to-end tests.
use dep::aztec::macros::aztec;

#[aztec]
contract Test {

    use dep::aztec::encrypted_logs::encrypted_event_emission::encode_and_encrypt_event_unconstrained;
    use dep::aztec::encrypted_logs::encrypted_note_emission::encode_and_encrypt_note;
    use dep::aztec::prelude::{
        AztecAddress, EthAddress, FunctionSelector, NoteGetterOptions, NoteViewerOptions,
        PrivateImmutable, PrivateSet,
    };

    use dep::aztec::protocol_types::{
        constants::{MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, PRIVATE_LOG_SIZE_IN_FIELDS},
        point::Point,
        traits::Serialize,
        utils::arrays::array_concat,
    };

    use dep::aztec::keys::getters::get_public_keys;
    use dep::aztec::note::constants::MAX_NOTES_PER_PAGE;

    use dep::aztec::{
        deploy::deploy_contract as aztec_deploy_contract,
        hash::{ArgsHasher, compute_secret_hash, pedersen_hash},
        macros::{events::event, functions::{internal, private, public}, storage::storage},
        note::{
            lifecycle::{create_note, destroy_note_unsafe},
            note_getter::{get_notes, view_notes},
            note_getter_options::NoteStatus,
        },
        oracle::random::random,
        utils::comparison::Comparator,
    };
    use dep::token_portal_content_hash_lib::{
        get_mint_to_private_content_hash, get_mint_to_public_content_hash,
    };
    use dep::value_note::value_note::ValueNote;
    use std::meta::derive;

    use crate::test_note::TestNote;
    #[derive(Serialize)]
    #[event]
    struct ExampleEvent {
        value0: Field,
        value1: Field,
        value2: Field,
        value3: Field,
        value4: Field,
    }

    #[storage]
    struct Storage<Context> {
        example_constant: PrivateImmutable<TestNote, Context>,
        example_set: PrivateSet<TestNote, Context>,
    }

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

    #[private]
    fn call_create_note(
        value: Field,
        owner: AztecAddress,
        sender: AztecAddress,
        storage_slot: Field,
    ) {
        assert(
            storage_slot != storage.example_constant.get_storage_slot(),
            "this storage slot is reserved for example_constant",
        );

        let mut note = ValueNote::new(value, owner);
        create_note(&mut context, storage_slot, &mut note).emit(encode_and_encrypt_note(
            &mut context,
            owner,
            sender,
        ));
    }

    #[private]
    fn call_get_notes(storage_slot: Field, active_or_nullified: bool) -> Field {
        assert(
            storage_slot != storage.example_constant.get_storage_slot(),
            "this storage slot is reserved for example_constant",
        );

        let mut options = NoteGetterOptions::new();
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let (notes, _): (BoundedVec<ValueNote, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<Field, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
            get_notes(&mut context, storage_slot, options);

        notes.get(0).value
    }

    #[private]
    fn call_get_notes_many(storage_slot: Field, active_or_nullified: bool) -> [Field; 2] {
        assert(
            storage_slot != storage.example_constant.get_storage_slot(),
            "this storage slot is reserved for example_constant",
        );

        let mut options = NoteGetterOptions::new();
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let (notes, _): (BoundedVec<ValueNote, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<Field, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
            get_notes(&mut context, storage_slot, options);

        [notes.get(0).value, notes.get(1).value]
    }

    unconstrained fn call_view_notes(storage_slot: Field, active_or_nullified: bool) -> pub Field {
        assert(
            storage_slot != storage.example_constant.get_storage_slot(),
            "this storage slot is reserved for example_constant",
        );

        let mut options = NoteViewerOptions::new();
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> = view_notes(storage_slot, options);

        notes.get(0).value
    }

    unconstrained fn call_view_notes_many(
        storage_slot: Field,
        active_or_nullified: bool,
    ) -> pub [Field; 2] {
        assert(
            storage_slot != storage.example_constant.get_storage_slot(),
            "this storage slot is reserved for example_constant",
        );

        let mut options = NoteViewerOptions::new();
        if (active_or_nullified) {
            options = options.set_status(NoteStatus.ACTIVE_OR_NULLIFIED);
        }

        let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> = view_notes(storage_slot, options);

        [notes.get(0).value, notes.get(1).value]
    }

    #[private]
    fn call_destroy_note(storage_slot: Field) {
        assert(
            storage_slot != storage.example_constant.get_storage_slot(),
            "this storage slot is reserved for example_constant",
        );

        let options = NoteGetterOptions::new();
        let (notes, note_hashes): (BoundedVec<ValueNote, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<Field, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
            get_notes(&mut context, storage_slot, options);

        let note = notes.get(0);
        let note_hash = note_hashes.get(0);

        destroy_note_unsafe(&mut context, note, note_hash);
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

    // Purely exists for testing
    #[public]
    fn create_l2_to_l1_message_public(
        amount: Field,
        secret_hash: Field,
        portal_address: EthAddress,
    ) {
        // Create a commitment to the amount
        let note = DummyNote::new(amount, secret_hash);

        // Public oracle call to emit new commitment.
        context.message_portal(portal_address, note.get_commitment());
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

        event.emit(encode_and_encrypt_event_unconstrained(&mut context, owner, sender));

        // this contract has reached max number of functions, so using this one fn
        // to test nested and non nested encrypted logs
        if nest {
            Test::at(context.this_address())
                .emit_array_as_encrypted_log([0, 0, 0, 0, 0], owner, sender, false)
                .call(&mut context);

            // Emit a log with non-encrypted content for testing purpose.
            let leaky_log = array_concat(event.serialize(), [0; PRIVATE_LOG_SIZE_IN_FIELDS - 5]);
            context.emit_private_log(leaky_log);
        }
    }

    #[private]
    fn emit_encrypted_logs_nested(value: Field, owner: AztecAddress, sender: AztecAddress) {
        let mut storage_slot = storage.example_constant.get_storage_slot() + 1;
        Test::at(context.this_address()).call_create_note(value, owner, sender, storage_slot).call(
            &mut context,
        );
        storage_slot += 1;

        let mut note = ValueNote::new(value + 1, owner);
        create_note(&mut context, storage_slot, &mut note).emit(encode_and_encrypt_note(
            &mut context,
            owner,
            sender,
        ));
        storage_slot += 1;
        Test::at(context.this_address())
            .call_create_note(value + 2, owner, sender, storage_slot)
            .call(&mut context);
    }

    // docs:start:is-time-equal
    #[public]
    fn is_time_equal(time: u64) -> u64 {
        assert(context.timestamp() == time);
        time
    }
    // docs:end:is-time-equal

    #[public]
    fn emit_unencrypted(value: Field) {
        // docs:start:emit_unencrypted
        context.emit_unencrypted_log(/*message=*/ value);
        context.emit_unencrypted_log(/*message=*/ [10, 20, 30]);
        context.emit_unencrypted_log(/*message=*/ "Hello, world!");
        // docs:end:emit_unencrypted
    }

    #[public]
    fn consume_mint_to_public_message(
        to: AztecAddress,
        amount: Field,
        secret: Field,
        message_leaf_index: Field,
        portal_address: EthAddress,
    ) {
        let content_hash = get_mint_to_public_content_hash(to, amount);
        // Consume message and emit nullifier
        context.consume_l1_to_l2_message(content_hash, secret, portal_address, message_leaf_index);
    }

    #[private]
    fn consume_mint_to_private_message(
        amount: Field,
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
    fn set_constant(value: Field) {
        let mut note = TestNote::new(value);
        storage.example_constant.initialize(&mut note).discard();
    }

    #[private]
    fn assert_private_global_vars(chain_id: Field, version: Field) {
        assert(context.chain_id() == chain_id, "Invalid chain id");
        assert(context.version() == version, "Invalid version");
    }

    #[public]
    fn assert_public_global_vars(
        chain_id: Field,
        version: Field,
        block_number: Field,
        timestamp: u64,
        fee_per_da_gas: Field,
        fee_per_l2_gas: Field,
    ) {
        assert(context.chain_id() == chain_id, "Invalid chain id");
        assert(context.version() == version, "Invalid version");
        assert(context.block_number() == block_number, "Invalid block number");
        assert(context.timestamp() == timestamp, "Invalid timestamp");
        assert(context.fee_per_da_gas() == fee_per_da_gas, "Invalid fee per da gas");
        assert(context.fee_per_l2_gas() == fee_per_l2_gas, "Invalid fee per l2 gas");
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

    #[private]
    // Adapted from TokenContract#redeem_shield but without an initcheck so it can be run in simulator/src/client/private_execution.test.ts
    fn consume_note_from_secret(secret: Field) {
        let notes_set = storage.example_set;
        let secret_hash = compute_secret_hash(secret);
        let mut options = NoteGetterOptions::new();
        options =
            options.select(TestNote::properties().value, Comparator.EQ, secret_hash).set_limit(1);
        let notes = notes_set.pop_notes(options);
        assert(notes.len() == 1, "note not popped");
    }

    unconstrained fn get_constant() -> pub Field {
        let constant = storage.example_constant.view_note();
        constant.value
    }

    #[private]
    fn test_nullifier_key_freshness(address: AztecAddress, public_nullifying_key: Point) {
        assert_eq(get_public_keys(address).npk_m.inner, public_nullifying_key);
    }

    // Purely exists for testing
    unconstrained fn get_random(kinda_seed: Field) -> pub Field {
        kinda_seed * random()
    }

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

    impl Serialize<2> for DummyNote {
        fn serialize(self) -> [Field; 2] {
            [self.amount, self.secret_hash]
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
