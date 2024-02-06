contract Blank {
    use dep::aztec::{
        abi,
        protocol_types::address::AztecAddress,
        state_vars::singleton::Singleton,
        context::{PrivateContext, PublicContext, Context},
        note::{
            utils as note_utils,
            note_interface::NoteInterface,
            note_header::NoteHeader,
        },
    };

    use dep::value_note::value_note::{ValueNote, VALUE_NOTE_LEN};
    
    use dep::easy_private_state::easy_private_state::EasyPrivateUint;

    struct Storage {
        number: Singleton<ValueNote>,
    }

    impl Storage {
        fn init(context: Context) -> pub Self {
            Storage {
                number: Singleton::new(
                    context,
                    1
                ),
            }
        }
    }
    
    #[aztec(private)]
    fn constructor(number: Field, owner: AztecAddress) {
        let mut new_number = ValueNote::new(number, owner);
        storage.number.initialize(&mut new_number, true);
    }

    #[aztec(private)]
    fn setNumber(number: Field) {
        let mut new_number = ValueNote::new(number, context.msg_sender());
        storage.number.replace(&mut new_number, true);
    }

    unconstrained fn getNumber() -> pub ValueNote {
        storage.number.view_note()
    }

    unconstrained fn compute_note_hash_and_nullifier(
        contract_address: AztecAddress,
        nonce: Field,
        storage_slot: Field,
        serialized_note: [Field; VALUE_NOTE_LEN]
    ) -> pub [Field; 4] {
        let note_header = NoteHeader::new(contract_address, nonce, storage_slot);
        note_utils::compute_note_hash_and_nullifier(ValueNote::deserialize, note_header, serialized_note)
    }
}
