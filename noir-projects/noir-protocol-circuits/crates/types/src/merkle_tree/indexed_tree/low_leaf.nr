use crate::merkle_tree::leaf_preimage::IndexedTreeLeafPreimage;

/// Check if the key is in range of the low leaf.
///
/// Returns:
/// - is_valid: `true` if the key is in range of the low leaf, `false` otherwise.
/// - is_greater_than_low: `true` if the key is greater than the low leaf's key, `false` otherwise.
/// - is_less_than_next: `true` if the key is less than the low leaf's next key, `false` otherwise.
pub fn is_valid_low_leaf<LeafPreimage, Value>(
    key: Field,
    low_leaf_preimage: LeafPreimage,
) -> (bool, bool, bool)
where
    LeafPreimage: IndexedTreeLeafPreimage<Value>,
{
    let low_key = low_leaf_preimage.get_key();
    let next_key = low_leaf_preimage.get_next_key();

    let is_greater_than_low = low_key.lt(key);
    let is_less_than_next = key.lt(next_key) | low_leaf_preimage.points_to_infinity();
    let is_valid = is_greater_than_low & is_less_than_next;

    (is_valid, is_greater_than_low, is_less_than_next)
}

mod tests {
    use crate::tests::types::test_leaf_preimage::TestLeafPreimage;
    use super::is_valid_low_leaf;

    #[test]
    fn valid_low_leaf() {
        let key = 12;
        let leaf = TestLeafPreimage { value: 11, next_value: 13 };
        assert_eq(is_valid_low_leaf(key, leaf), (true, true, true));
    }

    #[test]
    fn empty_low_leaf() {
        // An all-zero low leaf should be valid. It could be used as the first dummy leaf in a tree.
        // It's not possible to prove against an empty leaf at an uninitialized index.
        // The membership check will fail because the leaf value hash(0, 0) is not 0.
        let key = 12;
        let leaf = TestLeafPreimage { value: 0, next_value: 0 };
        assert_eq(is_valid_low_leaf(key, leaf), (true, true, true));
    }

    #[test]
    fn invalid_low_leaf_larger_than_key() {
        let key = 12;
        let leaf = TestLeafPreimage { value: 13, next_value: 15 };
        assert_eq(is_valid_low_leaf(key, leaf), (false, false, true));
    }

    #[test]
    fn invalid_low_leaf_equal_to_key() {
        let key = 12;
        let leaf = TestLeafPreimage { value: 12, next_value: 15 };
        assert_eq(is_valid_low_leaf(key, leaf), (false, false, true));
    }

    #[test]
    fn invalid_low_leaf_next_key_smaller_than_key() {
        let key = 12;
        let leaf = TestLeafPreimage { value: 9, next_value: 11 };
        assert_eq(is_valid_low_leaf(key, leaf), (false, true, false));
    }
}
