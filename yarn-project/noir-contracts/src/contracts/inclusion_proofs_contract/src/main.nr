// A demonstration of inclusion and non-inclusion proofs.
contract InclusionProofs {
    use dep::protocol_types::constants::{
        PUBLIC_DATA_TREE_HEIGHT,
        GENERATOR_INDEX__PUBLIC_LEAF_INDEX,
    };
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
        
        oracle::{
            get_membership_witness::{
                get_membership_witness,
                MembershipWitness,
            },
            get_sibling_path::get_sibling_path,
            get_nullifier_membership_witness::{
                get_nullifier_membership_witness,
            },
        },
        hash::pedersen_hash,
        history::{
            note_inclusion::{
                prove_note_commitment_inclusion,
                prove_note_inclusion,
            },
            nullifier_inclusion::{
                prove_nullifier_inclusion,
            },
            nullifier_non_inclusion::{
                prove_nullifier_non_inclusion,
                prove_note_not_nullified,
            },
        },
    };
    use dep::value_note::value_note::{ValueNote, ValueNoteMethods, VALUE_NOTE_LEN};

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
        block_number: u32, // The block at which we'll prove that the note exists
        spare_commitment: Field, // This is only used when the note is not found --> used to test the failure case
    ) {
        // 1) Get the note from PXE.
        let private_values = storage.private_values.at(owner.address);
        let options = NoteGetterOptions::new().select(1, owner.address).set_limit(1);
        let notes = private_values.get_notes(options);
        let maybe_note = notes[0];

        // 2) Prove the note inclusion
        if maybe_note.is_some() {
            prove_note_inclusion(ValueNoteMethods, maybe_note.unwrap_unchecked(), block_number, context);
        } else {
            // Note was not found so we will prove inclusion of the spare commitment
            prove_note_commitment_inclusion(spare_commitment, block_number, context);
        };
    }

    // Proves that the note was not yet nullified at block `block_number`.
    #[aztec(private)]
    fn proveNullifierNonInclusion(
        owner: AztecAddress,
        block_number: u32, // The block at which we'll prove that the nullifier does not exists
        spare_nullifier: Field, // This is only used when the note is not found --> used to test the failure case
    ) {
        // 2) Get the note from PXE
        let private_values = storage.private_values.at(owner.address);
        let options = NoteGetterOptions::new().select(1, owner.address).set_limit(1);
        let notes = private_values.get_notes(options);
        let maybe_note = notes[0];

        // 3) Compute the nullifier from the note
        if maybe_note.is_some() {
            prove_note_not_nullified(ValueNoteMethods, maybe_note.unwrap_unchecked(), block_number, context);
        } else {
            // Note was not found so we will use the spare nullifier
            prove_nullifier_non_inclusion(spare_nullifier, block_number, context);
        };
    }

    #[aztec(private)]
    fn nullifyNote(
        owner: AztecAddress,
    ) {
        let private_values = storage.private_values.at(owner.address);
        let options = NoteGetterOptions::new().select(1, owner.address).set_limit(1);
        let notes = private_values.get_notes(options);
        let note = notes[0].unwrap();

        private_values.remove(note);
    }

    // Proves nullifier existed at block `block_number`.
    // Note: I am not getting a nullifier of the note that was created in this contract in this function because it is
    //       currently not possible to obtain a nullified note from PXE.
    #[aztec(private)]
    fn proveNullifierInclusion(
        nullifier: Field,
        block_number: u32, // The block at which we'll prove that the nullifier not exists in the tree
    ) {
        prove_nullifier_inclusion(nullifier, block_number, context);
    }

    #[aztec(private)]
    fn provePublicValueInclusion(
        public_value: Field,
        block_number: u32, // The block at which we'll prove that the public value exists
    ) {
        // 1) Get block header from oracle and ensure that the block hash is included in the archive.
        let block_header = context.get_block_header(block_number);

        // 2) Compute the public value leaf index.
        // We have to compute the leaf index here because unlike in the case of note commitments, public values are
        // not siloed with contract address so an oracle could cheat and give us a membership witness for arbitrary
        // value in the public data tree.
        let public_value_leaf_index = pedersen_hash(
            [context.this_address(), storage.public_value.storage_slot],
            GENERATOR_INDEX__PUBLIC_LEAF_INDEX
        );

        // 3) Get the sibling path of the public value leaf index in the public data tree at block `block_number`.
        let public_data_tree_id = 3; // TODO(#3443)
        let path: [Field; PUBLIC_DATA_TREE_HEIGHT] =
            get_sibling_path(block_number, public_data_tree_id, public_value_leaf_index);

        // 4) Prove that the public value provided on input is in the public data tree
        assert(
            block_header.public_data_tree_root == compute_merkle_root(public_value, public_value_leaf_index, path),
            "Proving public value inclusion failed"
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