// A contract used for testing a random hodgepodge of small features from simulator and end-to-end tests.
contract StatefulTest {
    use dep::std::option::Option;
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
        selector::compute_selector,
        state_vars::{map::Map, public_state::PublicState, set::Set},
        types::type_serialization::field_serialization::{
            FieldSerializationMethods, FIELD_SERIALIZED_LEN,
        },
    };
    use dep::slow_updates_tree::slow_struct::{SlowStruct, Inner};

    struct Storage {
        notes: Map<Set<ValueNote, VALUE_NOTE_LEN>>,
        public_values: Map<PublicState<Field, FIELD_SERIALIZED_LEN>>,
        slow: SlowStruct<Field, FIELD_SERIALIZED_LEN>,
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
                slow: SlowStruct::new(
                    context,
                    3,
                    FieldSerializationMethods,
                ),
            }
        }
    }

    #[aztec(private)]
    fn constructor(owner: Field, value: Field) {
        let loc = storage.notes.at(owner);
        increment(loc, value, owner);
    }

    #[aztec(public)]
    fn set_slow_update(new_value: Field) {
        // Note that this will not change current value (its delayed). 
        // Only takes effect in next "update" of slow tree.
        storage.slow.write(new_value);
    }

    #[aztec(private)]
    fn is_matching(value: Field) {
        // Computing the root in private to not leak exactly what I read.
        // Should fetch the values from an oracle instead, but this is experimentation.
        let root = storage.slow.compute_root(value);

        let selector = compute_selector("_is_matching(Field)");
        context.call_public_function(context.this_address(), selector, [root]);
    }

    #[aztec(public)]
    internal fn _is_matching(root: Field) {
        let valid = storage.slow.current_root() == root;
        assert(valid, "Not matching slow updates tree");
    }

    unconstrained fn read_all_slow() -> [Field; 5] {
        let inner = storage.slow.read_inner().serialize();
        let before = storage.slow.read_value(true);
        let after = storage.slow.read_value(false);

        [inner[0], inner[1], inner[2], before, after]
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

    unconstrained fn summed_values(
        owner: Field,
    ) -> Field {
        
        let owner_balance = storage.notes.at(owner);

        // Return the sum of all notes in the set.
        balance_utils::get_balance(owner_balance)
    }

    unconstrained fn compute_note_hash_and_nullifier(contract_address: Field, nonce: Field, storage_slot: Field, serialized_note: [Field; VALUE_NOTE_LEN]) -> [Field; 4] {
        let note_header = NoteHeader::new(contract_address, nonce, storage_slot);
        note_utils::compute_note_hash_and_nullifier(ValueNoteMethods, note_header, serialized_note)
    }
}
