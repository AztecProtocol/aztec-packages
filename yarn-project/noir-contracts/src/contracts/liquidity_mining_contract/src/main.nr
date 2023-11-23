mod types;

// A demonstration of private liquidity mining.
contract LiquidityMining {
    use dep::std::{
        merkle::compute_merkle_root,
        hash::pedersen_hash_with_separator,
    };
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
        constants_gen::{
            NOTE_HASH_TREE_HEIGHT,
            HISTORIC_BLOCKS_TREE_HEIGHT,
            GENERATOR_INDEX__BLOCK_HASH,
        },
        oracle::{
            get_membership_witness::{
                get_membership_witness,
                MembershipWitness,
            },
            get_block_data::get_block_data,
        },
        // oracle::debug_log::debug_log_format,
    };

    use crate::types::lp_note::{LPNote, LPNoteMethods, LP_NOTE_LEN};

    struct Storage {
        balances: Map<Set<LPNote, LP_NOTE_LEN>>,
    }

    impl Storage {
        fn init(context: Context) -> Self {
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
    //      d) Get the membership witness of a block in the blocks tree.
    //      e) Prove that the block hash is in the HAT.
    //      f) Get the note/preimage from PXE.
    //      g) Compute the commitment from the note.
    //      h) Get the membership witness of a note in the note hash tree.
    //      i) Verify that the commitment is in the note hash tree.
    // 2) Prove that the note has not yet been nullified by emitting a nullifier.
    // 3) Use the timestamp from 1.b), current timestamp and the note amount from 1.f) to compute the reward.
    // 4) Transfer the reward to the owner.
    #[aztec(private)]
    fn claim(
        owner: AztecAddress,
        block_number: Field, // The block at which we'll prove that the note exists
    ) {
        let balances = storage.balances.at(owner.address);

        // 1.c)
        let block_data = get_block_data(block_number);
        
        // TODO: Seems to make sense to move the following to `HistoricBlockData` struct.
        // TODO: Would make sense to unify the ordering in `HistoricBlockData::serialize` function and the ordering
        // in the block hash preimage --> This seems to require changes in the circuits.
        let inputs = [
            block_data.global_variables_hash,
            block_data.note_hash_tree_root,
            block_data.nullifier_tree_root,
            block_data.contract_tree_root,
            block_data.l1_to_l2_messages_tree_root,
            block_data.public_data_tree_root
        ];
        let block_hash = pedersen_hash_with_separator(inputs, GENERATOR_INDEX__BLOCK_HASH);

        // 1.d)
        let blocks_tree_id = 5;
        let witness: MembershipWitness<HISTORIC_BLOCKS_TREE_HEIGHT, HISTORIC_BLOCKS_TREE_HEIGHT + 1> =
            get_membership_witness(block_number, blocks_tree_id, block_hash);

        // 1.e)
        // In our test case this should be tree root at the latest block and should correspond to the membership
        // witness we obtain from oracle
        assert(
            block_data.blocks_tree_root == compute_merkle_root(block_hash, witness.index, witness.path),
            "Proving membership of a block in blocks tree failed"
        );

        // 1.f)
        let options = NoteGetterOptions::new().select(1, owner.address).set_limit(1);
        let notes = balances.get_notes(options);
        let note = notes[0].unwrap();

        // 1.g)
        let note_commitment = note_utils::compute_unique_siloed_note_hash(LPNoteMethods, note);

        // 1.h)
        let note_hash_tree_id = 2;
        let witness: MembershipWitness<NOTE_HASH_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT + 1> =
            get_membership_witness(block_number, note_hash_tree_id, note_commitment);

        // 1.i)
        // In our test case this should be tree root at the latest block and should correspond to the membership
        // witness we obtain from oracle
        assert(
            block_data.note_hash_tree_root == compute_merkle_root(note_commitment, witness.index, witness.path),
            "Proving membership of a note in note has tree failed"
        );

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
