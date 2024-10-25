use crate::{abis::side_effect::{Inner, Overridable}, traits::{Empty, is_empty}};

// Check that deduped_array contains values that are not being overriden, i.e. override_counter == 0.
pub fn assert_deduped_array<S, T, let N: u32>(original_array: [S; N], deduped_array: [T; N])
where
    S: Overridable + Inner<T>,
    T: Eq + Empty,
{
    let mut num_added = 0;
    for i in 0..original_array.len() {
        let original = original_array[i];
        if original.override_counter() == 0 {
            assert_eq(original.inner(), deduped_array[num_added], "mismatch deduped item");
            num_added += 1;
        }
    }
    let mut should_be_empty = false;
    for i in 0..original_array.len() {
        should_be_empty |= i == num_added;
        if should_be_empty {
            assert(is_empty(deduped_array[i]), "empty items must be padded to the deduped array");
        }
    }
}

pub unconstrained fn dedupe_array<S, T, let N: u32>(original_array: [S; N]) -> [T; N]
where
    S: Overridable + Inner<T>,
{
    let mut deduped = BoundedVec::new();
    for i in 0..original_array.len() {
        let original = original_array[i];
        if original.override_counter() == 0 {
            deduped.push(original.inner());
        }
    }
    deduped.storage
}

mod tests {
    use crate::{
        abis::side_effect::{Inner, Overridable},
        tests::{types::TestValue, utils::pad_end},
        traits::Empty,
        utils::arrays::assert_deduped_array::{assert_deduped_array, dedupe_array},
    };

    struct TestItem {
        value: TestValue,
        override_by: TestValue,
    }

    impl Overridable for TestItem {
        fn override_counter(self) -> u32 {
            self.override_by.counter
        }
    }

    impl Inner<TestValue> for TestItem {
        fn inner(self) -> TestValue {
            self.value
        }
    }

    impl Empty for TestItem {
        fn empty() -> Self {
            TestItem { value: TestValue::empty(), override_by: TestValue::empty() }
        }
    }

    impl Eq for TestItem {
        fn eq(self, other: Self) -> bool {
            (self.value == other.value) & (self.override_by == other.override_by)
        }
    }

    global NUM_TEST_ITEMS = 10;

    struct TestBuilder {
        original_array: [TestItem; NUM_TEST_ITEMS],
        deduped_array: [TestValue; NUM_TEST_ITEMS],
    }

    impl TestBuilder {
        pub fn new_empty() -> Self {
            let original_array = pad_end([], TestItem::empty());
            let deduped_array = pad_end([], TestValue::empty());
            TestBuilder { original_array, deduped_array }
        }

        pub fn new() -> Self {
            let values = [
                TestValue { value: 22, counter: 2 },
                TestValue { value: 11, counter: 1 },
                TestValue { value: 44, counter: 4 },
                TestValue { value: 11, counter: 6 },
                TestValue { value: 11, counter: 3 },
                TestValue { value: 33, counter: 5 },
            ];
            let mut original_array = pad_end(
                values.map(|value: TestValue| TestItem { value, override_by: TestValue::empty() }),
                TestItem::empty(),
            );
            original_array[1].override_by = values[4];
            original_array[4].override_by = values[3];

            let deduped_array = pad_end(
                [values[0], values[2], values[3], values[5]],
                TestValue::empty(),
            );

            TestBuilder { original_array, deduped_array }
        }

        pub fn execute(self) {
            assert_deduped_array(self.original_array, self.deduped_array);
        }

        pub fn check_and_execute(self) {
            let deduped = unsafe { dedupe_array(self.original_array) };
            assert_eq(self.deduped_array, deduped);

            self.execute();
        }
    }

    #[test]
    fn assert_deduped_array_empty_succeeds() {
        let builder = TestBuilder::new_empty();
        builder.check_and_execute();
    }

    #[test]
    fn assert_deduped_array_succeeds() {
        let builder = TestBuilder::new();
        builder.check_and_execute();
    }

    #[test(should_fail_with = "mismatch deduped item")]
    fn assert_deduped_array_extra_item_fails() {
        let mut builder = TestBuilder::new();

        builder.deduped_array[7] = builder.original_array[1].inner();

        builder.execute();
    }

    #[test(should_fail_with = "empty items must be padded to the deduped array")]
    fn assert_deduped_array_extra_item_at_end_fails() {
        let mut builder = TestBuilder::new();

        builder.deduped_array[NUM_TEST_ITEMS - 1] = builder.original_array[1].inner();

        builder.execute();
    }
}
