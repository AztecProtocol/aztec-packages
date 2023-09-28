mod historic_commitment_oracle;
mod almost_value_note;

// A contract used for testing a random hodgepodge of small features from simulator and end-to-end tests.
contract StatefulTest {
    use dep::std::option::Option;
    use dep::std::merkle::compute_merkle_root;
    use dep::value_note::{
        balance_utils,
        utils::{increment, decrement},
        value_note::{VALUE_NOTE_LEN, ValueNote, ValueNoteMethods},
    };
    use dep::aztec::{
        context::{PrivateContext, PublicContext, Context},
        note::{
            note_header::NoteHeader,
            utils as note_utils,
        },
        state_vars::{map::Map, public_state::PublicState, set::Set},
        types::type_serialization::field_serialization::{
            FieldSerializationMethods, FIELD_SERIALIZED_LEN,
        },
    };
    use dep::aztec::constants_gen::PRIVATE_DATA_TREE_HEIGHT;
    use crate::historic_commitment_oracle::{get_private_data_sibling_witness, PrivateDataMembershipWitness};
    use dep::aztec::note::utils::compute_note_hash_for_read_or_nullify;
    use crate::almost_value_note::AlmostValueNote;

    struct Storage {
        notes: Map<Set<ValueNote, VALUE_NOTE_LEN>>,
        public_values: Map<PublicState<Field, FIELD_SERIALIZED_LEN>>,
    }

    impl Storage {
        fn init(context: Context) -> pub Self {
            Storage {
                notes: Map::new(
                    context,
                    1, // Storage slot
                    |context, slot| {
                        Set::new(context, slot, ValueNoteMethods)
                    },
                ),
                public_values: Map::new(
                    context,
                    2,
                    |context, slot| {
                        PublicState::new(
                            context,
                            slot,
                            FieldSerializationMethods,
                        )
                    },
                ),
            }
        }
    }

    #[aztec(private)]
    fn constructor(owner: Field, value: Field) {
        
        let loc = storage.notes.at(owner);
        increment(loc, value, owner);
    }

    #[aztec(private)]
    fn create_note(
        owner: Field,
        value: Field, 
    )  {
        
        if (value != 0){
            let loc = storage.notes.at(owner);
            increment(loc, value, owner);
        }
    }

    #[aztec(private)]
    fn destroy_and_create(
        recipient: Field,
        amount: Field, 
    )  {
        
        let sender = context.msg_sender();

        let sender_notes = storage.notes.at(sender);
        decrement(sender_notes, amount, sender);

        let recipient_notes = storage.notes.at(recipient);
        increment(recipient_notes, amount, recipient);
    }

    // We cannot use valueNote directly because of its serialize here. Unconstrained are different.
    #[aztec(private)]
    fn is_included_in_history(
        note: AlmostValueNote
    ) {
        let note = note.to_value_note();
        let commitment = compute_note_hash_for_read_or_nullify(ValueNoteMethods, note);
        let witness = get_private_data_sibling_witness(commitment);
        let root = compute_merkle_root(commitment, witness.index, witness.path);
        assert(context.block_data.private_data_tree_root == root, "Note is not included in history");
    }

    unconstrained fn get_path(
        note: ValueNote
    ) -> [Field; PRIVATE_DATA_TREE_HEIGHT] {
        // compute the commitment 
        let commitment = compute_note_hash_for_read_or_nullify(ValueNoteMethods, note);
        let witness = get_private_data_sibling_witness(commitment);
        witness.path
    }

    unconstrained fn get_commitment(
        note: ValueNote
    ) -> Field {
        compute_note_hash_for_read_or_nullify(ValueNoteMethods, note)
    }

    unconstrained fn get_root(note: ValueNote) -> Field {
        // compute the commitment 
        let commitment = compute_note_hash_for_read_or_nullify(ValueNoteMethods, note);
        let witness = get_private_data_sibling_witness(commitment);
        compute_merkle_root(commitment, witness.index, witness.path)
    }

    unconstrained fn summed_values(
        owner: Field,
    ) -> Field {
        
        let owner_balance = storage.notes.at(owner);

        // Return the sum of all notes in the set.
        balance_utils::get_balance(owner_balance)
    }

    unconstrained fn compute_note_hash_and_nullifier(contract_address: Field, nonce: Field, storage_slot: Field, preimage: [Field; VALUE_NOTE_LEN]) -> [Field; 4] {
        let note_header = NoteHeader { contract_address, nonce, storage_slot };
        note_utils::compute_note_hash_and_nullifier(ValueNoteMethods, note_header, preimage)
    }
}
