use types::traits::Empty;

// Utility to check the padded items provided by the user.
// - Checks that all items outside the range [num_original_items, CappedSize) are empty.
// - Checks that non-empty items within the range are consecutive.
// Note: Technically, values outside this range could be non-empty, since they are ignored. However, enforcing emptiness
// helps prevent unexpected output if the array is misconfigured.
pub unconstrained fn check_padded_items<T, let N: u32>(
    padded_items: [T; N],
    num_original_items: u32,
    capped_size: u32,
)
where
    T: Empty,
{
    let mut seen_empty = false;
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
        }
    }
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

        pub fn execute(self) {
            // Safety: `check_padded_items` is supposed to be called only in unconstrained functions.
            unsafe {
                check_padded_items(self.padded_items, self.num_original_items, self.capped_size);
            }
        }
    }

    #[test]
    fn full_padded_items() {
        let builder = TestBuilder::new();
        builder.execute();
    }

    #[test]
    fn partially_full_padded_items() {
        let mut builder = TestBuilder::new();

        // One empty padded item.
        builder.capped_size = 6;
        builder.execute();

        // Two empty padded items.
        builder.capped_size = 7;
        builder.execute();

        // Three empty padded items.
        builder.capped_size = 8;
        builder.execute();
    }

    #[test]
    fn empty_padded_items() {
        let mut builder = TestBuilder::new();

        builder.padded_items = [0, 0, 0, 0, 0, 0, 0, 0];

        builder.execute();
    }

    #[test(should_fail_with = "padded items should be empty outside of the range [num_original_items, capped_size)")]
    fn non_empty_before_range_fails() {
        let mut builder = TestBuilder::new();

        builder.padded_items[0] = 99;

        builder.execute();
    }

    #[test(should_fail_with = "padded items should be empty outside of the range [num_original_items, capped_size)")]
    fn capped_size_too_small_fails() {
        let mut builder = TestBuilder::new();

        builder.capped_size = 4;

        builder.execute();
    }

    #[test(should_fail_with = "padded items should be empty outside of the range [num_original_items, capped_size)")]
    fn non_empty_after_range_fails() {
        let mut builder = TestBuilder::new();

        builder.padded_items[6] = 99;

        builder.execute();
    }

    #[test(should_fail_with = "non-empty padded items should be consecutive within the range [num_original_items, capped_size)")]
    fn empty_first_in_range_fails() {
        let mut builder = TestBuilder::new();

        builder.padded_items[2] = 0;

        builder.execute();
    }

    #[test(should_fail_with = "non-empty padded items should be consecutive within the range [num_original_items, capped_size)")]
    fn empty_middle_in_range_fails() {
        let mut builder = TestBuilder::new();

        builder.padded_items[3] = 0;

        builder.execute();
    }
}
