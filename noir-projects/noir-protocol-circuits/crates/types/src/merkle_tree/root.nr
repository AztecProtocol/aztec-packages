use crate::merkle_tree::merkle_tree::{compute_merkle_tree_nodes, merkle_hash, sha_merkle_hash};

/// Calculate the Merkle tree root from the sibling path and leaf, using the default merkle hash.
pub fn root_from_sibling_path<let N: u32>(
    leaf: Field,
    leaf_index: Field,
    sibling_path: [Field; N],
) -> Field {
    root_from_sibling_path_with_hasher(leaf, leaf_index, sibling_path, merkle_hash)
}

/// Calculate the Merkle tree root from the sibling path and leaf, using a custom hasher.
///
/// The leaf is hashed with its sibling, the result is then hashed with the next sibling in the path. and so on.
/// The last hash is the root.
pub fn root_from_sibling_path_with_hasher<let N: u32>(
    leaf: Field,
    leaf_index: Field,
    sibling_path: [Field; N],
    hasher: fn(Field, Field) -> Field,
) -> Field {
    let mut node = leaf;
    let indices: [u1; N] = leaf_index.to_le_bits();

    for i in 0..N {
        let (hash_left, hash_right) = if indices[i] == 1 {
            (sibling_path[i], node)
        } else {
            (node, sibling_path[i])
        };
        node = hasher(hash_left, hash_right);
    }
    node
}

pub fn compute_tree_root<let N: u32>(leaves: [Field; N]) -> Field {
    compute_tree_root_with_hasher(leaves, merkle_hash)
}

pub fn compute_sha_tree_root<let N: u32>(leaves: [Field; N]) -> Field {
    compute_tree_root_with_hasher(leaves, sha_merkle_hash)
}

fn compute_tree_root_with_hasher<let N: u32>(
    leaves: [Field; N],
    hasher: fn(Field, Field) -> Field,
) -> Field {
    compute_merkle_tree_nodes(leaves, hasher)[N - 2]
}

pub fn compute_empty_tree_root<let TreeHeight: u32>() -> Field {
    compute_empty_tree_root_with_hasher::<TreeHeight>(merkle_hash)
}

pub fn compute_empty_sha_tree_root<let TreeHeight: u32>() -> Field {
    compute_empty_tree_root_with_hasher::<TreeHeight>(sha_merkle_hash)
}

pub fn compute_empty_tree_root_with_hasher<let TreeHeight: u32>(
    hasher: fn(Field, Field) -> Field,
) -> Field {
    let mut hashes = [0; TreeHeight + 1];
    for i in 1..TreeHeight + 1 {
        hashes[i] = hasher(hashes[i - 1], hashes[i - 1]);
    }
    hashes[TreeHeight]
}

#[test]
fn test_merkle_roots_match_typescript() {
    // The following hardcoded values are generated from yarn-project/foundation/src/trees/balanced_merkle_tree_root.test.ts

    let root = compute_tree_root([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    let expected_tree_root_from_ts =
        0x1528946361c480e8dc1e9ae3f8c31c997625fa1ddeddc7db5ad0dce3ac58fc4c;
    assert_eq(root, expected_tree_root_from_ts);

    let empty_root = compute_tree_root([0; 16]);
    let expected_empty_root_from_ts =
        0x2373ea368857ec7af97e7b470d705848e2bf93ed7bef142a490f2119bcf82d8e;
    assert_eq(empty_root, expected_empty_root_from_ts);

    let sha_root = compute_sha_tree_root([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    let expected_sha_root_from_ts =
        0x00b007869b8a5e2a9b3b580a318e702cea04b2f5438f2e26743f545e4d1ecbdb;
    assert_eq(sha_root, expected_sha_root_from_ts);
}

#[test]
fn test_empty_tree_root() {
    assert_eq(compute_empty_tree_root::<0>(), 0);

    assert_eq(
        compute_empty_tree_root::<1>(),
        0x0b63a53787021a4a962a452c2921b3663aff1ffd8d5510540f8e659e782956f1,
    );

    assert_eq(
        compute_empty_tree_root::<2>(),
        0x0e34ac2c09f45a503d2908bcb12f1cbae5fa4065759c88d501c097506a8b2290,
    );

    assert_eq(
        compute_empty_tree_root::<6>(),
        0x01c28fe1059ae0237b72334700697bdf465e03df03986fe05200cadeda66bd76,
    );

    assert_eq(
        compute_empty_tree_root::<10>(),
        0x2a775ea761d20435b31fa2c33ff07663e24542ffb9e7b293dfce3042eb104686,
    );
}
