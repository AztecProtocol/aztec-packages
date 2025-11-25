use crate::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, global_variables::GlobalVariables,
        state_reference::StateReference,
    },
    constants::{
        BLOCK_END_PREFIX, L1_TO_L2_MSG_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT, NULLIFIER_TREE_HEIGHT,
        PUBLIC_DATA_TREE_HEIGHT,
    },
};

/// Creates the data to be added to the blobs for a block. This is appended after the data for all txs in the block.
/// It allows components outside the circuits to correctly retrieve the relevant fields from the checkpoint's blob data
/// and to easily reconstruct the block header without needing to query other sources or rebuild the trees.
pub fn create_block_end_blob_data(
    global_variables: GlobalVariables,
    last_archive: AppendOnlyTreeSnapshot,
    state: StateReference,
    num_txs: u16,
    total_mana_used: Field,
) -> [Field; 7] {
    [
        create_block_end_marker(global_variables, num_txs),
        create_block_end_state_field(state, total_mana_used),
        last_archive.root,
        state.partial.note_hash_tree.root,
        state.partial.nullifier_tree.root,
        state.partial.public_data_tree.root,
        state.l1_to_l2_message_tree.root,
    ]
}

global TIMESTAMP_BIT_SIZE: u32 = 64;
global BLOCK_NUMBER_BIT_SIZE: u32 = 32;
global NUM_TXS_BIT_SIZE: u32 = 16;
global TOTAL_MANA_USED_BIT_SIZE: u32 = 48;

/// Create the field that marks the end of a block. It's a concatenation of:
/// `BLOCK_END_PREFIX` | `timestamp` | `block_number` | `num_txs`
///
/// `BLOCK_END_PREFIX` occupies the bytes up to the point where `timestamp` begins.
/// `timestamp` occupies 8 bytes.
/// `block_number` occupies 4 bytes.
/// `num_txs` occupies 2 bytes.
pub fn create_block_end_marker(global_variables: GlobalVariables, num_txs: u16) -> Field {
    let num_txs_field = num_txs as Field;
    num_txs_field.assert_max_bit_size::<NUM_TXS_BIT_SIZE>();
    let mut marker = num_txs_field;
    let mut shift = (1 << NUM_TXS_BIT_SIZE) as Field;

    let block_number_field = global_variables.block_number as Field;
    block_number_field.assert_max_bit_size::<BLOCK_NUMBER_BIT_SIZE>();
    marker += block_number_field * shift;
    shift *= (1 << BLOCK_NUMBER_BIT_SIZE as u64) as Field;

    let timestamp_field = global_variables.timestamp as Field;
    timestamp_field.assert_max_bit_size::<TIMESTAMP_BIT_SIZE>();
    marker += timestamp_field * shift;
    shift *= (1 << TIMESTAMP_BIT_SIZE as u128) as Field;

    marker += BLOCK_END_PREFIX * shift;
    marker
}

/// Create the field that contains information about the end state of a block. It's a concatenation of:
/// `l1_to_l2_message_next_available_leaf_index` | `note_hash_next_available_leaf_index` |
/// `nullifier_next_available_leaf_index` | `public_data_next_available_leaf_index` | `total_mana_used`
///
/// `total_mana_used` occupies 48 bits: l2_gas of tx is of type u32, and there can be up to 2^16 txs per block.
/// Each `_next_available_leaf_index` occupies the number of bits required to represent the tree height.
pub fn create_block_end_state_field(state: StateReference, total_mana_used: Field) -> Field {
    total_mana_used.assert_max_bit_size::<TOTAL_MANA_USED_BIT_SIZE>();
    let mut field = total_mana_used;
    let mut shift = (1 << TOTAL_MANA_USED_BIT_SIZE as u64) as Field;

    let public_data_next_index_field =
        state.partial.public_data_tree.next_available_leaf_index as Field;
    public_data_next_index_field.assert_max_bit_size::<PUBLIC_DATA_TREE_HEIGHT>();
    field += public_data_next_index_field * shift;
    shift *= (1 << PUBLIC_DATA_TREE_HEIGHT as u64) as Field;

    let nullifier_next_index_field =
        state.partial.nullifier_tree.next_available_leaf_index as Field;
    nullifier_next_index_field.assert_max_bit_size::<NULLIFIER_TREE_HEIGHT>();
    field += nullifier_next_index_field * shift;
    shift *= (1 << NULLIFIER_TREE_HEIGHT as u64) as Field;

    let note_hash_next_index_field =
        state.partial.note_hash_tree.next_available_leaf_index as Field;
    note_hash_next_index_field.assert_max_bit_size::<NOTE_HASH_TREE_HEIGHT>();
    field += note_hash_next_index_field * shift;
    shift *= (1 << NOTE_HASH_TREE_HEIGHT as u64) as Field;

    let l1_to_l2_message_next_index_field =
        state.l1_to_l2_message_tree.next_available_leaf_index as Field;
    l1_to_l2_message_next_index_field.assert_max_bit_size::<L1_TO_L2_MSG_TREE_HEIGHT>();
    field += l1_to_l2_message_next_index_field * shift;

    field
}

