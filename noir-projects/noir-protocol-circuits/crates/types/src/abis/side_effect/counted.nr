use crate::{
    abis::side_effect::{Ordered, scoped::Scoped},
    address::AztecAddress,
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};

pub struct Counted<T> {
    pub inner: T,
    pub counter: u32,
}

impl<T> Counted<T> {
    pub fn new(inner: T, counter: u32) -> Self {
        Self { inner, counter }
    }
}

impl<T> Eq for Counted<T>
where
    T: Eq,
{
    fn eq(self, other: Self) -> bool {
        (self.inner == other.inner) & (self.counter == other.counter)
    }
}

impl<T> Empty for Counted<T>
where
    T: Empty + Eq,
{
    fn empty() -> Self {
        Self { inner: T::empty(), counter: 0 }
    }
}

impl<T> Serialize for Counted<T>
where
    T: Serialize,
{
    let N: u32 = <T as Serialize>::N + 1;

    fn serialize(self) -> [Field; Self::N] {
        self.inner.serialize().concat([self.counter as Field])
    }
}

impl<T> Deserialize for Counted<T>
where
    T: Deserialize,
{
    let N: u32 = <T as Deserialize>::N + 1;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let deserialized =
            Self { inner: reader.read_struct(T::deserialize), counter: reader.read_u32() };
        reader.finish();
        deserialized
    }
}

impl<T> Ordered for Counted<T> {
    fn counter(self) -> u32 {
        self.counter
    }
}

impl<T> Counted<T> {
    pub fn scope(self, contract_address: AztecAddress) -> Scoped<Counted<T>> {
        Scoped::new(self, contract_address)
    }
}

#[test]
fn serialization_of_empty_counted_field() {
    let item: Counted<Field> = Counted::empty();
    let serialized = item.serialize();
    let deserialized = Counted::deserialize(serialized);
    assert(item.eq(deserialized));
}

#[test]
fn serialization_of_non_empty_counted_field() {
    let item: Counted<Field> = Counted::new(12, 3);
    let serialized = item.serialize();
    let deserialized = Counted::deserialize(serialized);
    assert(item.eq(deserialized));
}
