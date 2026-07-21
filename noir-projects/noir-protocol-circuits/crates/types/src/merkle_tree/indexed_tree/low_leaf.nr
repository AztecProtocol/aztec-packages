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
    use crate::merkle_tree::test_utils::TestLeafPreimage;
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

    #[test]
    fn invalid_low_leaf_next_key_equal_to_key() {
        // Key exactly equals next_key - should be invalid (key must be strictly less than next)
        let key = 15;
        let leaf = TestLeafPreimage { value: 10, next_value: 15 };
        assert_eq(is_valid_low_leaf(key, leaf), (false, true, false));
    }

    #[test]
    fn valid_low_leaf_key_one_more_than_low() {
        // Minimum valid key: exactly one more than low_key
        let key = 11;
        let leaf = TestLeafPreimage { value: 10, next_value: 20 };
        assert_eq(is_valid_low_leaf(key, leaf), (true, true, true));
    }

    #[test]
    fn valid_low_leaf_key_one_less_than_next() {
        // Maximum valid key: exactly one less than next_key
        let key = 19;
        let leaf = TestLeafPreimage { value: 10, next_value: 20 };
        assert_eq(is_valid_low_leaf(key, leaf), (true, true, true));
    }

    #[test]
    fn invalid_key_zero_cannot_be_in_range() {
        // Key 0 can never be "greater than" any non-negative low_key
        // This is important for indexed tree security - 0 is the sentinel
        let key = 0;
        let leaf = TestLeafPreimage { value: 0, next_value: 100 };
        // is_greater_than_low = 0.lt(0) = false
        // Even though 0 < 100, the key is not greater than low_key
        assert_eq(is_valid_low_leaf(key, leaf), (false, false, true));
    }

    #[test]
    fn valid_max_leaf_points_to_infinity() {
        // A max leaf (points to infinity) is valid for any key greater than its key
        // next_value: 0 means points_to_infinity() returns true
        let key = 100;
        let leaf = TestLeafPreimage { value: 50, next_value: 0 };
        assert_eq(is_valid_low_leaf(key, leaf), (true, true, true));
    }

    #[test]
    fn invalid_max_leaf_key_less_than_low() {
        // Even if leaf points to infinity, key must still be greater than low_key
        let key = 30;
        let leaf = TestLeafPreimage { value: 50, next_value: 0 };
        // is_greater_than_low = 50.lt(30) = false
        // is_less_than_next = 30.lt(0) | true = true (points to infinity)
        // is_valid = false & true = false
        assert_eq(is_valid_low_leaf(key, leaf), (false, false, true));
    }

    #[test]
    fn invalid_max_leaf_key_equal_to_low() {
        // Key equals low_key on a max leaf - should be invalid
        let key = 50;
        let leaf = TestLeafPreimage { value: 50, next_value: 0 };
        assert_eq(is_valid_low_leaf(key, leaf), (false, false, true));
    }
}
