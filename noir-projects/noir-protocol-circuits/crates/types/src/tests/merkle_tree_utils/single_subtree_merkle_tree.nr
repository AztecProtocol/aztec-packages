use crate::{
    hash::merkle_hash,
    merkle_tree::{calculate_empty_tree_root, MerkleTree},
    utils::arrays::subarray,
};

pub struct SingleSubtreeMerkleTree<let SubtreeWidth: u32, let SubtreeHeight: u32, let TreeHeight: u32> {
    subtree: MerkleTree<SubtreeWidth>,
    top_tree_zero_hashes: [Field; TreeHeight - SubtreeHeight],
    subtree_zero_hashes: [Field; SubtreeHeight],
    path_to_subtree_root: [Field; TreeHeight - SubtreeHeight],
    tree_root: Field,
    first_leaf_index: Field,
}

impl<let SubtreeWidth: u32, let SubtreeHeight: u32, let TreeHeight: u32> SingleSubtreeMerkleTree<SubtreeWidth, SubtreeHeight, TreeHeight> {
    pub fn new(subtree_leaves: [Field; SubtreeWidth]) -> Self {
        Self::new_at_index(subtree_leaves, 0)
    }

    pub fn new_at_index(subtree_leaves: [Field; SubtreeWidth], first_leaf_index: Field) -> Self {
        Self::new_tree_roots_at_index::<0>(subtree_leaves, first_leaf_index)
    }

    /// The values to be inserted to the subtree are tree roots themselves. The zero hashes will take into account the
    /// extra layers (`InsertedValueTreeHeight`) of the inserted values.
    pub fn new_tree_roots_at_index<let InsertedValueTreeHeight: u32>(
        subtree_leaves: [Field; SubtreeWidth],
        first_leaf_index: Field,
    ) -> Self {
        assert_eq(
            first_leaf_index as u64 % SubtreeWidth as u64,
            0,
            "First leaf index must be a multiple of the subtree width",
        );

        let zero_hashes = [0].concat(compute_zero_hashes::<TreeHeight + InsertedValueTreeHeight>());
        let top_tree_zero_hashes = subarray(zero_hashes, InsertedValueTreeHeight + SubtreeHeight);
        let subtree_zero_hashes = subarray(zero_hashes, InsertedValueTreeHeight);

        let subtree = MerkleTree::new(subtree_leaves);

        let subtree_root = subtree.get_root();
        let subtree_root_index = first_leaf_index as u64 >> SubtreeHeight as u64;
        let (tree_root, path_to_subtree_root) = build_root_and_path_to_value(
            subtree_root_index as Field,
            subtree_root,
            top_tree_zero_hashes,
        );

        Self {
            subtree,
            top_tree_zero_hashes,
            subtree_zero_hashes,
            path_to_subtree_root,
            tree_root,
            first_leaf_index,
        }
    }

    pub fn get_sibling_path(self, leaf_index: Field) -> [Field; TreeHeight] {
        let subtree_sibling_path: [Field; SubtreeHeight] = if self.is_leaf_index_in_subtree(
            leaf_index,
        ) {
            let index_in_subtree = leaf_index as u64 % SubtreeWidth as u64;
            self.subtree.get_sibling_path(index_in_subtree as u32)
        } else {
            self.subtree_zero_hashes
        };

        let mut top_tree_sibling_path = [0; TreeHeight - SubtreeHeight];
        let mut index_at_level = leaf_index as u64 >> SubtreeHeight as u64;
        let mut path_index_at_level = self.first_leaf_index as u64 >> SubtreeHeight as u64;
        for level in 0..top_tree_sibling_path.len() {
            let sibling_index = get_sibling_index(index_at_level);
            top_tree_sibling_path[level] = if sibling_index == path_index_at_level {
                self.path_to_subtree_root[level]
            } else {
                self.top_tree_zero_hashes[level]
            };
            index_at_level /= 2;
            path_index_at_level /= 2;
        }

        subtree_sibling_path.concat(top_tree_sibling_path)
    }

    pub fn update_leaf(&mut self, leaf_index: Field, value: Field) {
        assert(self.is_leaf_index_in_subtree(leaf_index), "Cannot update leaf at given index");

        let index_in_subtree = (leaf_index as u64 % SubtreeWidth as u64) as u32;
        self.subtree.update_leaf::<SubtreeHeight>(index_in_subtree, value);

        let subtree_root = self.subtree.get_root();
        let subtree_root_index = (leaf_index as u64 >> SubtreeHeight as u64) as Field;
        let (tree_root, path_to_subtree_root) = build_root_and_path_to_value(
            subtree_root_index,
            subtree_root,
            self.top_tree_zero_hashes,
        );

        self.tree_root = tree_root;
        self.path_to_subtree_root = path_to_subtree_root;
    }

