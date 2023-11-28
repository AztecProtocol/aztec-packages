mod utils;

// A demonstration of inclusion and non-inclusion proofs.
contract InclusionProofs {
    use dep::std::merkle::compute_merkle_root;
    use dep::aztec::{
        state_vars::{
            map::Map,
            set::Set,
            public_state::PublicState,
        },
        selector::compute_selector,
        types::{
            address::AztecAddress,
            type_serialization::field_serialization::FieldSerializationMethods,
        },
        context::Context,
        note::{
            note_getter_options::NoteGetterOptions,
            note_header::NoteHeader,
            utils as note_utils,
        },
        constants_gen::{
            NOTE_HASH_TREE_HEIGHT,
            HISTORIC_BLOCKS_TREE_HEIGHT,
            PUBLIC_DATA_TREE_HEIGHT,
            GENERATOR_INDEX__PUBLIC_LEAF_INDEX,
        },
        oracle::{
            get_block_data::get_block_data,
            get_membership_witness::{
                get_membership_witness,
                MembershipWitness,
            },
            get_sibling_path::get_sibling_path,
            get_low_nullifier_membership_witness::{
                get_low_nullifier_membership_witness,
                LowNullifierMembershipWitness,
            },
        },
        hash::pedersen_hash,
    };
    use dep::value_note::value_note::{ValueNote, ValueNoteMethods, VALUE_NOTE_LEN};

    use crate::utils::{
        full_field_less_than,
        full_field_greater_than,
    };

    struct Storage {
        private_values: Map<Set<ValueNote, VALUE_NOTE_LEN>>,
        public_value: PublicState<Field, 1>,
    }

    impl Storage {
        fn init(context: Context) -> Self {
            Storage {
                private_values: Map::new(
                    context,
                    1, // Storage slot
                    |context, slot| {
                        Set::new(context, slot, ValueNoteMethods)
                    },
                ),
                public_value: PublicState::new(
                    context,
                    2, // Storage slot
                    FieldSerializationMethods,
                ),
            }
        }
    }

    #[aztec(private)]
    fn constructor(public_value: Field) {
        let selector = compute_selector("_initialize(Field)");
        context.call_public_function(context.this_address(), selector, [public_value]);
    }

    #[aztec(public)]
    internal fn _initialize(value: Field) {
        storage.public_value.write(value);
    }

    // Creates a value note owned by `owner`.
    #[aztec(private)]
    fn create_note(
        owner: AztecAddress,
        value: Field,
    ) {
        let owner_private_values = storage.private_values.at(owner.address);
        let mut note = ValueNote::new(value, owner.address);
        owner_private_values.insert(&mut note, true);
    }


    // Proves that the owner owned a ValueNote at block `block_number`.
    #[aztec(private)]
    fn proveNoteInclusion(
        owner: AztecAddress,
        block_number: Field, // The block at which we'll prove that the note exists
    ) {
        // TODO: assert that block number is less than the block number of context.block_data
        // --> This will either require a new oracle method that returns block_data.global_variables_hash preimage
        //     or modifying the private context so that we somehow expose it.

        // 1) Get historic block data from oracle and ensure that the block hash is included in the current blocks tree
        //    root.
        let block_data = get_block_data(block_number, context.block_data.blocks_tree_root);

        // 2) Get the note from PXE.
        let private_values = storage.private_values.at(owner.address);
        let options = NoteGetterOptions::new().select(1, owner.address).set_limit(1);
        let notes = private_values.get_notes(options);
        let note = notes[0].unwrap();

        // 3) Compute the commitment from the note
        let note_commitment = note_utils::compute_unique_siloed_note_hash(ValueNoteMethods, note);

        // 4) Get the membership witness of the note in the note hash tree
        let note_hash_tree_id = 2;
        let witness: MembershipWitness<NOTE_HASH_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT + 1> =
            get_membership_witness(block_number, note_hash_tree_id, note_commitment);

        // 5) Verify that the commitment is in the note hash tree
        assert(
            block_data.note_hash_tree_root == compute_merkle_root(note_commitment, witness.index, witness.path),
            "Proving membership of a note in note hash tree failed"
        );

        // --> Now we have traversed the trees all the way up to blocks tree root.
    }

    // Proves that the note was not yet nullified at block `block_number`.
    #[aztec(private)]
    fn proveNullifierNonInclusion(
        owner: AztecAddress,
        block_number: Field, // The block at which we'll prove that the nullifier does not exists
    ) {
        // TODO: assert that block number is less than the block number of context.block_data
        // --> This will either require a new oracle method that returns block_data.global_variables_hash preimage
        //     or modifying the private context so that we somehow expose it.

        // 1) Get historic block data from oracle and ensure that the block hash is included in the current blocks tree
        //    root.
        let block_data = get_block_data(block_number, context.block_data.blocks_tree_root);

        // 2) Get the note from PXE
        let private_values = storage.private_values.at(owner.address);
        let options = NoteGetterOptions::new().select(1, owner.address).set_limit(1);
        let notes = private_values.get_notes(options);
        let note = notes[0].unwrap();

        // 3) Compute the nullifier from the note
        let nullifier = note_utils::compute_siloed_nullifier(ValueNoteMethods, note);

        // 4) Get the membership witness of a low nullifier of the nullifier
        let witness = get_low_nullifier_membership_witness(block_number, nullifier);

        // 5) Prove that the nullifier is not included in the nullifier tree

        // 5.a) Compute the low nullifier leaf and prove that it is in the nullifier tree
        let low_nullifier_leaf = witness.leaf_data.hash();
        assert(
            block_data.nullifier_tree_root == compute_merkle_root(low_nullifier_leaf, witness.index, witness.path),
            "Proving membership of a low nullifier in the nullifier tree failed"
        );

        // 5.b) Prove that the low nullifier is smaller than the nullifier
        assert(
            full_field_less_than(witness.leaf_data.value, nullifier),
            "Proving that low_nullifier.value < nullifier failed"
        );

        // 5.c) Prove that the low nullifier is pointing "over" the nullifier to prove that the nullifier is not
        // included in the nullifier tree
        assert(
            full_field_greater_than(witness.leaf_data.next_value, nullifier),
            "Proving that low_nullifier.next_value > nullifier failed"
        );

        // --> Now we have traversed the trees all the way up to blocks tree root and verified that the nullifier
        //     was not yet included in the nullifier tree.
    }

    #[aztec(private)]
    fn provePublicValueInclusion(
        public_value: Field,
        block_number: Field, // The block at which we'll prove that the public value exists
    ) {
        // TODO: assert that block number is less than the block number of context.block_data
        // --> This will either require a new oracle method that returns block_data.global_variables_hash preimage
        //     or modifying the private context so that we somehow expose it.

        // 1) Get historic block data from oracle and ensure that the block hash is included in the current blocks tree
        //    root.
        let block_data = get_block_data(block_number, context.block_data.blocks_tree_root);

        // 2) Compute the public value leaf index.
        // We have to compute the leaf index here because unlike in the case of note commitments, public values are
        // not siloed with contract address so an oracle could cheat and give us a membership witness for arbitrary
        // value in the public data tree.
        let public_value_leaf_index = pedersen_hash(
            [context.this_address(), storage.public_value.storage_slot],
            GENERATOR_INDEX__PUBLIC_LEAF_INDEX
        );

        // 3) Get the sibling path of the public value leaf index in the public data tree at block `block_number`.
        let public_data_tree_id = 3;
        let path: [Field; PUBLIC_DATA_TREE_HEIGHT] =
            get_sibling_path(block_number, public_data_tree_id, public_value_leaf_index);

        // 4) Verify that the public value provided on input is in the public data tree
        assert(
            block_data.public_data_tree_root == compute_merkle_root(public_value, public_value_leaf_index, path),
            "Proving membership of a value in public data tree failed"
        );

        // --> Now we have traversed the trees all the way up to blocks tree root and that way verified that
        //     a specific `public_value` was really set in a given contract storage slot at block `block_number`.
    }

    // Computes note hash and nullifier.
    // Note 1: Needs to be defined by every contract producing logs.
    // Note 2: Having it in all the contracts gives us the ability to compute the note hash and nullifier differently for different kind of notes.
    unconstrained fn compute_note_hash_and_nullifier(contract_address: Field, nonce: Field, storage_slot: Field, serialized_note: [Field; VALUE_NOTE_LEN]) -> [Field; 4] {
        let note_header = NoteHeader::new(contract_address, nonce, storage_slot);
        note_utils::compute_note_hash_and_nullifier(ValueNoteMethods, note_header, serialized_note)
    }
}
