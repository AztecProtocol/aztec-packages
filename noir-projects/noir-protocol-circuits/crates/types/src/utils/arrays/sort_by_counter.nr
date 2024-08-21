use crate::{abis::side_effect::Ordered, traits::{Empty, is_empty}};

pub fn compare_by_counter_empty_padded_asc<T>(a: T, b: T) -> bool where T: Ordered + Empty + Eq {
    let both_exposed = (a.counter() == b.counter()) & (a.counter() == 0); // Items exposed from private have 0 counters.
    is_empty(b) | (!is_empty(a) & ((a.counter() < b.counter()) | both_exposed))
}

pub fn compare_by_counter_empty_padded_desc<T>(a: T, b: T) -> bool where T: Ordered + Empty + Eq {
    let both_exposed = (a.counter() == b.counter()) & (a.counter() == 0);
    is_empty(b) | ((a.counter() > b.counter()) | both_exposed)
}

fn sort_by<T, let N: u32>(array: [T; N], ordering: fn(T, T) -> bool) -> [T; N] {
    array.sort_via(|a, b| ordering(a, b))
}

pub fn sort_by_counter_asc<T, let N: u32>(array: [T; N]) -> [T; N] where T: Ordered + Empty + Eq {
    sort_by(array, compare_by_counter_empty_padded_asc)
}

pub fn sort_by_counter_desc<T, let N: u32>(array: [T; N]) -> [T; N] where T: Ordered + Empty + Eq {
    sort_by(array, compare_by_counter_empty_padded_desc)
}

mod tests {
    use crate::{
        abis::side_effect::Ordered, traits::Empty,
        utils::arrays::sort_by_counter::{sort_by_counter_asc, sort_by_counter_desc}
    };

    struct TestItem {
        value: u32,
        counter: u32,
    }

    impl Ordered for TestItem {
        fn counter(self) -> u32 {
            self.counter
        }
    }

    impl Eq for TestItem {
        fn eq(self, other: Self) -> bool {
            (self.value == other.value) & (self.counter == other.counter)
        }
    }

    impl Empty for TestItem {
        fn empty() -> Self {
            TestItem { value: 0, counter: 0 }
        }
    }

    fn sort_by_values_asc<let N: u32>(values: [u32; N]) -> [u32; N] {
        let items = values.map(|value| TestItem { value, counter: value });
        sort_by_counter_asc(items).map(|item: TestItem| item.value)
    }

    fn sort_by_values_desc<let N: u32>(values: [u32; N]) -> [u32; N] {
        let items = values.map(|value| TestItem { value, counter: value });
        sort_by_counter_desc(items).map(|item: TestItem| item.value)
    }

    #[test]
    fn sort_by_counter_asc_full_non_empty() {
        let sorted = sort_by_values_asc([4, 2, 1, 3, 5]);
        assert_eq(sorted, [1, 2, 3, 4, 5]);
    }

    #[test]
    fn sort_by_counter_desc_full_non_empty() {
        let sorted = sort_by_values_desc([4, 2, 1, 3, 5]);
        assert_eq(sorted, [5, 4, 3, 2, 1]);
    }

    #[test]
    fn sort_by_counter_asc_padded_empty() {
        let sorted = sort_by_values_asc([4, 2, 0, 0, 1, 0, 3, 5]);
        assert_eq(sorted, [1, 2, 3, 4, 5, 0, 0, 0]);
    }

    #[test]
    fn sort_by_counter_desc_padded_empty() {
        let sorted = sort_by_values_desc([4, 2, 0, 0, 1, 0, 3, 5]);
        assert_eq(sorted, [5, 4, 3, 2, 1, 0, 0, 0]);
    }

    #[test]
    fn sort_by_counter_asc_with_zero_counters() {
        let original = [
            TestItem { value: 55, counter: 1 },
            TestItem { value: 11, counter: 0 },
            TestItem { value: 33, counter: 2 },
            TestItem { value: 44, counter: 0 },
            TestItem { value: 22, counter: 0 }
        ];
        let expected = [
            TestItem { value: 22, counter: 0 },
            TestItem { value: 44, counter: 0 },
            TestItem { value: 11, counter: 0 },
            TestItem { value: 55, counter: 1 },
            TestItem { value: 33, counter: 2 }
        ];
        assert_eq(sort_by_counter_asc(original), expected);
    }

    #[test]
    fn sort_by_counter_desc_with_zero_counters() {
        let original = [
            TestItem { value: 55, counter: 1 },
            TestItem { value: 11, counter: 0 },
            TestItem { value: 33, counter: 2 },
            TestItem { value: 44, counter: 0 },
            TestItem { value: 22, counter: 0 }
        ];
        let expected = [
            TestItem { value: 33, counter: 2 },
            TestItem { value: 55, counter: 1 },
            TestItem { value: 22, counter: 0 },
            TestItem { value: 44, counter: 0 },
            TestItem { value: 11, counter: 0 }
        ];
        assert_eq(sort_by_counter_desc(original), expected);
    }
}
