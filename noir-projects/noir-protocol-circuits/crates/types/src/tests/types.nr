use crate::{abis::side_effect::Ordered, traits::{Deserialize, Empty, Serialize}};

#[derive(Deserialize, Eq, Serialize)]
pub(crate) struct TestValue {
    pub(crate) value: Field,
    pub(crate) counter: u32,
}

impl Empty for TestValue {
    fn empty() -> Self {
        TestValue { value: 0, counter: 0 }
    }
}

impl Ordered for TestValue {
    fn counter(self) -> u32 {
        self.counter
    }
}

#[derive(Eq)]
pub(crate) struct TestTwoValues {
    pub(crate) value_1: Field,
    pub(crate) value_2: Field,
    pub(crate) counter: u32,
}

impl Empty for TestTwoValues {
    fn empty() -> Self {
        TestTwoValues { value_1: 0, value_2: 0, counter: 0 }
    }
}

impl Ordered for TestTwoValues {
    fn counter(self) -> u32 {
        self.counter
    }
}

#[derive(Eq)]
pub(crate) struct TestCombinedValue {
    pub(crate) value: Field,
}

impl Empty for TestCombinedValue {
    fn empty() -> Self {
        TestCombinedValue { value: 0 }
    }
}

pub(crate) fn sum_two_values(from: TestTwoValues) -> TestValue {
    TestValue { value: from.value_1 + from.value_2, counter: from.counter }
}

pub(crate) fn assert_summed_from_two_values(from: TestTwoValues, to: TestValue) -> () {
    assert(from.value_1 + from.value_2 == to.value);
    assert(from.counter == to.counter);
}

pub(crate) fn combine_two_values(from: TestTwoValues) -> TestCombinedValue {
    TestCombinedValue { value: from.value_1 + from.value_2 }
}

pub(crate) fn assert_combined_from_two_values(from: TestTwoValues, to: TestCombinedValue) -> () {
    assert(from.value_1 + from.value_2 == to.value, "Bad sum");
}
