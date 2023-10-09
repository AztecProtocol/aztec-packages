use crate::constants;
// TODO(David): When we call compute_block_hash, we pass these
// fields to it. Why not have a Block data structure? 

// This is not in the cpp code.
struct Block {
    // Private data
    private_data_tree_root : Field,
    nullifier_tree_root : Field,
    contract_tree_root : Field,
    l1_to_l2_data_tree_root : Field,

    // Public data
    public_data_tree_root : Field,
    global_variables_hash : Field,
}


impl Block {
    fn assert_is_zero(self) {
        assert(self.private_data_tree_root == 0);
        assert(self.nullifier_tree_root == 0);
        assert(self.contract_tree_root == 0);
        assert(self.l1_to_l2_data_tree_root == 0);
        assert(self.public_data_tree_root == 0);
    }

    // TODO: Hash all contents of Block
    fn hash(self) -> Field {
        let _hash_index = constants::generator_index::BLOCK_HASH;
        0
    }
}