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
    #[inline_always]
    fn empty() -> Self {
        0
    }
}

impl Empty for u1 {
    #[inline_always]
    fn empty() -> Self {
        0
    }
}
impl Empty for u8 {
    #[inline_always]
    fn empty() -> Self {
        0
    }
}
impl Empty for u32 {
    #[inline_always]
    fn empty() -> Self {
        0
    }
}
impl Empty for u64 {
    #[inline_always]
    fn empty() -> Self {
        0
    }
}
impl Empty for u128 {
    #[inline_always]
    fn empty() -> Self {
        0
    }
}

impl<T, let N: u32> Empty for [T; N]
where
    T: Empty,
{
    #[inline_always]
    fn empty() -> Self {
        [T::empty(); N]
    }
}

impl<T> Empty for Option<T> {
    #[inline_always]
    fn empty() -> Self {
        Option::none()
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
    #[inline_always]
    fn to_field(self) -> Field {
        self
    }
}

impl ToField for bool {
    #[inline_always]
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for u1 {
    #[inline_always]
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for u8 {
    #[inline_always]
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for u32 {
    #[inline_always]
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for u64 {
    #[inline_always]
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for u128 {
    #[inline_always]
    fn to_field(self) -> Field {
        self as Field
    }
}
impl<let N: u32> ToField for str<N> {
    #[inline_always]
    fn to_field(self) -> Field {
        assert(N < 32, "String doesn't fit in a field, consider using Serialize instead");
        field_from_bytes(self.as_bytes(), true)
    }
}

pub trait FromField {
    fn from_field(value: Field) -> Self;
}

impl FromField for Field {
    #[inline_always]
    fn from_field(value: Field) -> Self {
        value
    }
}

impl FromField for bool {
    #[inline_always]
    fn from_field(value: Field) -> Self {
        value as bool
    }
}
impl FromField for u1 {
    #[inline_always]
    fn from_field(value: Field) -> Self {
        value as u1
    }
}
impl FromField for u8 {
    #[inline_always]
    fn from_field(value: Field) -> Self {
        value as u8
    }
}
impl FromField for u32 {
    #[inline_always]
    fn from_field(value: Field) -> Self {
        value as u32
    }
}
impl FromField for u64 {
    #[inline_always]
    fn from_field(value: Field) -> Self {
        value as u64
    }
}
impl FromField for u128 {
    #[inline_always]
    fn from_field(value: Field) -> Self {
        value as u128
    }
}

// docs:start:serialize
/// Trait for serializing Noir types into arrays of Fields.
///
/// An implementation of the Serialize trait has to follow Noir's intrinsic serialization (each member of a struct
/// converted directly into one or more Fields without any packing or compression). This trait (and Deserialize) are
/// typically used to communicate between Noir and TypeScript (via oracles and function arguments).
///
/// # On Following Noir's Intrinsic Serialization
/// When calling a Noir function from TypeScript (TS), first the function arguments are serialized into an array
/// of fields. This array is then included in the initial witness. Noir's intrinsic serialization is then used
/// to deserialize the arguments from the witness. When the same Noir function is called from Noir this Serialize trait
/// is used instead of the serialization in TS. For this reason we need to have a match between TS serialization,
/// Noir's intrinsic serialization and the implementation of this trait. If there is a mismatch, the function calls
/// fail with an arguments hash mismatch error message.
///
/// # Type Parameters
/// * `N` - The length of the output Field array, known at compile time
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
pub trait Serialize {
    let N: u32;

    fn serialize(self) -> [Field; N];
}
// docs:end:serialize

impl<let M: u32> Serialize for str<M> {
    let N = M;

    #[inline_always]
    fn serialize(self) -> [Field; Self::N] {
        let bytes = self.as_bytes();
        let mut fields = [0; N];
        for i in 0..bytes.len() {
            fields[i] = bytes[i] as Field;
        }
        fields
    }
}

// T = type of item in BoundedVec
// M = max length of BoundedVec
// O = field length of T
// O * M + 1 = total serialized length of BoundedVec<T, M> (the +1 is for length of the BoundedVec)
impl<T, let M: u32, let O: u32> Deserialize<O * M + 1> for BoundedVec<T, M>
where
    T: Deserialize<O>,
{
    #[inline_always]
    fn deserialize(fields: [Field; O * M + 1]) -> Self {
        let mut new_bounded_vec: BoundedVec<T, M> = BoundedVec::new();

        let len = fields[0] as u32;
        let mut index = 1;

        for _ in 0..len {
            let mut nested_fields = [0; O];
            for j in 0..O {
                nested_fields[j] = fields[index];
                index += 1;
            }

            let item = T::deserialize(nested_fields);
            new_bounded_vec.push(item);
        }

        new_bounded_vec
    }
}

impl<T, let M: u32, let O: u32> Serialize for BoundedVec<T, M>
where
    T: Serialize,
{
    let N = O * M + 1; // +1 for the length of the BoundedVec

    #[inline_always]
    fn serialize(self) -> [Field; Self::N] {
        let mut fields = [0; Self::N];

        let len = self.len();
        fields[0] = len as Field;

        let mut index: u32 = 1;

        for i in 0..len {
            let item = self.get_unchecked(i);
            let serialized_item = item.serialize();

            for j in 0..O {
                fields[index] = serialized_item[j];
                index += 1;
            }
        }

        fields
    }
}

// docs:start:deserialize
/// Trait for deserializing Noir types from arrays of Fields.
///
/// An implementation of the Deserialize trait has to follow Noir's intrinsic serialization (each member of a struct
/// converted directly into one or more Fields without any packing or compression). This trait is typically used when
/// deserializing return values from function calls in Noir. Since the same function could be called from TypeScript
/// (TS), in which case the TS deserialization would get used, we need to have a match between the 2.
///
/// # Type Parameters
/// * `N` - The length of the input Field array, known at compile time
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
pub trait Deserialize {
    let N: u32;

    fn deserialize(fields: [Field; N]) -> Self;
}
// docs:end:deserialize

impl<let M: u32> Deserialize for str<M> {
    let N = M;

    #[inline_always]
    fn deserialize(fields: [Field; Self::N]) -> Self {
        str::<Self::N>::from(fields.map(|value| value as u8))
    }
}

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
