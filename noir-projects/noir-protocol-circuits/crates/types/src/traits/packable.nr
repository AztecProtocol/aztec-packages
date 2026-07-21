use crate::meta::derive_packable;

/// Space-efficient value packing and unpacking.
///
/// Like [`Serialize`](crate::traits::Serialize) and [`Deserialize`](crate::traits::Deserialize), this trait is used to
/// convert to a from `Field` array representations. `Packable` is used instead of those whenever _the length_ of the
/// resulting array needs to be minimized, for example in order to reduce the number of amount storage access
/// operations, or the number of values that will be hashed together.
///
/// The associated constant `N` is the length of the `Field` array.
///
/// ## Automatic Derivation
///
/// The `#[derive]` macro can be used on any type that holds primitive values, or types that themselves also derive
/// `Packable`. The resulting implementation does not attempt to tightly-pack values at all, and instead simply assigns
/// a full `Field` to each value. This makes it suitable for types that are composed solely of `Field`-sized elements.
///
/// ```noir
/// #[derive(Packable)]
/// struct FieldGrouping {
///     a: Field,
///     b: Field,
///     c: Field,
/// }
///
/// #[derive(Packable)]
/// struct NestedStructs {
///     fg: FieldGrouping,
///     x: Field,
/// }
///
/// // Inefficient: there are gains to be had by manually implementing the trait instead of using `derive`
/// #[derive(Packable)]
/// struct SubFieldGrouping {
///     a: bool,
///     b: u32,
///     c: u64,
/// }
/// ```
///
/// ## Manual Implementation
///
/// If a type holds at least two elements smaller than a `Field`, then manually implementing `Packable` can result in
/// reduced costs (assuming the sub-`Field` elements are small enough to be packed together).
///
/// The nature of cost reduction will depend on what the value is used for. For public storage, it will typically
/// decrease both L2 gas (in the form of fewer `SLOAD` and `SSTORE` opcodes) and DA costs (due to there being fewer
/// slots accessed). For notes, it will typically decrease proving times (due to fewer hash operations).
///
/// Note that packing and unpacking must also be runtime efficient for the previously mentioned gains to not be offset
/// by this overhead. Bit-packing by multiplying and dividing by powers of 2 is often a good strategy, as this maps well
/// to both AVM opcodes (for public contract functions) and proving backend primitives (for private contract functions).
///
/// ```noir
/// struct TwoBooleans {
///     a: bool,
///     b: bool,
/// }
///
/// impl Packable for TwoBooleans {
///     let N: u32 = 1;
///
///     fn pack(self) -> [Field; Self::N] {
///         // a in bit 1, b in bit 0
///         [(self.a as Field) * 2.pow_32(1) + (self.b as Field)]
///     }
///
///     fn unpack(packed: [Field; Self::N]) -> Self {
///         let b = (packed[0] as u8) % 2 != 0;
///         let a = ((packed[0] - b as Field) / 2.pow_32(1)) != 0;
///
///         Self { a, b }
///     }
/// }
/// ```
#[derive_via(derive_packable)]
pub trait Packable {
    let N: u32;

    /// Packs the value into a compact `Field` array.
    ///
    /// The original value can be reconstructed by calling [`Packable::unpack`].
    fn pack(self) -> [Field; N];

    /// Unpacks the value from a compact `Field` array.
    ///
    /// `packed` must be the value returned by [`Packable::pack`].
    fn unpack(packed: [Field; N]) -> Self;
}

mod test {
    use super::Packable;

    #[derive(Eq)]
    struct TwoBooleans {
        a: bool,
        b: bool,
    }

    impl Packable for TwoBooleans {
        let N: u32 = 1;

        fn pack(self) -> [Field; Self::N] {
            [(self.a as Field) * 2.pow_32(1) + (self.b as Field)]
        }

        fn unpack(packed: [Field; Self::N]) -> Self {
            let bits: [bool; 2] = packed[0].to_le_bits();
            let b = bits[0];
            let a = bits[1];

            Self { a, b }
        }
    }

    #[test]
    fn pack_unpack_docs_example() {
        let x = TwoBooleans { a: false, b: false };
        assert_eq(TwoBooleans::unpack(x.pack()), x);

        let x = TwoBooleans { a: false, b: true };
        assert_eq(TwoBooleans::unpack(x.pack()), x);

        let x = TwoBooleans { a: true, b: false };
        assert_eq(TwoBooleans::unpack(x.pack()), x);

        let x = TwoBooleans { a: true, b: true };
        assert_eq(TwoBooleans::unpack(x.pack()), x);
    }
}
