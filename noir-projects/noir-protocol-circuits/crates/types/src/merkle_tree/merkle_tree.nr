use crate::{
    constants::{
        DOM_SEP__MERKLE_HASH, DOM_SEP__NULLIFIER_MERKLE, DOM_SEP__PUBLIC_DATA_MERKLE,
        DOM_SEP__RETRIEVED_BYTECODES_MERKLE, DOM_SEP__WRITTEN_SLOTS_MERKLE,
    },
    hash::{accumulate_sha256, poseidon2_hash_with_separator},
    traits::Empty,
    utils::math::is_power_of_2_u32,
};

/// Merkle-node hash used by append-only trees.
pub fn merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__MERKLE_HASH)
}

/// Merkle-node hash for the nullifier tree's sibling paths.
pub fn nullifier_merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__NULLIFIER_MERKLE)
}

/// Merkle-node hash for the public-data tree's sibling paths.
pub fn public_data_merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__PUBLIC_DATA_MERKLE)
}

/// Merkle-node hash for the AVM-internal written-public-data-slots tree's sibling paths.
pub fn written_slots_merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__WRITTEN_SLOTS_MERKLE)
}

/// Merkle-node hash for the AVM-internal retrieved-bytecodes (class-id) tree's sibling paths.
pub fn retrieved_bytecodes_merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_hash_with_separator([left, right], DOM_SEP__RETRIEVED_BYTECODES_MERKLE)
}

pub fn sha_merkle_hash(left: Field, right: Field) -> Field {
    accumulate_sha256(left, right)
}

/// A balanced Merkle tree over `N` leaves (`N` must be a power of 2).
///
/// Leaves are stored and consumed as-is; the internal nodes are built by `compute_merkle_tree_nodes`,
/// which applies `hasher` at every layer with no domain separation between the leaf layer and the
/// internal-node layers. Callers must therefore pass leaves that are already domain-separated from the
/// node hashes (see the warning on `compute_merkle_tree_nodes`).
#[derive(Eq)]
pub struct MerkleTree<let N: u32> {
    pub leaves: [Field; N],
    pub nodes: [Field; N - 1],
}

impl<let N: u32> Empty for MerkleTree<N> {
    fn empty() -> Self {
        MerkleTree { leaves: [0; N], nodes: [0; N - 1] }
    }
}

impl<let N: u32> MerkleTree<N> {
    pub fn new(leaves: [Field; N]) -> Self {
        let nodes = compute_merkle_tree_nodes(leaves, merkle_hash);
        MerkleTree { leaves, nodes }
    }

    pub fn new_with_hasher(leaves: [Field; N], hasher: fn(Field, Field) -> Field) -> Self {
        let nodes = compute_merkle_tree_nodes(leaves, hasher);
        MerkleTree { leaves, nodes }
    }

    pub fn new_sha(leaves: [Field; N]) -> Self {
        let nodes = compute_merkle_tree_nodes(leaves, sha_merkle_hash);
        MerkleTree { leaves, nodes }
    }

    pub fn get_root(self) -> Field {
        self.nodes[N - 2]
    }

    pub fn get_sibling_path<let K: u32>(self, leaf_index: u32) -> [Field; K] {
        assert_eq(2.pow_32(K as Field), N as Field, "Invalid path length");

        let mut path = [0; K];
        let mut current_index = leaf_index;
        let mut subtree_width = N;

        let mut current_sibling_index = sibling_index(current_index);

        path[0] = self.leaves[current_sibling_index];

        let mut subtree_offset: u32 = 0;

        for i in 1..K {
            current_index = current_index / 2;
            subtree_width = subtree_width / 2;

            current_sibling_index = sibling_index(current_index);

            path[i] = self.nodes[subtree_offset + current_sibling_index];

            subtree_offset += subtree_width;
        }

        path
    }
}

pub fn sibling_index(index: u32) -> u32 {
    if index % 2 == 0 {
        index + 1
    } else {
        index - 1
    }
}

/// Computes the `N - 1` internal nodes of a balanced Merkle tree from its `N` leaves (root last);
/// `N` must be a power of 2 greater than 1.
///
/// Leaves are consumed as-is: this helper does not hash leaf preimages, it only hashes pairs upward.
/// The same `hasher` is applied at every layer (the leaf/base layer and all internal-node layers
/// alike), so there is NO domain separation between the leaf hashing and the internal-node hashing. An
/// internal node is therefore just `hasher(left, right)`, indistinguishable in form from a leaf.
///
/// WARNING: because of this, callers MUST pass leaves that are already domain-separated from this
/// helper's internal-node hashes (i.e. produced by a hash whose domain differs from `hasher`), so that
/// an internal-node value can never be a valid leaf. (Per-tree domain separation of the node hashing
/// itself is likewise the caller's choice: pass the tree-specific hasher, e.g. `nullifier_merkle_hash`.)
pub fn compute_merkle_tree_nodes<let N: u32>(
    leaves: [Field; N],
    hasher: fn(Field, Field) -> Field,
) -> [Field; N - 1] {
    // Note: `N` must be a power of 2.
    std::static_assert(is_power_of_2_u32(N), "N must be a power of 2");
    std::static_assert(N != 1, "2 must divide N");

    let mut nodes = [0; N - 1];

    let total_nodes = N - 1;
    let half_size = N / 2;

    // Hash base layer.
    for i in 0..half_size {
        nodes[i] = hasher(leaves[2 * i], leaves[2 * i + 1]);
    }

    // Hash the other layers.
    for i in 0..(total_nodes - half_size) {
        nodes[half_size + i] = hasher(nodes[2 * i], nodes[2 * i + 1]);
    }

    nodes
}

mod tests {
    use super::{compute_merkle_tree_nodes, MerkleTree};

    // A trivial, collision-prone hasher that makes the absence of leaf/internal-node domain separation
    // observable: each node is simply the sum of its two children.
    fn add_hasher(left: Field, right: Field) -> Field {
        left + right
    }

    #[test]
    fn leaves_and_internal_nodes_share_one_hasher() {
        // base layer: 1+2=3, 3+4=7 ; internal layer (root last): 3+7=10
        let nodes = compute_merkle_tree_nodes([1, 2, 3, 4], add_hasher);
        assert_eq(nodes, [3, 7, 10]);
    }

    #[test]
    fn internal_node_value_hashes_identically_as_a_leaf() {
        // Feeding the internal-node values 3 and 7 back in as *leaves* yields the same root (10): the
        // helper hashes the leaf layer and the internal-node layers with one hasher, so an internal
        // node is indistinguishable in form from a leaf. Callers must pass domain-separated leaves.
        let nodes = compute_merkle_tree_nodes([3, 7, 0, 0], add_hasher);
        assert_eq(nodes[nodes.len() - 1], 3 + 7);
    }

    #[test]
    fn merkle_tree_root_is_last_node() {
        let tree = MerkleTree::new_with_hasher([1, 2, 3, 4], add_hasher);
        assert_eq(tree.get_root(), 10);
        assert_eq(tree.get_root(), tree.nodes[tree.nodes.len() - 1]);
    }
}
