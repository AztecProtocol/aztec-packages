use crate::{
    history::public_storage::PublicStorageHistoricalRead,
    test::helpers::test_environment::{PrivateContextOptions, TestEnvironment},
};

global STORAGE_SLOT: Field = 13;
global VALUE: Field = 17;

#[test]
unconstrained fn historical_no_write_public_storage_read() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        assert_eq(
            context.anchor_block_header.public_storage_historical_read(
                STORAGE_SLOT,
                context.this_address(),
            ),
            std::mem::zeroed(),
        );
    });
}

#[test]
unconstrained fn historical_pre_write_public_storage_read() {
    let env = TestEnvironment::new();

    env.public_context(|context| { context.storage_write(STORAGE_SLOT, VALUE); });

    let write_block_number = env.last_block_number();

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(write_block_number - 1),
        |context| {
            assert_eq(
                context.anchor_block_header.public_storage_historical_read(
                    STORAGE_SLOT,
                    context.this_address(),
                ),
                std::mem::zeroed(),
            );
        },
    );
}

#[test]
unconstrained fn historical_post_write_public_storage_read() {
    let env = TestEnvironment::new();

    env.public_context(|context| { context.storage_write(STORAGE_SLOT, VALUE); });

    env.private_context(|context| {
        assert_eq(
            context.anchor_block_header.public_storage_historical_read(
                STORAGE_SLOT,
                context.this_address(),
            ),
            VALUE,
        );
    });
}
