use super::{branch_hash, extension_hash, types::Node, utils::runtime_loop};

pub fn verify_path_section<let MAX_PATH_LENGTH: u32>(
    nodes: [Node; MAX_PATH_LENGTH],
    node_length: u32,
    start_trie_key_index: u32,
    mut parent: [u64; 4],
    trie_key_nibbles: [u8; 64],
) -> ([u64; 4], u32) {
    let mut current_nibble_idx: u32 = start_trie_key_index;

    runtime_loop!(
        quote { i },
        quote { 0 },
        quote { node_length },
        quote { MAX_PATH_LENGTH },
        quote {
            let node = nodes[i];
            if node.is_branch_node() {
                let hash = branch_hash::rlp_and_hash_branch_node(node);
                assert(hash == parent);

                let index = trie_key_nibbles[current_nibble_idx] as u32;
                parent = node.rows[index];
                current_nibble_idx += 1;
            } else if node.is_extension_node() {
                let header = node.extract_extension_header();

                let hash = extension_hash::rlp_and_hash_extension_node(node, header);
                assert(hash == parent);

                if header.is_odd {
                    assert_eq(trie_key_nibbles[current_nibble_idx], header.first_nibble);
                    current_nibble_idx += 1;
                }

                runtime_loop!(
                    quote {j},
                    quote {0},
                    quote {(header.extension_length as u32)},
                    quote {32},
                    quote {
                    let high_key_nibble = trie_key_nibbles[current_nibble_idx];
                    let low_key_nibble = trie_key_nibbles[current_nibble_idx + 1];
                    let key_byte = (high_key_nibble << 4) + low_key_nibble;
                    current_nibble_idx += 2;

                    let extension_byte = node.get_row_byte(1, j);
                    assert_eq(key_byte, extension_byte);
                },
                );

                parent = node.rows[2];
            } else {
                assert(false);
            }
        },
    );

    (parent, current_nibble_idx)
}
