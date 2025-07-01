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
pub trait Empty: Eq {
    fn empty() -> Self;

    fn is_empty(self) -> bool {
        self.eq(Self::empty())
    }

    // Requires this Noir fix: https://github.com/noir-lang/noir/issues/9002
    // fn assert_not_empty<let U: u32>(self, msg: str<U>) { // This msg version was failing with weird compiler errors.
    //     // We provide a default impl but it's likely inefficient.
    //     // The reason we include this function is because there's a lot of
    //     // opportunity for optimisation on a per-struct basis.
    //     // You only need to show one element is not empty to know that the whole thing
    //     // is not empty.
    //     // If you know an element of your struct which should always be nonempty,
    //     // you can write an impl that solely checks that that element is nonempty.
    //     assert(!self.is_empty(), msg);
    // }

    // This default impl is overwritten by types like arrays, because there's a much
    // more efficient approach.
    fn assert_empty<let S: u32>(self, msg: str<S>) {
        assert(self.is_empty(), msg);
    }
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
    T: Empty + Eq,
{
    #[inline_always]
    fn empty() -> Self {
        [T::empty(); N]
    }

    fn is_empty(self) -> bool {
        self.all(|elem| elem.is_empty())
    }

    fn assert_empty<let S: u32>(self, msg: str<S>) -> () {
        self.for_each(|elem| elem.assert_empty(msg))
    }
}

impl<T> Empty for [T]
where
    T: Empty + Eq,
{
    #[inline_always]
    fn empty() -> Self {
        [T::empty()]
    }

    fn is_empty(self) -> bool {
        self.all(|elem| elem.is_empty())
    }

    fn assert_empty<let S: u32>(self, msg: str<S>) -> () {
        self.for_each(|elem| elem.assert_empty(msg))
    }
}
impl<A, B> Empty for (A, B)
where
    A: Empty + Eq,
    B: Empty + Eq,
{
    #[inline_always]
    fn empty() -> Self {
        (A::empty(), B::empty())
    }
}

impl<T> Empty for Option<T>
where
    T: Eq,
{
    #[inline_always]
    fn empty() -> Self {
        Option::none()
    }
}

// pub fn is_empty<T>(item: T) -> bool
// where
//     T: Empty + Eq,
// {
//     item.eq(T::empty())
// }

// pub fn is_empty_array<T, let N: u32>(array: [T; N]) -> bool
// where
//     T: Empty + Eq,
// {
//     array.all(|elem| is_empty(elem))
// }

// pub fn assert_empty<T>(item: T) -> ()
// where
//     T: Empty + Eq,
// {
//     assert(item.eq(T::empty()))
// }

// pub fn assert_empty_array<T, let N: u32>(array: [T; N]) -> ()
// where
//     T: Empty + Eq,
// {
//     // A cheaper option than `is_empty_array` for if you don't need to gracefully
//     // handle a bool result.
//     // Avoids the `&` operator of `is_empty_array`'s `.all()` call.
//     for i in 0..N {
//         assert(is_empty(array[i]));
//     }
// }

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
        value != 0
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
pub trait Serialize<let N: u32> {
    fn serialize(self) -> [Field; N];
}
// docs:end:serialize

impl<let N: u32> Serialize<N> for str<N> {
    #[inline_always]
    fn serialize(self) -> [Field; N] {
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

        // Length is stored in the last field as we need to match intrinsic Noir serialization and the `len` struct
        // field is after `storage` struct field (see `bounded_vec.nr` in noir-stdlib)
        let len = fields[O * M] as u32;

        for i in 0..len {
            let mut nested_fields = [0; O];
            for j in 0..O {
                nested_fields[j] = fields[i * O + j];
            }

            let item = T::deserialize(nested_fields);
            new_bounded_vec.push(item);
        }

        new_bounded_vec
    }
}

// This may cause issues if used as program input, because noir disallows empty arrays for program input.
// I think this is okay because I don't foresee a unit type being used as input. But leaving this comment as a hint
// if someone does run into this in the future.
impl<let N: u32> Deserialize<0> for () {
    fn deserialize(_fields: [Field; 0]) -> Self {
        ()
    }
}

impl<T, let M: u32, let O: u32> Serialize<O * M + 1> for BoundedVec<T, M>
where
    T: Serialize<O>,
{
    #[inline_always]
    fn serialize(self) -> [Field; O * M + 1] {
        let mut fields = [0; O * M + 1];

        let storage = self.storage();

        for i in 0..M {
            let serialized_item = storage[i].serialize();

            for j in 0..O {
                fields[i * O + j] = serialized_item[j];
            }
        }

        // Length is stored in the last field as we need to match intrinsic Noir serialization and the `len` struct
        // field is after `storage` struct field (see `bounded_vec.nr` in noir-stdlib)
        fields[O * M] = self.len() as Field;

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
pub trait Deserialize<let N: u32> {
    fn deserialize(fields: [Field; N]) -> Self;
}
// docs:end:deserialize

impl<let N: u32> Deserialize<N> for str<N> {
    #[inline_always]
    fn deserialize(fields: [Field; N]) -> Self {
        str::<N>::from(fields.map(|value| value as u8))
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

#[test]
unconstrained fn bounded_vec_serialization() {
    // Test empty BoundedVec
    let empty_vec: BoundedVec<Field, 3> = BoundedVec::from_array([]);
    let serialized = empty_vec.serialize();
    let deserialized = BoundedVec::<Field, 3>::deserialize(serialized);
    assert_eq(empty_vec, deserialized);
    assert_eq(deserialized.len(), 0);

    // Test partially filled BoundedVec
    let partial_vec: BoundedVec<[u32; 2], 3> = BoundedVec::from_array([[1, 2]]);
    let serialized = partial_vec.serialize();
    let deserialized = BoundedVec::<[u32; 2], 3>::deserialize(serialized);
    assert_eq(partial_vec, deserialized);
    assert_eq(deserialized.len(), 1);
    assert_eq(deserialized.get(0), [1, 2]);

    // Test full BoundedVec
    let full_vec: BoundedVec<[u32; 2], 3> = BoundedVec::from_array([[1, 2], [3, 4], [5, 6]]);
    let serialized = full_vec.serialize();
    let deserialized = BoundedVec::<[u32; 2], 3>::deserialize(serialized);
    assert_eq(full_vec, deserialized);
    assert_eq(deserialized.len(), 3);
    assert_eq(deserialized.get(0), [1, 2]);
    assert_eq(deserialized.get(1), [3, 4]);
    assert_eq(deserialized.get(2), [5, 6]);
}
