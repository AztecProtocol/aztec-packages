use dep::protocol_types::traits::{Deserialize, Empty, Packable, Serialize};

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

    fn serialize(self) -> [Field; Self::N] {
        [self.a, self.b]
    }
}

impl Deserialize for MockStruct {
    let N: u32 = 2;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Self { a: fields[0], b: fields[1] }
    }
}

impl Packable<2> for MockStruct {
    fn pack(self) -> [Field; 2] {
        [self.a, self.b]
    }

    fn unpack(fields: [Field; 2]) -> Self {
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
