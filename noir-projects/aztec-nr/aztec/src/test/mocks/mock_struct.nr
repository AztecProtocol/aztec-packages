//! Struct mocking utilities.

use crate::protocol::traits::{Deserialize, Empty, Packable, Serialize};
use protocol_types::base_utils::{reader::Reader, writer::Writer};

pub struct MockStruct {
    pub a: Field,
    pub b: Field,
}

impl MockStruct {
    pub(crate) fn new(a: Field, b: Field) -> Self {
        Self { a, b }
    }
}

impl Eq for MockStruct {
    fn eq(self, other: Self) -> bool {
        (self.a == other.a) & (self.b == other.b)
    }
}

impl Empty for MockStruct {
    fn empty() -> Self {
        Self { a: 0, b: 0 }
    }
}

impl Serialize for MockStruct {
    let N: u32 = 2;

    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self.a);
        writer.write(self.b);
    }
}

impl Deserialize for MockStruct {
    let N: u32 = 2;

    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        Self { a: reader.read(), b: reader.read() }
    }
}

impl Packable for MockStruct {
    let N: u32 = 2;

    fn pack(self) -> [Field; Self::N] {
        [self.a, self.b]
    }

    fn unpack(fields: [Field; Self::N]) -> Self {
        Self { a: fields[0], b: fields[1] }
    }
}

#[test]
unconstrained fn test_serde() {
    let val = MockStruct::new(5, 6);
    assert_eq(val, MockStruct::deserialize(val.serialize()));
}

#[test]
unconstrained fn test_packable() {
    let val = MockStruct::new(5, 6);
    assert_eq(val, MockStruct::unpack(val.pack()));
}
