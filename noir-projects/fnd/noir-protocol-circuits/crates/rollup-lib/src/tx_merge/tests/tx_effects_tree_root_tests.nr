use crate::{
    abis::TxRollupPublicInputs,
    tests::RollupFixtureBuilder,
    tx_merge::tx_merge_rollup::{self, TxMergeRollupPrivateInputs},
};
use types::{
    blob_data::accumulate_tx_effects_tree_root,
    constants::{
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX, TX_MERGE_ROLLUP_VK_INDEX,
    },
};

// Stand-ins for the leaves computed by the tx base circuits, so that the expected roots can be written out by hand.
global LEAVES: [Field; 7] = [1111, 2222, 3333, 4444, 5555, 6666, 7777];

// The tx index of the first tx of the block used by these tests. Any non-zero index works.
global FIRST_TX_INDEX: u16 = 6;

/// Public inputs of the tx base rollup of the `i`-th tx of the block, with `LEAVES[i]` as its tx effects tree root.
fn tx_base_rollup(tx_index: u32) -> TxRollupPublicInputs {
    let mut rollup =
        RollupFixtureBuilder::new().get_tx_rollup_public_inputs(FIRST_TX_INDEX + tx_index as u16);
    rollup.accumulated_tx_effects_tree_root = LEAVES[tx_index];
    rollup
}

fn merge(
    left: TxRollupPublicInputs,
    left_vk_index: u32,
    right: TxRollupPublicInputs,
    right_vk_index: u32,
) -> TxRollupPublicInputs {
    let previous_rollups = [
        RollupFixtureBuilder::make_proof_data(left, left_vk_index),
        RollupFixtureBuilder::make_proof_data(right, right_vk_index),
    ];
    tx_merge_rollup::execute(TxMergeRollupPrivateInputs { previous_rollups })
}

fn merge_bases(left: TxRollupPublicInputs, right: TxRollupPublicInputs) -> TxRollupPublicInputs {
    merge(
        left,
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        right,
        PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
    )
}

fn merge_four_bases(first_leaf: u32) -> TxRollupPublicInputs {
    let left = merge_bases(tx_base_rollup(first_leaf), tx_base_rollup(first_leaf + 1));
    let right = merge_bases(
        tx_base_rollup(first_leaf + 2),
        tx_base_rollup(first_leaf + 3),
    );
    merge(
        left,
        TX_MERGE_ROLLUP_VK_INDEX,
        right,
        TX_MERGE_ROLLUP_VK_INDEX,
    )
}

#[test]
fn two_txs() {
    let merged = merge_bases(tx_base_rollup(0), tx_base_rollup(1));

    assert_eq(merged.num_txs, 2);
    assert_eq(
        merged.accumulated_tx_effects_tree_root,
        accumulate_tx_effects_tree_root(LEAVES[0], LEAVES[1]),
    );
}

#[test]
fn three_txs() {
    // The greedy fill forces the shape H(H(leaf_0, leaf_1), leaf_2).
    let left = merge_bases(tx_base_rollup(0), tx_base_rollup(1));
    let merged = merge(
        left,
        TX_MERGE_ROLLUP_VK_INDEX,
        tx_base_rollup(2),
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
    );

    assert_eq(merged.num_txs, 3);
    assert_eq(
        merged.accumulated_tx_effects_tree_root,
        accumulate_tx_effects_tree_root(
            accumulate_tx_effects_tree_root(LEAVES[0], LEAVES[1]),
            LEAVES[2],
        ),
    );
}

#[test]
fn four_txs() {
    let merged = merge_four_bases(0);

    assert_eq(merged.num_txs, 4);
    assert_eq(
        merged.accumulated_tx_effects_tree_root,
        accumulate_tx_effects_tree_root(
            accumulate_tx_effects_tree_root(LEAVES[0], LEAVES[1]),
            accumulate_tx_effects_tree_root(LEAVES[2], LEAVES[3]),
        ),
    );
}

#[test]
fn five_txs() {
    // The greedy fill forces the shape H(H(H(leaf_0, leaf_1), H(leaf_2, leaf_3)), leaf_4).
    let left_left = merge_bases(tx_base_rollup(0), tx_base_rollup(1));
    let left_right = merge_bases(tx_base_rollup(2), tx_base_rollup(3));
    let left = merge(
        left_left,
        TX_MERGE_ROLLUP_VK_INDEX,
        left_right,
        TX_MERGE_ROLLUP_VK_INDEX,
    );
    let merged = merge(
        left,
        TX_MERGE_ROLLUP_VK_INDEX,
        tx_base_rollup(4),
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
    );

    assert_eq(merged.num_txs, 5);
    assert_eq(
        merged.accumulated_tx_effects_tree_root,
        accumulate_tx_effects_tree_root(
            accumulate_tx_effects_tree_root(
                accumulate_tx_effects_tree_root(LEAVES[0], LEAVES[1]),
                accumulate_tx_effects_tree_root(LEAVES[2], LEAVES[3]),
            ),
            LEAVES[4],
        ),
    );
}

#[test]
fn six_txs() {
    // The greedy fill forces a four-leaf left subtree and a two-leaf right subtree.
    let left = merge_four_bases(0);
    let right = merge_bases(tx_base_rollup(4), tx_base_rollup(5));
    let merged = merge(
        left,
        TX_MERGE_ROLLUP_VK_INDEX,
        right,
        TX_MERGE_ROLLUP_VK_INDEX,
    );

    assert_eq(merged.num_txs, 6);
    assert_eq(
        merged.accumulated_tx_effects_tree_root,
        accumulate_tx_effects_tree_root(
            accumulate_tx_effects_tree_root(
                accumulate_tx_effects_tree_root(LEAVES[0], LEAVES[1]),
                accumulate_tx_effects_tree_root(LEAVES[2], LEAVES[3]),
            ),
            accumulate_tx_effects_tree_root(LEAVES[4], LEAVES[5]),
        ),
    );
}

#[test]
fn seven_txs() {
    // The greedy fill forces a four-leaf left subtree and a three-leaf right subtree.
    let left = merge_four_bases(0);
    let right_pair = merge_bases(tx_base_rollup(4), tx_base_rollup(5));
    let right = merge(
        right_pair,
        TX_MERGE_ROLLUP_VK_INDEX,
        tx_base_rollup(6),
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
    );
    let merged = merge(
        left,
        TX_MERGE_ROLLUP_VK_INDEX,
        right,
        TX_MERGE_ROLLUP_VK_INDEX,
    );

    assert_eq(merged.num_txs, 7);
    assert_eq(
        merged.accumulated_tx_effects_tree_root,
        accumulate_tx_effects_tree_root(
            accumulate_tx_effects_tree_root(
                accumulate_tx_effects_tree_root(LEAVES[0], LEAVES[1]),
                accumulate_tx_effects_tree_root(LEAVES[2], LEAVES[3]),
            ),
            accumulate_tx_effects_tree_root(
                accumulate_tx_effects_tree_root(LEAVES[4], LEAVES[5]),
                LEAVES[6],
            ),
        ),
    );
}
