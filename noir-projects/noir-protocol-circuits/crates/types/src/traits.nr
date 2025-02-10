use crate::meta::{derive_deserialize, derive_packable, derive_serialize};
use crate::utils::field::field_from_bytes;

// Trait: is_empty
//
// The general is_empty trait checks if a data type is is empty,
// and it defines empty for the basic data types as 0.
//
// If a Field is equal to zero, then it is regarded as zero.
// We will go with this definition for now, however it can be problematic
// if a value can actually be zero. In a future refactor, we can
// use the optional type for safety. Doing it now would lead to a worse devex
// and would make it harder to sync up with the cpp code.
// Preferred over Default trait to convey intent, as default doesn't necessarily mean empty.
pub trait Empty {
    fn empty() -> Self;
}

impl Empty for Field {
    fn empty() -> Self {
        0
    }
}

impl Empty for u1 {
    fn empty() -> Self {
        0
    }
}
impl Empty for u8 {
    fn empty() -> Self {
        0
    }
}
impl Empty for u32 {
    fn empty() -> Self {
        0
    }
}
impl Empty for u64 {
    fn empty() -> Self {
        0
    }
}
impl Empty for U128 {
    fn empty() -> Self {
        U128::from_integer(0)
    }
}

pub fn is_empty<T>(item: T) -> bool
where
    T: Empty + Eq,
{
    item.eq(T::empty())
}

pub fn is_empty_array<T, let N: u32>(array: [T; N]) -> bool
where
    T: Empty + Eq,
{
    array.all(|elem| is_empty(elem))
}

pub trait Hash {
    fn hash(self) -> Field;
}

pub trait ToField {
    fn to_field(self) -> Field;
}

impl ToField for Field {
    fn to_field(self) -> Field {
        self
    }
}

impl ToField for bool {
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for u1 {
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for u8 {
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for u32 {
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for u64 {
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for U128 {
    fn to_field(self) -> Field {
        self.to_integer()
    }
}
impl<let N: u32> ToField for str<N> {
    fn to_field(self) -> Field {
        assert(N < 32, "String doesn't fit in a field, consider using Serialize instead");
        field_from_bytes(self.as_bytes(), true)
    }
}

pub trait FromField {
    fn from_field(value: Field) -> Self;
}

impl FromField for Field {
    fn from_field(value: Field) -> Self {
        value
    }
}

impl FromField for bool {
    fn from_field(value: Field) -> Self {
        value as bool
    }
}
impl FromField for u1 {
    fn from_field(value: Field) -> Self {
        value as u1
    }
}
impl FromField for u8 {
    fn from_field(value: Field) -> Self {
        value as u8
    }
}
impl FromField for u32 {
    fn from_field(value: Field) -> Self {
        value as u32
    }
}
impl FromField for u64 {
    fn from_field(value: Field) -> Self {
        value as u64
    }
}
impl FromField for U128 {
    fn from_field(value: Field) -> Self {
        U128::from_integer(value)
    }
}

pub struct Reader<let N: u32> {
    data: [Field; N],
    index: u32,
}

impl<let N: u32> Reader<N> {
    fn new(data: [Field; N]) -> Self {
        Self { data, index: 0 }
    }

    fn read(&mut self) -> Field {
        let result = self.data[self.index];
        self.index += 1;
        result
    }

    fn finish(self) {
        assert_eq(self.index, N);
    }
}

pub struct Writer<let N: u32> {
    data: [Field; N],
    index: u32,
}

impl<let N: u32> Writer<N> {
    fn new() -> Self {
        Self { data: [0; N], index: 0 }
    }

    fn write(&mut self, val: Field) {
        self.data[self.index] = val;
        self.index += 1;
    }

    fn finish(self) -> [Field; N] {
        assert_eq(self.index, N);
        self.data
    }
}

#[derive_via(derive_serialize)]
pub trait Serialize<let SERIALIZED_LEN: u32> {
    fn write<let N: u32>(self, writer: &mut Writer<N>);
}

#[derive_via(derive_deserialize)]
pub trait Deserialize<let SERIALIZED_LEN: u32> {
    fn read<let N: u32>(reader: &mut Reader<N>) -> Self;
}

pub fn serialize<let N: u32, T>(val: T) -> [Field; N]
where
    T: Serialize<N>,
{
    let mut writer = Writer::new();
    val.write(&mut writer);
    writer.finish()
}

pub fn deserialize<let N: u32, T>(data: [Field; N]) -> T
where
    T: Deserialize<N>,
{
    let mut reader = Reader::new(data);
    let val = T::read(&mut reader);
    reader.finish();
    val
}

impl<T, let K: u32> Deserialize<K + 1> for Option<T>
where
    T: Deserialize<K>,
{
    fn read<let N: u32>(reader: &mut Reader<N>) -> Self {
        let is_some = reader.read() == 1;
        let val = T::read(reader);
        if is_some {
            Self::some(val)
        } else {
            Self::none()
        }
    }
}

impl<T, let ITEM_COUNT: u32, let ITEM_LEN: u32> Serialize<ITEM_COUNT * ITEM_LEN> for [T; ITEM_COUNT]
where
    T: Serialize<ITEM_LEN>,
{
    fn write<let N: u32>(self, writer: &mut Writer<N>) {
        for i in 0..ITEM_COUNT {
            self[i].write(writer);
        }
    }
}

impl<T, let ITEM_COUNT: u32, let ITEM_LEN: u32> Deserialize<ITEM_COUNT * ITEM_LEN> for [T; ITEM_COUNT]
where
    T: Deserialize<ITEM_LEN>,
{
    fn read<let N: u32>(reader: &mut Reader<N>) -> Self {
        let mut result = [std::mem::zeroed(); ITEM_COUNT];
        for i in 0..ITEM_COUNT {
            result[i] = T::read(reader);
        }
        result
    }
}

// #[derive(Serialize, Deserialize, Eq)]
// struct Bar {
//     b: [Field; 1],
//     d: u32,
// }

// #[derive(Serialize, Deserialize, Eq)]
// struct Foo {
//     c: Option<Bar>,
//     d: u32,
// }

// #[test]
// fn test_serialize_deserialize_foo() {
//     let foo = Foo { c: Option::some(Bar { b: [1], d: 2 }), d: 3 };
//     let serialized = serialize(foo);
//     let deserialized = deserialize(serialized);
//     assert_eq(foo, deserialized);
// }

/// Trait for efficiently packing and unpacking Noir types into and from arrays of Fields.
///
/// The `Packable` trait allows types to be serialized and deserialized with a focus on minimizing the size of
/// the resulting Field array. This trait is used when storage efficiency is critical (e.g. when storing data
/// in the contract's public storage).
///
/// # Type Parameters
/// * `N` - The length of the Field array, known at compile time.
#[derive_via(derive_packable)]
pub trait Packable<let N: u32> {
    /// Packs the current value into a compact array of `Field` elements.
    fn pack(self) -> [Field; N];

    /// Unpacks a compact array of `Field` elements into the original value.
    fn unpack(fields: [Field; N]) -> Self;
}
