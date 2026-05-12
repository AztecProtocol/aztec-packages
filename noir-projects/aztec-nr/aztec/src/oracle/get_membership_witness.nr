use crate::protocol::{
    abis::block_header::BlockHeader,
    constants::{ARCHIVE_HEIGHT, NOTE_HASH_TREE_HEIGHT},
    merkle_tree::MembershipWitness,
    traits::Hash,
};

#[oracle(aztec_utl_getNoteHashMembershipWitness)]
unconstrained fn get_note_hash_membership_witness_oracle(
    anchor_block_hash: Field,
    note_hash: Field,
) -> MembershipWitness<NOTE_HASH_TREE_HEIGHT> {}

#[oracle(aztec_utl_getBlockHashMembershipWitnessV2)]
unconstrained fn get_block_hash_membership_witness_oracle(
    anchor_block_hash: Field,
    block_hash: Field,
) -> Option<MembershipWitness<ARCHIVE_HEIGHT>> {}

// Note: get_nullifier_membership_witness function is implemented in get_nullifier_membership_witness.nr

/// Returns a membership witness for a `note_hash` in the note hash tree whose root is defined in
// `anchor_block_header`.
pub unconstrained fn get_note_hash_membership_witness(
    anchor_block_header: BlockHeader,
    note_hash: Field,
) -> MembershipWitness<NOTE_HASH_TREE_HEIGHT> {
    let anchor_block_hash = anchor_block_header.hash();
    get_note_hash_membership_witness_oracle(anchor_block_hash, note_hash)
}

// There is no `get_public_data_membership_witness` function because it doesn't make sense to be getting a membership
// witness for a value in the public data tree.

/// Returns a membership witness for a `block_hash` in the archive tree whose root is defined in `anchor_block_header`.
pub unconstrained fn get_block_hash_membership_witness(
    anchor_block_header: BlockHeader,
    block_hash: Field,
) -> MembershipWitness<ARCHIVE_HEIGHT> {
    let anchor_block_hash = anchor_block_header.hash();
    get_block_hash_membership_witness_oracle(anchor_block_hash, block_hash).expect(
        f"Block hash {block_hash} not found in the archive tree at anchor block {anchor_block_hash}.",
    )
}

/// Same as [`get_block_hash_membership_witness`], but returns `None` instead of erroring when the block is not present
/// in the archive tree. Intended for callers that need to handle absence (e.g. existence checks via `.is_some()`).
pub unconstrained fn get_maybe_block_hash_membership_witness(
    anchor_block_header: BlockHeader,
    block_hash: Field,
) -> Option<MembershipWitness<ARCHIVE_HEIGHT>> {
    let anchor_block_hash = anchor_block_header.hash();
    get_block_hash_membership_witness_oracle(anchor_block_hash, block_hash)
}

mod test {
    use crate::history::test::{create_note, NOTE_CREATED_AT};
    use crate::note::note_interface::NoteHash;
    use crate::oracle::block_header::get_block_header_at;
    use crate::protocol::{
        hash::{compute_siloed_note_hash, compute_unique_note_hash},
        merkle_tree::root::root_from_sibling_path,
        traits::Hash,
    };
    use crate::test::helpers::test_environment::{PrivateContextOptions, TestEnvironment};
    use super::{
        get_block_hash_membership_witness, get_maybe_block_hash_membership_witness, get_note_hash_membership_witness,
    };

    #[test]
    unconstrained fn get_note_hash_membership_witness_returns_valid_witness_for_known_note() {
        let (env, hinted_note) = create_note();

        env.private_context_opts(PrivateContextOptions::new().at_anchor_block_number(NOTE_CREATED_AT), |context| {
            let anchor = context.anchor_block_header;

            let note_hash =
                hinted_note.note.compute_note_hash(hinted_note.owner, hinted_note.storage_slot, hinted_note.randomness);
            let siloed = compute_siloed_note_hash(hinted_note.contract_address, note_hash);
            let unique = compute_unique_note_hash(hinted_note.metadata.to_settled().note_nonce(), siloed);

            let witness = get_note_hash_membership_witness(anchor, unique);

            assert_eq(
                root_from_sibling_path(unique, witness.leaf_index, witness.sibling_path),
                anchor.state.partial.note_hash_tree.root,
            );
        });
    }

    #[test(should_fail_with = "not found in the note hash tree at block")]
    unconstrained fn get_note_hash_membership_witness_panics_for_unknown_note() {
        let env = TestEnvironment::new();

        env.mine_block();
        env.mine_block();

        env.private_context(|context| {
            let anchor = context.anchor_block_header;
            let _witness = get_note_hash_membership_witness(anchor, 0xdeadbeef);
        });
    }

    #[test]
    unconstrained fn get_block_hash_membership_witness_returns_valid_witness_for_known_block() {
        let env = TestEnvironment::new();

        env.mine_block();
        env.mine_block();
        env.mine_block();
        env.mine_block();

        env.private_context(|context| {
            let anchor = context.anchor_block_header;
            let target_block_number = anchor.block_number() - 2;

            let target_header = get_block_header_at(target_block_number, *context);
            let target_hash = target_header.hash();

            let witness = get_block_hash_membership_witness(anchor, target_hash);

            assert_eq(
                root_from_sibling_path(target_hash, witness.leaf_index, witness.sibling_path),
                anchor.last_archive.root,
            );
        });
    }

    #[test(should_fail_with = "not found in the archive tree at anchor block")]
    unconstrained fn get_block_hash_membership_witness_panics_for_unknown_block() {
        let env = TestEnvironment::new();

        env.mine_block();
        env.mine_block();

        env.private_context(|context| {
            let anchor = context.anchor_block_header;
            let _witness = get_block_hash_membership_witness(anchor, 0xdeadbeef);
        });
    }

    #[test]
    unconstrained fn get_maybe_block_hash_membership_witness_returns_some_for_known_block() {
        let env = TestEnvironment::new();

        env.mine_block();
        env.mine_block();
        env.mine_block();
        env.mine_block();

        env.private_context(|context| {
            let anchor = context.anchor_block_header;
            let target_block_number = anchor.block_number() - 2;

            let target_header = get_block_header_at(target_block_number, *context);
            let target_hash = target_header.hash();

            let witness = get_maybe_block_hash_membership_witness(anchor, target_hash).expect(
                f"Expected Some witness for known block hash",
            );

            assert_eq(
                root_from_sibling_path(target_hash, witness.leaf_index, witness.sibling_path),
                anchor.last_archive.root,
            );
        });
    }

    #[test]
    unconstrained fn get_maybe_block_hash_membership_witness_returns_none_for_unknown_block() {
        let env = TestEnvironment::new();

        env.mine_block();
        env.mine_block();

        env.private_context(|context| {
            let anchor = context.anchor_block_header;
            assert(get_maybe_block_hash_membership_witness(anchor, 0xdeadbeef).is_none());
        });
    }
}