    pub fn get_root(self) -> Field {
        self.tree_root
    }

    pub fn get_next_available_index(self) -> Field {
        self.first_leaf_index + (1 << SubtreeHeight as u64) as Field
    }

    fn is_leaf_index_in_subtree(self, leaf_index: Field) -> bool {
        !leaf_index.lt(self.first_leaf_index) & leaf_index.lt(self.get_next_available_index())
    }
}

fn get_sibling_index(index: u64) -> u64 {
    if index % 2 == 0 {
        index + 1
    } else {
        index - 1
    }
}

pub fn compute_zero_hashes<let N: u32>() -> [Field; N] {
    let mut hashes = [0; N];
    hashes[0] = merkle_hash(0, 0);

    for i in 1..N {
        hashes[i] = merkle_hash(hashes[i - 1], hashes[i - 1]);
    }

    hashes
}

fn build_root_and_path_to_value<let TreeHeight: u32>(
    leaf_index: Field,
    value: Field,
    sibling_path: [Field; TreeHeight],
) -> (Field, [Field; TreeHeight]) {
    let mut path_to_value = [0; TreeHeight];
    let mut node = value;
    let mut index_at_level = leaf_index as u64;

    for level in 0..TreeHeight {
        path_to_value[level] = node;
        let (left_node, right_node) = if index_at_level % 2 == 1 {
            (sibling_path[level], node)
        } else {
            (node, sibling_path[level])
        };
        node = merkle_hash(left_node, right_node);
        index_at_level /= 2;
    }

    (node, path_to_value)
}

#[test]
fn empty_subtree_height_2() {
    let tree = SingleSubtreeMerkleTree::<2, 1, 2>::new([0; 2]);

    let path = tree.get_sibling_path(3);
    assert_eq(path[0], 0);
    assert_eq(path[1], merkle_hash(0, 0));

    assert_eq(tree.get_root(), calculate_empty_tree_root(2));
}

#[test]
fn empty_subtree_height_3() {
    let tree = SingleSubtreeMerkleTree::<2, 1, 3>::new([0; 2]);

    let zero_hashes = compute_zero_hashes::<3>();
    let path = tree.get_sibling_path(0);
    assert_eq(path[0], 0);
    assert_eq(path[1], zero_hashes[0]);
    assert_eq(path[2], zero_hashes[1]);

    assert_eq(tree.get_root(), calculate_empty_tree_root(3));
}

#[test]
fn non_empty_subtree_insert_front() {
    let tree = SingleSubtreeMerkleTree::<2, 1, 3>::new([11, 22]);
    assert_eq(tree.get_next_available_index(), 2);

    let zero_hashes = compute_zero_hashes::<3>();

    let path_1 = tree.get_sibling_path(1);
    assert_eq(path_1[0], 11);
    assert_eq(path_1[1], zero_hashes[0]);
    assert_eq(path_1[2], zero_hashes[1]);

    let mut path_to_subtree_root = [0; 3];
    path_to_subtree_root[0] = merkle_hash(11, 22);
    path_to_subtree_root[1] = merkle_hash(path_to_subtree_root[0], zero_hashes[0]);
    path_to_subtree_root[2] = merkle_hash(path_to_subtree_root[1], zero_hashes[1]);

    assert_eq(tree.get_root(), path_to_subtree_root[2]);

    let path_4 = tree.get_sibling_path(4);
    assert_eq(path_4[0], 0);
    assert_eq(path_4[1], zero_hashes[0]);
    assert_eq(path_4[2], path_to_subtree_root[1]);
}

