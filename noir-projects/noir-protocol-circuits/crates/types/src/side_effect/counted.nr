use crate::{
    address::AztecAddress,
    side_effect::{Ordered, scoped::Scoped},
    traits::{Deserialize, Empty, Serialize},
};

#[derive(Deserialize, Serialize)]
pub struct Counted<T> {
    pub inner: T,
    pub counter: u32,
}

impl<T> Counted<T> {
    pub fn new(inner: T, counter: u32) -> Self {
        Self { inner, counter }
    }

    pub fn is_non_revertible(self, is_private_only: bool, claimed_revertible_counter: u32) -> bool {
        // If a tx is private-only, everything is non-revertible.
        // Otherwise, it's only non-revertible if the counter is less than the claimed revertible counter.
        is_private_only | (self.counter < claimed_revertible_counter)
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
    T: Empty,
{
    fn empty() -> Self {
        Self { inner: T::empty(), counter: 0 }
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
