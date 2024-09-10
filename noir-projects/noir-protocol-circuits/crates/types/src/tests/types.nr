use crate::{abis::side_effect::Ordered, traits::Empty};

struct TestValue {
    value: Field,
    counter: u32,
}

impl Empty for TestValue {
    fn empty() -> Self {
        TestValue { value: 0, counter: 0 }
    }
}

impl Eq for TestValue {
    fn eq(self, other: Self) -> bool {
        (self.value == other.value) & (self.counter == other.counter)
    }
}

impl Ordered for TestValue {
    fn counter(self) -> u32 {
        self.counter
    }
}

struct TestTwoValues {
    value_1: Field,
    value_2: Field,
    counter: u32,
}

impl Empty for TestTwoValues {
    fn empty() -> Self {
        TestTwoValues { value_1: 0, value_2: 0, counter: 0 }
    }
}

impl Eq for TestTwoValues {
    fn eq(self, other: Self) -> bool {
        (self.value_1 == other.value_1) & (self.value_2 == other.value_2) & (self.counter == other.counter)
    }
}

impl Ordered for TestTwoValues {
    fn counter(self) -> u32 {
        self.counter
    }
}

struct TestCombinedValue {
    value: Field,
}

impl Empty for TestCombinedValue {
    fn empty() -> Self {
        TestCombinedValue { value: 0 }
    }
}

impl Eq for TestCombinedValue {
    fn eq(self, other: Self) -> bool {
        (self.value == other.value)
    }
}

pub fn sum_two_values(from: TestTwoValues) -> TestValue {
    TestValue { value: from.value_1 + from.value_2, counter: from.counter }
}

pub fn is_summed_from_two_values(from: TestTwoValues, to: TestValue) -> bool {
    ((from.value_1 + from.value_2) == to.value) & (from.counter == to.counter)
}

pub fn combine_two_values(from: TestTwoValues) -> TestCombinedValue {
    TestCombinedValue { value: from.value_1 + from.value_2 }
}

pub fn is_combined_from_two_values(from: TestTwoValues, to: TestCombinedValue) -> bool {
    ((from.value_1 + from.value_2) == to.value)
}