#[test]
fn non_empty_subtree_insert_middle() {
    // Insert the subtree from index 2.
    let tree = SingleSubtreeMerkleTree::<2, 1, 3>::new_at_index([11, 22], 2);
    assert_eq(tree.get_next_available_index(), 4);

    let zero_hashes = compute_zero_hashes::<3>();

    let path_2 = tree.get_sibling_path(2);
    assert_eq(path_2[0], 22);
    assert_eq(path_2[1], zero_hashes[0]);
    assert_eq(path_2[2], zero_hashes[1]);

    let mut path_to_subtree_root = [0; 3];
    path_to_subtree_root[0] = merkle_hash(11, 22);
    path_to_subtree_root[1] = merkle_hash(zero_hashes[0], path_to_subtree_root[0]);
    path_to_subtree_root[2] = merkle_hash(path_to_subtree_root[1], zero_hashes[1]);

    assert_eq(tree.get_root(), path_to_subtree_root[2]);

    let path_1 = tree.get_sibling_path(1);
    assert_eq(path_1[0], 0);
    assert_eq(path_1[1], path_to_subtree_root[0]);
    assert_eq(path_1[2], zero_hashes[1]);

    let path_4 = tree.get_sibling_path(4);
    assert_eq(path_4[0], 0);
    assert_eq(path_4[1], zero_hashes[0]);
    assert_eq(path_4[2], path_to_subtree_root[1]);
}

#[test]
fn update_leaves_to_empty() {
    let mut tree = SingleSubtreeMerkleTree::<2, 1, 3>::new([11, 22]);

    let empty_tree_root = calculate_empty_tree_root(3);

    assert(tree.get_root() != empty_tree_root);
    tree.update_leaf(0, 0);
    assert(tree.get_root() != empty_tree_root);
    tree.update_leaf(1, 0);
    assert_eq(tree.get_root(), empty_tree_root);
}

#[test]
fn update_leaf_values() {
    // Subtree leaves are at indices 2 and 3.
    let mut tree = SingleSubtreeMerkleTree::<2, 1, 3>::new_at_index([11, 22], 2);

    let zero_hashes = compute_zero_hashes::<3>();

    let mut expected_tree_root = merkle_hash(11, 22);
    expected_tree_root = merkle_hash(zero_hashes[0], expected_tree_root);
    expected_tree_root = merkle_hash(expected_tree_root, zero_hashes[1]);
    assert_eq(tree.get_root(), expected_tree_root);

    tree.update_leaf(3, 33);
    expected_tree_root = merkle_hash(11, 33);
    expected_tree_root = merkle_hash(zero_hashes[0], expected_tree_root);
    expected_tree_root = merkle_hash(expected_tree_root, zero_hashes[1]);
    assert_eq(tree.get_root(), expected_tree_root);

    tree.update_leaf(2, 44);
    expected_tree_root = merkle_hash(44, 33);
    expected_tree_root = merkle_hash(zero_hashes[0], expected_tree_root);
    expected_tree_root = merkle_hash(expected_tree_root, zero_hashes[1]);
    assert_eq(tree.get_root(), expected_tree_root);
}

#[test]
fn insert_tree_roots_as_subtree_leaves_insert_front() {
    let subtree_0 = MerkleTree::new([11, 22]);
    let subtree_1 = MerkleTree::new([33, 44]);
    let combined_tree = SingleSubtreeMerkleTree::<2, 1, 3>::new_tree_roots_at_index::<1>(
        [subtree_0.get_root(), subtree_1.get_root()],
        0,
    );

    // It should be the same as inserting the leaves directly.
    let whole_tree = SingleSubtreeMerkleTree::<4, 2, 4>::new([11, 22, 33, 44]);

    assert_eq(combined_tree.get_root(), whole_tree.get_root());

    assert_eq(combined_tree.get_sibling_path(0), subarray(whole_tree.get_sibling_path(0), 1));

    let leaf_index = 5;
    let subtree_root_at_index = 5 >> 1;
    assert_eq(
        combined_tree.get_sibling_path(subtree_root_at_index as Field),
        subarray(whole_tree.get_sibling_path(leaf_index), 1),
    );
}

#[test]
fn insert_tree_roots_as_subtree_leaves_insert_middle() {
    let subtree_0 = MerkleTree::new([11, 22]);
    let subtree_1 = MerkleTree::new([33, 44]);
    let combined_tree = SingleSubtreeMerkleTree::<2, 1, 3>::new_tree_roots_at_index::<1>(
        [subtree_0.get_root(), subtree_1.get_root()],
        2,
    );

    // It should be the same as inserting the leaves directly.
    let whole_tree = SingleSubtreeMerkleTree::<4, 2, 4>::new_at_index([11, 22, 33, 44], 4);

    assert_eq(combined_tree.get_root(), whole_tree.get_root());

    assert_eq(combined_tree.get_sibling_path(0), subarray(whole_tree.get_sibling_path(0), 1));

    let leaf_index = 5;
    let subtree_root_at_index = 5 >> 1;
    assert_eq(
        combined_tree.get_sibling_path(subtree_root_at_index as Field),
        subarray(whole_tree.get_sibling_path(leaf_index), 1),
    );
}
