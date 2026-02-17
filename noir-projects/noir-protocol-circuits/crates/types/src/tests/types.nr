pub(crate) mod test_leaf_preimage;

pub use test_leaf_preimage::TestLeafPreimage;

use crate::{side_effect::Ordered, traits::{Deserialize, Empty, Serialize}};

#[derive(Deserialize, Eq, Serialize)]
pub struct TestValue {
    pub value: Field,
    pub counter: u32,
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