mod tests {
    use crate::{
        abis::{global_variables::GlobalVariables, state_reference::StateReference},
        constants::{
            BLOCK_END_PREFIX, L1_TO_L2_MSG_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT,
            NULLIFIER_TREE_HEIGHT, PUBLIC_DATA_TREE_HEIGHT,
        },
    };
    use super::{
        BLOCK_NUMBER_BIT_SIZE, create_block_end_marker, create_block_end_state_field,
        NUM_TXS_BIT_SIZE, TIMESTAMP_BIT_SIZE, TOTAL_MANA_USED_BIT_SIZE,
    };

    fn accumulate_bits<let N: u32>(bits: [u1; N], offset: u32, num_bits: u32) -> Field {
        let mut accum = 0;
        let mut shift = 1;
        for i in 0..num_bits {
            accum += bits[offset + i] as Field * shift;
            shift *= 2;
        }
        accum
    }

    #[test]
    fn correct_block_end_marker() {
        let mut global_variables: GlobalVariables = std::mem::zeroed();
        global_variables.block_number = 123;
        global_variables.timestamp = 456789;
        let num_txs = 99;

        let block_end_marker = create_block_end_marker(global_variables, num_txs);

        let bits: [u1; 254] = block_end_marker.to_le_bits();
        let mut offset = 0;
        assert_eq(accumulate_bits(bits, offset, NUM_TXS_BIT_SIZE), 99); // num_txs
        offset += NUM_TXS_BIT_SIZE;
        assert_eq(accumulate_bits(bits, offset, BLOCK_NUMBER_BIT_SIZE), 123); // block_number
        offset += BLOCK_NUMBER_BIT_SIZE;
        assert_eq(accumulate_bits(bits, offset, TIMESTAMP_BIT_SIZE), 456789); // timestamp
        offset += TIMESTAMP_BIT_SIZE;
        assert_eq(accumulate_bits(bits, offset, 254 - offset), BLOCK_END_PREFIX); // prefix

        // Generated from yarn-project/blob-lib/src/encoding/block_end_marker.test.ts
        let block_end_marker_from_typescript =
            0x000000000000000000626c6f636b5f656e64000000000006f8550000007b0063;

        assert_eq(block_end_marker, block_end_marker_from_typescript);
    }

    #[test]
    fn large_values_in_block_end_marker_do_not_get_truncated() {
        let mut global_variables: GlobalVariables = std::mem::zeroed();
        global_variables.block_number = 0xabcd1234;
        global_variables.timestamp = (1 << 63) + 567890;
        let num_txs = 0xfedc;

        let block_end_marker = create_block_end_marker(global_variables, num_txs);

        let bits: [u1; 254] = block_end_marker.to_le_bits();
        let mut offset = 0;
        assert_eq(accumulate_bits(bits, offset, NUM_TXS_BIT_SIZE), 0xfedc);
        offset += NUM_TXS_BIT_SIZE;
        assert_eq(accumulate_bits(bits, offset, BLOCK_NUMBER_BIT_SIZE), 0xabcd1234);
        offset += BLOCK_NUMBER_BIT_SIZE;
        assert_eq(
            accumulate_bits(bits, offset, TIMESTAMP_BIT_SIZE),
            global_variables.timestamp as Field,
        );
        offset += TIMESTAMP_BIT_SIZE;
        assert_eq(accumulate_bits(bits, offset, 254 - offset), BLOCK_END_PREFIX); // prefix

        // Generated from yarn-project/blob-lib/src/encoding/block_end_marker.test.ts
        let large_block_end_marker_from_typescript =
            0x000000000000000000626c6f636b5f656e64800000000008aa52abcd1234fedc;

        assert_eq(block_end_marker, large_block_end_marker_from_typescript);
    }

