use crate::traits::{Deserialize, Empty, Serialize};

pub struct Log<let N: u32> {
    pub fields: [Field; N],
}

impl<let N: u32> Log<N> {
    pub fn new(fields: [Field; N]) -> Self {
        Self { fields }
    }
}

impl<let N: u32> Eq for Log<N> {
    fn eq(self, other: Log<N>) -> bool {
        (self.fields == other.fields)
    }
}

impl<let N: u32> Empty for Log<N> {
    fn empty() -> Log<N> {
        Log { fields: [0; N] }
    }
}

impl<let N: u32> Serialize<N> for Log<N> {
    fn serialize(self) -> [Field; N] {
        self.fields
    }
}

impl<let N: u32> Deserialize<N> for Log<N> {
    fn deserialize(fields: [Field; N]) -> Log<N> {
        Log { fields }
    }
}

#[test]
fn serialization_of_empty_log() {
    let item: Log<5> = Log::empty();
    let serialized = item.serialize();
    let deserialized = Log::deserialize(serialized);
    assert(item.eq(deserialized));
}
