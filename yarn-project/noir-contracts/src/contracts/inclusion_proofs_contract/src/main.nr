// A demonstration of inclusion proofs.
contract InclusionProofs {
    use dep::std::merkle::compute_merkle_root;
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
        },
        oracle::{
            get_block_data::get_block_data,
            get_membership_witness::{
                get_membership_witness,
                MembershipWitness,
            },
            get_low_nullifier_witness::{
                get_low_nullifier_witness,
                LowNullifierMembershipWitness,
            },
        },
        // oracle::debug_log::debug_log_format,
    };
    use dep::value_note::value_note::{ValueNote, ValueNoteMethods, VALUE_NOTE_LEN};

    struct Storage {
        balances: Map<Set<ValueNote, VALUE_NOTE_LEN>>,
    }

    impl Storage {
        fn init(context: Context) -> Self {
            Storage {
                balances: Map::new(
                    context,
                    1, // Storage slot
                    |context, slot| {
                        Set::new(context, slot, ValueNoteMethods)
                    },
                ),
            }
        }
    }

    #[aztec(private)]
    fn constructor() {}

    // Mints `amount` of LP tokens to `owner`.
    #[aztec(private)]
    fn create_note(
        owner: AztecAddress,
        amount: Field,
    ) {
        let owner_balance = storage.balances.at(owner.address);
        let mut note = ValueNote::new(amount, owner.address);
        owner_balance.insert(&mut note, true);
    }


    // Proves that the owner owned a ValueNote at block `block_number`.
    //
    // The scheme works as follows:
    // 1) Get the blocks tree root from context.
    // 2) Get historic block data from oracle.
    // 3) Compute block hash from the historic block data obtained in 1).
    // 4) Get the membership witness of a block in the blocks tree.
    // 5) Prove that the block hash is in the blocks tree.
    // 6) Get the note/preimage from PXE.
    // 7) Compute the commitment from the note.
    // 8) Get the membership witness of the note in the note hash tree.
    // 9) Verify that the commitment is in the note hash tree.
    // --> Now we have traversed the trees all the way up to blocks tree root. Last thing remaining is to verify that
    //     the blocks tree root is in the grandfather tree. That will be done in the root rollup circuit.
    #[aztec(private)]
    fn proveNoteInclusion(
        owner: AztecAddress,
        block_number: Field, // The block at which we'll prove that the note exists
    ) {
        // TODO: assert that block number is less than the block number of context.block_data
        // --> This will either require a new oracle method that returns block_data.global_variables_hash preimage
        //     or modifying the private context so that we somehow expose it.

        // 1) 
        let blocks_tree_root = context.block_data.blocks_tree_root;

        // 2)
        let block_data = get_block_data(block_number);

        // 3)
        let block_hash = block_data.block_hash();

        // 4)
        let blocks_tree_id = 5;
        let witness: MembershipWitness<HISTORIC_BLOCKS_TREE_HEIGHT, HISTORIC_BLOCKS_TREE_HEIGHT + 1> =
            get_membership_witness(block_number, blocks_tree_id, block_hash);

        // 5)
        // In our test case this should be tree root at the latest block and should correspond to the membership
        // witness we obtain from oracle
        assert(
            blocks_tree_root == compute_merkle_root(block_hash, witness.index, witness.path),
            "Proving membership of a block in blocks tree failed"
        );

        // 6)
        let balances = storage.balances.at(owner.address);
        let options = NoteGetterOptions::new().select(1, owner.address).set_limit(1);
        let notes = balances.get_notes(options);
        let note = notes[0].unwrap();

        // 7)
        let note_commitment = note_utils::compute_unique_siloed_note_hash(ValueNoteMethods, note);

        // 8)
        let note_hash_tree_id = 2;
        let witness: MembershipWitness<NOTE_HASH_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT + 1> =
            get_membership_witness(block_number, note_hash_tree_id, note_commitment);

        // 9)
        assert(
            block_data.note_hash_tree_root == compute_merkle_root(note_commitment, witness.index, witness.path),
            "Proving membership of a note in note hash tree failed"
        );
    }

    #[aztec(private)]
    fn proveNullifierNonInclusion(
        owner: AztecAddress,
        block_number: Field, // The block at which we'll prove that the nullifier does not exists
    ) {
        // TODO: assert that block number is less than the block number of context.block_data
        // --> This will either require a new oracle method that returns block_data.global_variables_hash preimage
        //     or modifying the private context so that we somehow expose it.

        // 1) Get blocks tree root from context
        let blocks_tree_root = context.block_data.blocks_tree_root;

        // 2) Get historic block data from oracle
        let block_data = get_block_data(block_number);

        // 3) Compute block hash from the historic block data obtained in 1)
        let block_hash = block_data.block_hash();

        // 4) Get the membership witness of a block in the blocks tree
        let blocks_tree_id = 5;
        let witness: MembershipWitness<HISTORIC_BLOCKS_TREE_HEIGHT, HISTORIC_BLOCKS_TREE_HEIGHT + 1> =
            get_membership_witness(block_number, blocks_tree_id, block_hash);

        // 5) Prove that the block hash is in the blocks tree
        // In our test case this should be tree root at the latest block and should correspond to the membership
        // witness we obtain from oracle
        assert(
            blocks_tree_root == compute_merkle_root(block_hash, witness.index, witness.path),
            "Proving membership of a block in blocks tree failed"
        );
        
        // 6) Get the note/preimage from PXE
        let balances = storage.balances.at(owner.address);
        let options = NoteGetterOptions::new().select(1, owner.address).set_limit(1);
        let notes = balances.get_notes(options);
        let note = notes[0].unwrap();

        // 7) Compute the nullifier from the note
        let nullifier = note_utils::compute_siloed_nullifier(ValueNoteMethods, note);

        // 8) Get the membership witness of a low nullifier of the nullifier
        let witness = get_low_nullifier_witness(block_number, nullifier);

        // 9) Prove that the nullifier is not included in the nullifier tree

        // 9.a) Compute the low nullifier leaf and prove that it is in the nullifier tree
        let low_nullifier_leaf = witness.leaf_data.hash();
        assert(
            block_data.nullifier_tree_root == compute_merkle_root(low_nullifier_leaf, witness.index, witness.path),
            "Proving membership of a low nullifier in the nullifier tree failed"
        );

        // 9.b) Prove that the low nullifier is smaller than the nullifier
        assert(
            witness.leaf_data.value as u120 < nullifier as u120,
            "Proving that the low nullifier is smaller than the nullifier failed"
        );

        // 9.c) Prove that the low nullifier is pointing "over" the nullifier to prove that the nullifier is not
        // included in the nullifier tree
        assert(
            witness.leaf_data.next_value as u120 > nullifier as u120,
            "Proving that low_nullifier.next_value > nullifier failed"
        );
    }

    // Computes note hash and nullifier.
    // Note 1: Needs to be defined by every contract producing logs.
    // Note 2: Having it in all the contracts gives us the ability to compute the note hash and nullifier differently for different kind of notes.
    unconstrained fn compute_note_hash_and_nullifier(contract_address: Field, nonce: Field, storage_slot: Field, serialized_note: [Field; VALUE_NOTE_LEN]) -> [Field; 4] {
        let note_header = NoteHeader::new(contract_address, nonce, storage_slot);
        note_utils::compute_note_hash_and_nullifier(ValueNoteMethods, note_header, serialized_note)
    }
}
