use crate::meta::derive_packable;

/// Space-efficient packing and unpacking in `Field` arrays.
///
/// The `Packable` trait allows types to be serialized and deserialized with a focus on minimizing the size of
/// the resulting Field array. This trait is used when storage efficiency is critical (e.g. when storing data
/// in the contract's public storage).
///
/// # Associated Constants
/// * `N` - The length of the Field array, known at compile time
#[derive_via(derive_packable)]
pub trait Packable {
    let N: u32;

    /// Packs the current value into a compact array of `Field` elements.
    fn pack(self) -> [Field; N];

    /// Unpacks a compact array of `Field` elements into the original value.
    fn unpack(fields: [Field; N]) -> Self;
}