    #[test]
    fn correct_block_end_state_field() {
        let mut state: StateReference = std::mem::zeroed();
        state.l1_to_l2_message_tree.next_available_leaf_index = 4466;
        state.partial.note_hash_tree.next_available_leaf_index = 3377;
        state.partial.nullifier_tree.next_available_leaf_index = 2288;
        state.partial.public_data_tree.next_available_leaf_index = 1199;
        let total_mana_used = 87654321;

        let end_state_field = create_block_end_state_field(state, total_mana_used);

        let bits: [u1; 254] = end_state_field.to_le_bits();
        let mut offset = 0;
        assert_eq(accumulate_bits(bits, offset, TOTAL_MANA_USED_BIT_SIZE), 87654321); // total_mana_used
        offset += TOTAL_MANA_USED_BIT_SIZE;
        assert_eq(accumulate_bits(bits, offset, PUBLIC_DATA_TREE_HEIGHT), 1199); // public_data_next_available_leaf_index
        offset += PUBLIC_DATA_TREE_HEIGHT;
        assert_eq(accumulate_bits(bits, offset, NULLIFIER_TREE_HEIGHT), 2288); // nullifier_next_available_leaf_index
        offset += NULLIFIER_TREE_HEIGHT;
        assert_eq(accumulate_bits(bits, offset, NOTE_HASH_TREE_HEIGHT), 3377); // note_hash_next_available_leaf_index
        offset += NOTE_HASH_TREE_HEIGHT;
        assert_eq(accumulate_bits(bits, offset, 254 - offset), 4466); // l1_to_l2_message_next_available_leaf_index

        // Generated from yarn-project/blob-lib/src/encoding/block_end_state_field.test.ts
        let block_end_state_field_from_typescript =
            0x000000000000000001172000000034c400000008f000000004af000005397fb1;

        assert_eq(end_state_field, block_end_state_field_from_typescript);
    }

    #[test]
    fn large_values_in_block_end_state_field_do_not_get_truncated() {
        let l1_to_l2_message_next_index = ((1 << L1_TO_L2_MSG_TREE_HEIGHT as u64) - 4466) as Field;
        let note_hash_next_index = ((1 << NOTE_HASH_TREE_HEIGHT as u64) - 3377) as Field;
        let nullifier_next_index = ((1 << NULLIFIER_TREE_HEIGHT as u64) - 2288) as Field;
        let public_data_next_index = ((1 << PUBLIC_DATA_TREE_HEIGHT as u64) - 1199) as Field;
        let total_mana_used = ((1 << TOTAL_MANA_USED_BIT_SIZE as u64) - 87654321) as Field;
        let mut state: StateReference = std::mem::zeroed();
        state.l1_to_l2_message_tree.next_available_leaf_index = l1_to_l2_message_next_index;
        state.partial.note_hash_tree.next_available_leaf_index = note_hash_next_index;
        state.partial.nullifier_tree.next_available_leaf_index = nullifier_next_index;
        state.partial.public_data_tree.next_available_leaf_index = public_data_next_index;

        let end_state_field = create_block_end_state_field(state, total_mana_used);

        let bits: [u1; 254] = end_state_field.to_le_bits();
        let mut offset = 0;
        assert_eq(accumulate_bits(bits, offset, TOTAL_MANA_USED_BIT_SIZE), total_mana_used);
        offset += TOTAL_MANA_USED_BIT_SIZE;
        assert_eq(accumulate_bits(bits, offset, PUBLIC_DATA_TREE_HEIGHT), public_data_next_index);
        offset += PUBLIC_DATA_TREE_HEIGHT;
        assert_eq(accumulate_bits(bits, offset, NULLIFIER_TREE_HEIGHT), nullifier_next_index);
        offset += NULLIFIER_TREE_HEIGHT;
        assert_eq(accumulate_bits(bits, offset, NOTE_HASH_TREE_HEIGHT), note_hash_next_index);
        offset += NOTE_HASH_TREE_HEIGHT;
        assert_eq(accumulate_bits(bits, offset, 254 - offset), l1_to_l2_message_next_index);

        // Generated from yarn-project/blob-lib/src/encoding/block_end_state_field.test.ts
        let large_block_end_state_field_from_typescript =
            0x000000000000fffffee8efffffffcb3ffffffff710fffffffb51fffffac6804f;

        assert_eq(end_state_field, large_block_end_state_field_from_typescript);
    }
}
