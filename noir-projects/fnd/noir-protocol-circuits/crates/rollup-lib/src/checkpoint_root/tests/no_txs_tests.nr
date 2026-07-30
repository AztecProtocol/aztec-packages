use super::TestBuilder;
use types::constants::{BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX, BLOCK_ROOT_ROLLUP_VK_INDEX};

// A checkpoint of [block with txs, transaction-less block] proves: the transaction-less block is accepted as a direct
// non-leftmost child of the checkpoint root.
#[test]
fn checkpoint_with_no_txs_right_block() {
    let builder = TestBuilder::new(
        BLOCK_ROOT_ROLLUP_VK_INDEX,
        1,
        BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX,
        1,
    );
    let (pi, mock) = builder.execute_with_mock();
    builder.assert_expected_public_inputs(pi);
    builder.assert_mock_called(mock);
}

// A transaction-less block may also be the leftmost block of a checkpoint, as long as it starts from the initial
// sponge values like any other first block.
#[test]
fn checkpoint_with_no_txs_leftmost_block() {
    let builder = TestBuilder::new(
        BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX,
        1,
        BLOCK_ROOT_ROLLUP_VK_INDEX,
        1,
    );
    let (pi, mock) = builder.execute_with_mock();
    builder.assert_expected_public_inputs(pi);
    builder.assert_mock_called(mock);
}
