use crate::history::{
    nullifier_non_inclusion::{ProveNoteNotNullified, ProveNullifierNonInclusion},
    test,
};
use crate::oracle::{notes::notify_created_nullifier, random::random};
use crate::test::helpers::test_environment::{PrivateContextOptions, TestEnvironment};
use dep::protocol_types::{
    constants::GENERATOR_INDEX__OUTER_NULLIFIER, hash::poseidon2_hash_with_separator,
    traits::ToField,
};

#[test]
unconstrained fn note_not_nullified_succeeds_in_blocks_before_note_nullification() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(test::NOTE_NULLIFIED_AT - 1),
        |context| {
            let header = context.anchor_block_header;
            header.prove_note_not_nullified(retrieved_note, test::NOTE_STORAGE_SLOT, context);
        },
    );
}

#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn note_not_nullified_fails_in_blocks_after_note_nullification_fails() {
    let (env, retrieved_note) = test::create_note_and_nullify_it();

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(test::NOTE_NULLIFIED_AT),
        |context| {
            let header = context.anchor_block_header;
            header.prove_note_not_nullified(retrieved_note, test::NOTE_STORAGE_SLOT, context);
        },
    );
}

#[test]
unconstrained fn nullifier_non_inclusion_succeeds_in_blocks_before_nullifier_creation() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let header = context.anchor_block_header;
        header.prove_nullifier_non_inclusion(random());
    });
}

#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn nullifier_non_inclusion_fails_in_blocks_after_nullifier_creation() {
    let env = TestEnvironment::new();

    let siloed_nullifier = env.private_context(|context| {
        let unsiloed_nullifier = 42069;
        notify_created_nullifier(unsiloed_nullifier);

        // We need to compute the siloed nullifier so we can check for its inclusion in state.
        poseidon2_hash_with_separator(
            [context.this_address().to_field(), unsiloed_nullifier],
            GENERATOR_INDEX__OUTER_NULLIFIER,
        )
    });

    let nullifier_created_at = env.last_block_number();

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(nullifier_created_at),
        |context| {
            let header = context.anchor_block_header;
            header.prove_nullifier_non_inclusion(siloed_nullifier);
        },
    );
}
