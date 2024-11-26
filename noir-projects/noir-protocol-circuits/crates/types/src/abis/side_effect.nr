use crate::{
    address::AztecAddress,
    traits::{Deserialize, Empty, Serialize},
    utils::{arrays::array_concat, reader::Reader},
};

pub trait Ordered {
    fn counter(self) -> u32;
}

pub trait RangeOrdered {
    fn counter_start(self) -> u32;
    fn counter_end(self) -> u32;
}

pub trait OrderedValue<T>
where
    T: Eq,
{
    fn value(self) -> T;
    fn counter(self) -> u32;
}

pub trait Scoped<T>
where
    T: Eq,
{
    fn contract_address(self) -> AztecAddress;
    fn inner(self) -> T;
}

pub trait Readable<T> {
    fn assert_match_read_request(self, read_request: T);
}

pub trait Inner<T> {
    fn inner(self) -> T;
}

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
    T: Empty,
{
    fn empty() -> Self {
        Self { inner: T::empty(), counter: 0 }
    }
}

impl<T, let N: u32> Serialize<N> for Counted<T>
where
    T: Serialize<N - 1>,
{
    fn serialize(self) -> [Field; N] {
        array_concat(self.inner.serialize(), [self.counter as Field])
    }
}

impl<T, let N: u32> Deserialize<N> for Counted<T>
where
    T: Deserialize<N - 1>,
{
    fn deserialize(fields: [Field; N]) -> Self {
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
