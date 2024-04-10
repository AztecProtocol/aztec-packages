use crate::merkle_tree::leaf_preimage::IndexedTreeLeafPreimage;

pub fn assert_check_valid_low_leaf<LEAF_PREIMAGE>(
    key: Field,
    low_leaf_preimage: LEAF_PREIMAGE
) where LEAF_PREIMAGE: IndexedTreeLeafPreimage {
    let low_key = low_leaf_preimage.get_key();
    let next_key = low_leaf_preimage.get_next_key();
    let is_empty_leaf = (low_key == 0) & (next_key == 0);

    assert(!is_empty_leaf, "Cannot check non membership against empty leaf");
    assert(low_key.lt(key), "Key is not greater than the low leaf");
    assert(key.lt(next_key) | (next_key == 0), "Key is not less than the next leaf");
}

mod tests {
    use crate::{
        merkle_tree::{
        leaf_preimage::IndexedTreeLeafPreimage,
        indexed_tree::check_valid_low_leaf::assert_check_valid_low_leaf
    }
    };

    struct TestLeafPreimage {
        value: Field,
        next_value: Field,
    }

    impl IndexedTreeLeafPreimage for TestLeafPreimage {
        fn get_key(self) -> Field {
            self.value
        }

        fn get_next_key(self) -> Field {
            self.next_value
        }

        fn as_leaf(self) -> Field {
            self.value
        }
    }

    #[test]
    fn test_assert_check_valid_low_leaf() {
        let key = 12;
        let leaf = TestLeafPreimage { value: 11, next_value: 13 };
        assert_check_valid_low_leaf(key, leaf);
    }

    #[test(should_fail_with="Cannot check non membership against empty leaf")]
    fn test_assert_check_valid_low_leaf_failed_empty_leaf() {
        let empty_leaf = TestLeafPreimage { value: 0, next_value: 0 };
        assert_check_valid_low_leaf(0, empty_leaf);
    }

    #[test(should_fail_with="Key is not greater than the low leaf")]
    fn test_assert_check_valid_low_leaf_failed_wrong_low_leaf() {
        let key = 12;
        let leaf = TestLeafPreimage { value: 13, next_value: 15 };
        assert_check_valid_low_leaf(key, leaf);
    }

    #[test(should_fail_with="Key is not greater than the low leaf")]
    fn test_assert_check_valid_low_leaf_failed_is_low_leaf() {
        let key = 12;
        let leaf = TestLeafPreimage { value: 12, next_value: 15 };
        assert_check_valid_low_leaf(key, leaf);
    }

    #[test(should_fail_with="Key is not less than the next leaf")]
    fn test_assert_check_valid_low_leaf_failed_wrong_next_key() {
        let key = 12;
        let leaf = TestLeafPreimage { value: 9, next_value: 11 };
        assert_check_valid_low_leaf(key, leaf);
    }
}
