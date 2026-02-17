use types::traits::Empty;

/// Utility to validate the layout of the padded items provided by the user.
///
/// Our target (created in a later fn): [<-- original ("kept") items -->|<-- padding -->|0, ..., 0]
///                                                                     ^               ^
///                                                                     |               |
///                                                  `num_original_items`               `capped_size`: the number of elements this reset
///                                                                     |               circuit is capable of processing.
///                                                                     |               |
///                                                                     v               v
/// `padded_items`:                     [0, ...                      , 0|<-- padding -->|0, ..., 0]
///
/// So `padded_items` is _solely the padding_!!!
///
/// - Checks that all items outside the range [num_original_items, CappedSize) are empty.
/// - Checks that non-empty items within the range are consecutive. (So we do technically allow 0 padding, as
///   long as it's all on the rhs).
///
/// Note: Technically, values outside this range could be non-empty, since they are ignored. However, enforcing emptiness
/// helps prevent unexpected output if the array is misconfigured.
///
/// Returns the number of padded items.
pub unconstrained fn check_padded_items<T, let N: u32>(
    padded_items: [T; N],
    num_original_items: u32,
    capped_size: u32,
) -> u32
where
    T: Empty,
{
    let mut seen_empty = false;
    let mut num_padded_items = 0;
    for i in 0..N {
        let item_is_empty = padded_items[i].is_empty();
        if i < num_original_items | i >= capped_size {
            assert(
                item_is_empty,
                "padded items should be empty outside of the range [num_original_items, capped_size)",
            );
        } else {
            assert(
                item_is_empty | !seen_empty,
                "non-empty padded items should be consecutive within the range [num_original_items, capped_size)",
            );
            seen_empty |= item_is_empty;
            num_padded_items += 1 * !item_is_empty as u32;
        }
    }

    num_padded_items
}

mod tests {
    use super::check_padded_items;

    struct TestBuilder {
        padded_items: [u32; 8],
        num_original_items: u32,
        capped_size: u32,
    }

    impl TestBuilder {
        pub fn new() -> Self {
            TestBuilder {
                padded_items: [0, 0, 11, 22, 33, 0, 0, 0],
                num_original_items: 2,
                capped_size: 5,
            }
        }

        pub fn execute(self) -> u32 {
            // Safety: `check_padded_items` is supposed to be called only in unconstrained functions.
            unsafe {
                check_padded_items(self.padded_items, self.num_original_items, self.capped_size)
            }
        }
    }

    #[test]
    fn full_padded_items() {
        let builder = TestBuilder::new();
        assert_eq(builder.execute(), 3);
    }

    #[test]
    fn partially_full_padded_items() {
        let mut builder = TestBuilder::new();
        let expected_num_padded_items = 3;

        // One empty padded item.
        builder.capped_size = 6;
        assert_eq(builder.execute(), expected_num_padded_items);

        // Two empty padded items.
        builder.capped_size = 7;
        assert_eq(builder.execute(), expected_num_padded_items);

        // Three empty padded items.
        builder.capped_size = 8;
        assert_eq(builder.execute(), expected_num_padded_items);
    }

    #[test]
    fn empty_padded_items() {
        let mut builder = TestBuilder::new();

        builder.padded_items = [0, 0, 0, 0, 0, 0, 0, 0];

        assert_eq(builder.execute(), 0);
    }

    #[test(should_fail_with = "padded items should be empty outside of the range [num_original_items, capped_size)")]
    fn non_empty_before_range_fails() {
        let mut builder = TestBuilder::new();

        builder.padded_items[0] = 99;

        let _ = builder.execute();
    }

    #[test(should_fail_with = "padded items should be empty outside of the range [num_original_items, capped_size)")]
    fn capped_size_too_small_fails() {
        let mut builder = TestBuilder::new();

        builder.capped_size = 4;

        let _ = builder.execute();
    }

    #[test(should_fail_with = "padded items should be empty outside of the range [num_original_items, capped_size)")]
    fn non_empty_after_range_fails() {
        let mut builder = TestBuilder::new();

        builder.padded_items[6] = 99;

        let _ = builder.execute();
    }

    #[test(should_fail_with = "non-empty padded items should be consecutive within the range [num_original_items, capped_size)")]
    fn empty_first_in_range_fails() {
        let mut builder = TestBuilder::new();

        builder.padded_items[2] = 0;

        let _ = builder.execute();
    }

    #[test(should_fail_with = "non-empty padded items should be consecutive within the range [num_original_items, capped_size)")]
    fn empty_middle_in_range_fails() {
        let mut builder = TestBuilder::new();

        builder.padded_items[3] = 0;

        let _ = builder.execute();
    }
}
