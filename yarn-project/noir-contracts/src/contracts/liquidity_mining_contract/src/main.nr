mod types;

// A demonstration of private liquidity mining.
contract LiquidityMining {
    use dep::aztec::{
        state_vars::{
            map::Map,
            set::Set,
        },
        types::address::AztecAddress,
        context::Context,
        note::{
            note_getter_options::NoteGetterOptions,
            note_header::NoteHeader,
            utils as note_utils,
        },
        // oracle::debug_log::debug_log_format,
    };

    use crate::types::lp_note::{LPNote, LPNoteMethods, LP_NOTE_LEN};

    struct Storage {
        balances: Map<Set<LPNote, LP_NOTE_LEN>>,
    }

    impl Storage {
        fn init(context: Context) -> pub Self {
            Storage {
                balances: Map::new(
                    context,
                    1, // Storage slot
                    |context, slot| {
                        Set::new(context, slot, LPNoteMethods)
                    },
                ),
            }
        }
    }

    #[aztec(private)]
    fn constructor() {}

    // Mints `amount` of LP tokens to `owner`.
    #[aztec(private)]
    fn mint(
        owner: AztecAddress,
        amount: Field,
    ) {
        let owner_balance = storage.balances.at(owner.address);
        let mut note = LPNote::new(amount, owner);
        owner_balance.insert(&mut note, true);
    }


    // Proves that the owner owned an LP note for a specific time period and distributes the reward based
    // on the deposit amount and the length of time the note was owned.
    //
    // The scheme works as follows:
    // 1) Prove that I owned the note at the start of the time period.
    //      a) Pop HAT root of the stack (this will eventually be injected by kernel since this is not safe and for
    //         experimental purposes only).
    //      b) Pop all the preimages of block hash from the stack (this contains note hash tree root and timestamp).
    //      c) Compute the block hash.
    //      d) Pop sibling path of the block hash in the HAT from the stack.
    //      e) Prove that the block hash is in the HAT.
    //      f) Get the note/preimage from PXE.
    //      g) Compute the commitment from the note.
    //      h) Pop the note commitment sibling path in the note hash tree from the stack.
    //      i) Verify that the commitment is in the note hash tree.
    // 2) Prove that the note has not yet been nullified by emitting a nullifier.
    // 3) Use the timestamp from 1.b), current timestamp and the note amount from 1.f) to compute the reward.
    // 4) Transfer the reward to the owner.
    #[aztec(private)]
    fn claim(
        owner: AztecAddress,
    ) {
        let balances = storage.balances.at(owner.address);

        let options = NoteGetterOptions::new().select(1, owner.address).set_limit(1);
        let notes = balances.get_notes(options);
        let note = notes[0].unwrap();

        // Remove/nullify the note
        balances.remove(note);
    }

    // Computes note hash and nullifier.
    // Note 1: Needs to be defined by every contract producing logs.
    // Note 2: Having it in all the contracts gives us the ability to compute the note hash and nullifier differently for different kind of notes.
    unconstrained fn compute_note_hash_and_nullifier(contract_address: Field, nonce: Field, storage_slot: Field, serialized_note: [Field; LP_NOTE_LEN]) -> [Field; 4] {
        let note_header = NoteHeader::new(contract_address, nonce, storage_slot);
        note_utils::compute_note_hash_and_nullifier(LPNoteMethods, note_header, serialized_note)
    }
}
