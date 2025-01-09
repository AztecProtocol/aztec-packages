use crate::meta::{derive_deserialize, derive_serialize};
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

// docs:start:serialize
/// Trait for serializing Noir types into arrays of Fields in a constraint-efficient manner.
///
/// This trait prioritizes minimal constraint costs during serialization, even if it
/// results in larger array sizes. Each value is typically converted directly into one
/// or more Fields without any packing or compression. This trait (and Deserialize) are
/// typically used to communicate between Noir and TypeScript (via oracles and function
/// arguments).
///
/// # Type Parameters
/// * `N` - The length of the output Field array, known at compile time
///
/// # Implementation Notes
/// - Focus on simple, direct conversions to minimize constraints
/// - Each component of a type typically maps to its own Field
/// - Do not attempt to pack or compress values (use Packable trait for that)
///
/// # Example
/// ```
/// impl<let N: u32> Serialize<N> for str<N> {
///     fn serialize(self) -> [Field; N] {
///         let bytes = self.as_bytes();
///         let mut fields = [0; N];
///         for i in 0..bytes.len() {
///             fields[i] = bytes[i] as Field;  // Each byte gets its own Field
///         }
///         fields
///     }
/// }
/// ```
#[derive_via(derive_serialize)]
pub trait Serialize<let N: u32> {
    fn serialize(self) -> [Field; N];
}
// docs:end:serialize

impl<let N: u32> Serialize<N> for str<N> {
    fn serialize(self) -> [Field; N] {
        let bytes = self.as_bytes();
        let mut fields = [0; N];
        for i in 0..bytes.len() {
            fields[i] = bytes[i] as Field;
        }
        fields
    }
}

// docs:start:deserialize
/// Trait for deserializing Noir types from arrays of Fields in a constraint-efficient manner.
///
/// This trait prioritizes minimal constraint costs during deserialization, even if it
/// results in larger array sizes. Each Field is typically converted directly into one
/// or more values without any packing or compression. This trait (and Serialize) are
/// typically used to communicate between Noir and TypeScript (via oracles and function
/// arguments).
///
/// # Type Parameters
/// * `N` - The length of the input Field array, known at compile time
///
/// # Implementation Notes
/// - Focus on simple, direct conversions to minimize constraints
/// - Each Field typically maps to its own component of a type
/// - Do not attempt to unpack or decompress values (use Packable trait for that)
///
/// # Example
/// ```
/// impl<let N: u32> Deserialize<N> for str<N> {
///     fn deserialize(fields: [Field; N]) -> Self {
///         str<N>::from(fields.map(|value| value as u8))
///     }
/// }
/// ```
#[derive_via(derive_deserialize)]
pub trait Deserialize<let N: u32> {
    fn deserialize(fields: [Field; N]) -> Self;
}
// docs:end:deserialize

impl<let N: u32> Deserialize<N> for str<N> {
    fn deserialize(fields: [Field; N]) -> Self {
        str<N>::from(fields.map(|value| value as u8))
    }
}

/// Trait for efficiently packing and unpacking Noir types into and from arrays of Fields.
///
/// The `Packable` trait allows types to be serialized and deserialized with a focus on
/// minimizing the size of the resulting Field array, even at the cost of additional
/// constraints. This is in contrast to the `Serialize` and `Deserialize` traits, which
/// prioritize minimizing constraint costs but may result in larger arrays.
///
/// Packing and unpacking often involve compression or aggregation of values, enabling
/// more compact representations of complex types.
///
/// # Type Parameters
/// * `N` - The length of the Field array, known at compile time.
///
/// # Implementation Notes
/// - Use efficient algorithms to reduce the size of the Field array during packing.
/// - Ensure data integrity and correctness during both packing and unpacking.
/// - This trait is useful for cases where storage efficiency is critical.
pub trait Packable<let N: u32> {
    /// Packs the current value into a compact array of `Field` elements.
    fn pack(self) -> [Field; N];

    /// Unpacks a compact array of `Field` elements into the original value.
    fn unpack(fields: [Field; N]) -> Self;
}
