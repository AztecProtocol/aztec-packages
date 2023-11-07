// A demonstration of private liquidity mining.
contract LiquidityMining {

    use crate::types::{
        lp_note::{LPNote, LPNoteMethods, LP_NOTE_LEN},
        safe_u120_serialization::{SafeU120SerializationMethods, SAFE_U120_SERIALIZED_LEN}
    };

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
    ) -> Field {
        // TODO

        1
    }


    // Proves that the owner owned an LP note for a specific time period and distributes reward based on the deposit
    // amount and the length of time the note was owned.
    // The proof works as follows:
    // 1) Prove that I owned the note at the start of the time period.
    //      a) Pop HAT root of the stack (this will eventually be injected by kernel since this is not safe and for
    //         experimental purposes only).
    //      b) Pop all the preimages of block hash from the stack (one of those is note hash tree root).
    //      c) Compute the block hash.
    //      c) Pop sibling path of the block hash in the HAT from the stack.
    //      c) Prove that the block hash is in the HAT.
    //      a) Get the note/preimage from PXE.
    //      d) Compute the commitment from the note.
    //      d) Pop the note commitment sibling path in the note hash tree from the stack.
    //      e) Verify that the commitment is in the note hash tree.
    // 2) Prove that the note has not yet been nullified by emitting a nullifier.
    // 3) Distribute reward based on the time period and the note amount.
    #[aztec(private)]
    fn claim(
        owner: AztecAddress,
    ) -> Field {
        // TODO

        1
    }

    // Computes note hash and nullifier.
    // Note 1: Needs to be defined by every contract producing logs.
    // Note 2: Having it in all the contracts gives us the ability to compute the note hash and nullifier differently for different kind of notes.
    unconstrained fn compute_note_hash_and_nullifier(contract_address: Field, nonce: Field, storage_slot: Field, serialized_note: [Field; LP_NOTE_LEN]) -> [Field; 4] {
        assert(storage_slot == 1, "Invalid storage slot");
        note_utils::compute_note_hash_and_nullifier(LPNoteMethods, note_header, serialized_note)
    }
}
