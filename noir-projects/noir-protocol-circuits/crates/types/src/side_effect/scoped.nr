use crate::{
    address::AztecAddress,
    side_effect::{counted::Counted, Ordered},
    tests::types::TestValue,
    traits::{Deserialize, Empty, Serialize},
};

#[derive(Deserialize, Serialize)]
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

impl<T> Ordered for Scoped<Counted<T>> {
    fn counter(self) -> u32 {
        self.inner.counter
    }
}

impl<T> Scoped<Counted<T>> {
    pub fn innermost(self) -> T {
        self.inner.inner
    }
}

impl Scoped<Counted<Field>> {
    pub fn expose_to_public(self) -> Field {
        self.innermost()
    }
}

#[test]
fn serialization_of_empty_scoped() {
    let item: Scoped<TestValue> = Scoped::empty();
    let serialized = item.serialize();
    let deserialized: Scoped<TestValue> = Scoped::deserialize(serialized);
    assert(item.eq(deserialized));
}
