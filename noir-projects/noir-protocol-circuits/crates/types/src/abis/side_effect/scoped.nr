use crate::{
    abis::side_effect::{counted::Counted, Ordered},
    address::AztecAddress,
    tests::types::TestValue,
    traits::{Deserialize, Empty, Serialize, ToField},
    utils::reader::Reader,
};

pub struct Scoped<T> {
    pub inner: T,
    pub contract_address: AztecAddress,
}

impl<T> Scoped<T> {
    pub fn new(inner: T, contract_address: AztecAddress) -> Self {
        Self { inner, contract_address }
    }
}

impl<T> Eq for Scoped<T>
where
    T: Eq,
{
    fn eq(self, other: Self) -> bool {
        (self.inner == other.inner) & (self.contract_address == other.contract_address)
    }
}

impl<T> Empty for Scoped<T>
where
    T: Empty,
{
    fn empty() -> Self {
        Self { inner: T::empty(), contract_address: AztecAddress::empty() }
    }
}

impl<T> Serialize for Scoped<T>
where
    T: Serialize,
{
    let N: u32 = <T as Serialize>::N + 1;

    fn serialize(self) -> [Field; Self::N] {
        self.inner.serialize().concat([self.contract_address.to_field()])
    }
}

impl<T> Deserialize for Scoped<T>
where
    T: Deserialize,
{
    let N: u32 = <T as Deserialize>::N + 1;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let deserialized = Self {
            inner: reader.read_struct(T::deserialize),
            contract_address: reader.read_struct(AztecAddress::deserialize),
        };
        reader.finish();
        deserialized
    }
}

impl<T> Ordered for Scoped<Counted<T>> {
    fn counter(self) -> u32 {
        self.inner.counter()
    }
}

#[test]
fn serialization_of_empty_scoped() {
    let item: Scoped<TestValue> = Scoped::empty();
    let serialized = item.serialize();
    let deserialized: Scoped<TestValue> = Scoped::deserialize(serialized);
    assert(item.eq(deserialized));
}
