use crate::protocol::{abis::block_header::BlockHeader, merkle_tree::root::root_from_sibling_path, traits::Hash};

use crate::{context::PrivateContext, oracle::get_membership_witness::get_block_hash_membership_witness};

#[oracle(utilityGetBlockHeader)]
unconstrained fn get_block_header_at_oracle(_block_number: u32) -> BlockHeader {}

unconstrained fn get_block_header_at_internal(block_number: u32) -> BlockHeader {
    get_block_header_at_oracle(block_number)
}

pub fn get_block_header_at(block_number: u32, context: PrivateContext) -> BlockHeader {
    let anchor_block_header = context.anchor_block_header;
    let anchor_block_number = anchor_block_header.block_number();

    if (block_number == anchor_block_number) {
        // If the block number we want to prove against is the same as the block number in the historical header we
        // skip the inclusion proofs and just return the historical header from context.
        anchor_block_header
    } else {
        // 1) Get block number corresponding to the last_archive root in the header Note: We subtract 1 because the
        // last_archive root is the root of the archive after applying the previous block
        let last_archive_block_number = anchor_block_number - 1;

        // 2) Check that the last archive block number is more than or equal to the block number we want to prove
        // against
        //
        // Note that we could not perform the proof otherwise because the last archive root from the header would not
        // "contain" the header we want to prove against. This check could be unconstrained as its sole purpose is to
        // give us a nice error message.
        assert(
            last_archive_block_number >= block_number,
            "Last archive block number is smaller than the block number we want to prove against",
        );

        // 3) Get the header hint of a given block from an oracle.
        // Safety: The header is constrained to be in the archive tree below.
        let header = unsafe { get_block_header_at_internal(block_number) };

        // 4) We make sure that the header hint we received from the oracle exists in the state tree and is the actual
        // header at the desired block number
        constrain_get_block_header_at_internal(header, block_number, anchor_block_header);

        // 5) Return the block header
        header
    }
}

fn constrain_get_block_header_at_internal(
    header_hint: BlockHeader,
    block_number: u32,
    anchor_block_header: BlockHeader,
) {
    // 1) Compute the block hash from the block header
    let block_hash = header_hint.hash();

    // 2) Get the membership witness of the block in the archive tree.
    // Safety: The witness is only used as a "magical value" that makes the merkle proof below pass. Hence it's safe.
    let witness = unsafe { get_block_hash_membership_witness(anchor_block_header, block_hash) };

    // 3) Check that the block is in the archive (i.e. the witness is valid)
    assert_eq(
        anchor_block_header.last_archive.root,
        root_from_sibling_path(block_hash, witness.index, witness.path),
        "Proving membership of a block in archive failed",
    );

    // 4) Check that the header hint has the same block number as the block number we are looking for, ensuring we are
    // actually grabbing the header we specify
    assert_eq(
        header_hint.block_number(),
        block_number,
        "Block number provided is not the same as the block number from the header hint",
    );
}

mod test {
    use crate::protocol::traits::Hash;
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::{constrain_get_block_header_at_internal, get_block_header_at, get_block_header_at_internal};

    #[test]
    unconstrained fn fetching_earliest_block_header_succeeds() {
        let env = TestEnvironment::new();

        env.mine_block();
        env.mine_block();
        env.mine_block();
        env.mine_block();

        env.private_context(|context| {
            let anchor_block_header = context.anchor_block_header;

            let header = get_block_header_at_internal(1);
            constrain_get_block_header_at_internal(header, 1, anchor_block_header);

            assert_eq(header.block_number(), 1);
        });
    }

    #[test]
    unconstrained fn fetching_past_block_header_succeeds() {
        let env = TestEnvironment::new();

        env.mine_block();
        env.mine_block();
        env.mine_block();
        env.mine_block();

        env.private_context(|context| {
            let anchor_block_header = context.anchor_block_header;
            let target_block_number = anchor_block_header.block_number() - 2;

            let header = get_block_header_at_internal(target_block_number);
            constrain_get_block_header_at_internal(header, target_block_number, anchor_block_header);

            assert_eq(header.block_number(), target_block_number);
        });
    }

    #[test]
    unconstrained fn fetching_header_immediately_before_anchor_succeeds() {
        let env = TestEnvironment::new();

        env.mine_block();
        env.mine_block();
        env.mine_block();
        env.mine_block();

        // Block N-1 is the boundary case: last_archive covers exactly up to block N-1.
        env.private_context(|context| {
            let anchor_block_header = context.anchor_block_header;
            let target_block_number = anchor_block_header.block_number() - 1;

            let header = get_block_header_at_internal(target_block_number);
            constrain_get_block_header_at_internal(header, target_block_number, anchor_block_header);

            assert_eq(header.block_number(), target_block_number);
        });
    }

    #[test]
    unconstrained fn fetching_anchor_block_header_works() {
        let env = TestEnvironment::new();

        env.mine_block();
        env.mine_block();
        env.mine_block();
        env.mine_block();

        env.private_context(|context| {
            let anchor_block_number = context.anchor_block_header.block_number();

            let header = get_block_header_at(anchor_block_number, *context);

            assert_eq(header.block_number(), anchor_block_number);
            assert_eq(header.hash(), context.anchor_block_header.hash());
        });
    }

    #[test(should_fail_with = "Last archive block number is smaller than the block number")]
    unconstrained fn fetching_future_block_header_fails() {
        let env = TestEnvironment::new();

        env.mine_block();
        env.mine_block();
        env.mine_block();
        env.mine_block();

        env.private_context(|context| {
            let anchor_block_number = context.anchor_block_header.block_number();

            let _header = get_block_header_at(anchor_block_number + 1, *context);
        });
    }

    #[test(should_fail_with = "Block number provided is not the same as the block number from the header hint")]
    unconstrained fn fetching_header_with_mismatched_block_number_fails() {
        let env = TestEnvironment::new();

        env.mine_block();
        env.mine_block();
        env.mine_block();
        env.mine_block();

        // We get our current header for the last archive values.
        env.private_context(|context| {
            let anchor_block_header = context.anchor_block_header;

            let target_block_number = anchor_block_header.block_number() - 2;
            let bad_header = get_block_header_at_internal(target_block_number);

            // We pass in a different block number than the header received
            constrain_get_block_header_at_internal(bad_header, target_block_number - 1, anchor_block_header);
        });
    }
}
