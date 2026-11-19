use crate::{traits::{Deserialize, Packable, Serialize}, utils::{reader::Reader, writer::Writer}};
use serde::type_impls::make_slice;

global BOOL_PACKED_LEN: u32 = 1;
global U8_PACKED_LEN: u32 = 1;
global U16_PACKED_LEN: u32 = 1;
global U32_PACKED_LEN: u32 = 1;
global U64_PACKED_LEN: u32 = 1;
global U128_PACKED_LEN: u32 = 1;
global FIELD_PACKED_LEN: u32 = 1;
global I8_PACKED_LEN: u32 = 1;
global I16_PACKED_LEN: u32 = 1;
global I32_PACKED_LEN: u32 = 1;
global I64_PACKED_LEN: u32 = 1;
global POINT_PACKED_LEN: u32 = 2;

impl Packable for bool {
    let N: u32 = BOOL_PACKED_LEN;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        [self as Field]
    }

    /// Unpacks a `bool`. Any non-zero field unpacks to `true`.
    #[inline_always]
    fn unpack(fields: [Field; Self::N]) -> bool {
        fields[0] != 0
    }
}

impl Packable for u8 {
    let N: u32 = U8_PACKED_LEN;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        [self as Field]
    }

    #[inline_always]
    fn unpack(fields: [Field; Self::N]) -> Self {
        fields[0] as u8
    }
}

impl Packable for u16 {
    let N: u32 = U16_PACKED_LEN;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        [self as Field]
    }

    #[inline_always]
    fn unpack(fields: [Field; Self::N]) -> Self {
        fields[0] as u16
    }
}

impl Packable for u32 {
    let N: u32 = U32_PACKED_LEN;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        [self as Field]
    }

    #[inline_always]
    fn unpack(fields: [Field; Self::N]) -> Self {
        fields[0] as u32
    }
}

impl Packable for u64 {
    let N: u32 = U64_PACKED_LEN;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        [self as Field]
    }

    #[inline_always]
    fn unpack(fields: [Field; Self::N]) -> Self {
        fields[0] as u64
    }
}

impl Packable for u128 {
    let N: u32 = U128_PACKED_LEN;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        [self as Field]
    }

    #[inline_always]
    fn unpack(fields: [Field; Self::N]) -> Self {
        fields[0] as u128
    }
}

impl Packable for Field {
    let N: u32 = FIELD_PACKED_LEN;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        [self]
    }

    #[inline_always]
    fn unpack(fields: [Field; Self::N]) -> Self {
        fields[0]
    }
}

impl Packable for i8 {
    let N: u32 = I8_PACKED_LEN;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        [self as u8 as Field]
    }

    #[inline_always]
    fn unpack(fields: [Field; Self::N]) -> Self {
        fields[0] as u8 as i8
    }
}

impl Packable for i16 {
    let N: u32 = I16_PACKED_LEN;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        [self as u16 as Field]
    }

    #[inline_always]
    fn unpack(fields: [Field; Self::N]) -> Self {
        fields[0] as u16 as i16
    }
}

impl Packable for i32 {
    let N: u32 = I32_PACKED_LEN;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        [self as u32 as Field]
    }

    #[inline_always]
    fn unpack(fields: [Field; Self::N]) -> Self {
        fields[0] as u32 as i32
    }
}

impl Packable for i64 {
    let N: u32 = I64_PACKED_LEN;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        [self as u64 as Field]
    }

    #[inline_always]
    fn unpack(fields: [Field; Self::N]) -> Self {
        fields[0] as u64 as i64
    }
}

impl Packable for super::point::EmbeddedCurvePoint {
    let N: u32 = POINT_PACKED_LEN;
    fn pack(self) -> [Field; Self::N] {
        self.serialize()
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        Self::deserialize(packed)
    }
}

impl<T, let M: u32> Packable for [T; M]
where
    T: Packable,
{
    let N: u32 = M * <T as Packable>::N;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        let mut result: [Field; Self::N] = std::mem::zeroed();
        for i in 0..M {
            let serialized = self[i].pack();
            for j in 0..<T as Packable>::N {
                result[i * <T as Packable>::N + j] = serialized[j];
            }
        }
        result
    }

    #[inline_always]
    fn unpack(fields: [Field; Self::N]) -> Self {
        let mut reader = crate::utils::reader::Reader::new(fields);
        let result: [T; M] = std::mem::zeroed();
        reader.read_struct_array::<T, <T as Packable>::N, M>(Packable::unpack, result)
    }
}

impl<T> Packable for Option<T>
where
    T: Packable,
{
    let N: u32 = <T as Packable>::N + 1;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        writer.write_struct(self.is_some(), bool::pack);
        // A `None` packs to all zeros rather than to the packing of a zeroed `T`, which need not be zero, so that it
        // packs to the same fields as storage that was never written.
        let packed_value = self.map_or([0; <T as Packable>::N], |value| value.pack());
        writer.write_array(packed_value);
        writer.finish()
    }

    #[inline_always]
    fn unpack(packed: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(packed);
        let result = if reader.read_struct(bool::unpack) {
            Option::some(reader.read_struct(<T as Packable>::unpack))
        } else {
            reader.advance_offset(<T as Packable>::N);
            Option::none()
        };
        reader.finish();
        result
    }
}

impl<T, let M: u32> Packable for BoundedVec<T, M>
where
    T: Packable,
{
    // The length goes last, as in the `Serialize` implementation.
    let N: u32 = <T as Packable>::N * M + 1;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        for i in 0..M {
            // Slots past `len` are not guaranteed to be zero and can hold removed elements, which must not leak into
            // the packing.
            let packed_element = if i < self.len() {
                self.get_unchecked(i).pack()
            } else {
                [0; <T as Packable>::N]
            };
            writer.write_array(packed_element);
        }
        writer.write_struct(self.len(), u32::pack);
        writer.finish()
    }

    /// Unpacks a `BoundedVec`.
    ///
    /// The length unpacks like a `u32`, and a length above `M` unpacks as `M`.
    #[inline_always]
    fn unpack(packed: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(packed);
        let storage = reader.read_struct(<[T; M] as Packable>::unpack);
        let len = std::cmp::min(reader.read_struct(u32::unpack), M);
        reader.finish();
        BoundedVec::from_parts(storage, len)
    }
}

/// Generates the `Packable` implementation for tuples of `length` elements.
///
/// A tuple packs to the packings of its elements, one after the other.
comptime fn impl_packable_for_tuple(_m: Module, length: u32) -> Quoted {
    // `T0`, `T1`, `T2`
    let type_names = make_slice(length, |i| f"T{i}".quoted_contents());

    // `element0`, `element1`, `element2`
    let element_names = make_slice(length, |i| f"element{i}".quoted_contents());

    // `T0, T1, T2`
    let generics = type_names.join(quote [,]);

    // `<T0 as Packable>::N + <T1 as Packable>::N + <T2 as Packable>::N`
    let packed_len = type_names
        .map(|type_name| quote { <$type_name as $crate::traits::Packable>::N })
        .join(quote [+]);

    // `T0: Packable, T1: Packable, T2: Packable,`
    let packable_constraints =
        type_names.map(|type_name| quote { $type_name: $crate::traits::Packable, }).join(quote []);

    let pack_elements = type_names
        .mapi(|i, type_name| quote {
            writer.write_struct(self.$i, <$type_name as $crate::traits::Packable>::pack);
        })
        .join(quote []);

    let unpack_elements = type_names
        .mapi(|i, type_name| {
            let element_name = element_names[i];
            quote {
                let $element_name = reader.read_struct(<$type_name as $crate::traits::Packable>::unpack);
            }
        })
        .join(quote []);
    let unpacked_elements = element_names.join(quote [,]);

    quote {
        impl<$generics> $crate::traits::Packable for ($generics) where $packable_constraints {
            let N: u32 = $packed_len;

            #[inline_always]
            fn pack(self) -> [Field; Self::N] {
                let mut writer: $crate::utils::writer::Writer<Self::N> = $crate::utils::writer::Writer::new();
                $pack_elements
                writer.finish()
            }

            #[inline_always]
            fn unpack(packed: [Field; Self::N]) -> Self {
                let mut reader = $crate::utils::reader::Reader::new(packed);
                $unpack_elements
                reader.finish();
                ($unpacked_elements)
            }
        }
    }
}

// Written by hand, as the element's packing is the tuple's packing and needs no copying.
impl<T0> Packable for (T0,)
where
    T0: Packable,
{
    let N: u32 = <T0 as Packable>::N;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        self.0.pack()
    }

    #[inline_always]
    fn unpack(packed: [Field; Self::N]) -> Self {
        (<T0 as Packable>::unpack(packed),)
    }
}

// The attributes are inner so that they run before those of the sibling modules declared below it, letting derives
// there pack tuple members.
mod tuple_impls {
    #![impl_packable_for_tuple(2)]
    #![impl_packable_for_tuple(3)]
    #![impl_packable_for_tuple(4)]
    #![impl_packable_for_tuple(5)]
    #![impl_packable_for_tuple(6)]

    use super::impl_packable_for_tuple;
}

mod test {
    use crate::traits::Packable;
    use std::meta::derive;

    /// Packs to a non-zero field even when zeroed.
    #[derive(Eq)]
    struct OffsetPacking {
        value: Field,
    }

    impl Packable for OffsetPacking {
        let N: u32 = 1;

        fn pack(self) -> [Field; Self::N] {
            [self.value + 1]
        }

        fn unpack(packed: [Field; Self::N]) -> Self {
            Self { value: packed[0] - 1 }
        }
    }

    #[derive(Eq, Packable)]
    struct WithTuple {
        pair: (u64, Field),
    }

    #[test]
    fn u16_packing() {
        let a: u16 = 10;
        assert_eq(a, u16::unpack(a.pack()));
    }

    #[test]
    fn i8_packing() {
        let a: i8 = -10;
        assert_eq(a, i8::unpack(a.pack()));
    }

    #[test]
    fn i16_packing() {
        let a: i16 = -10;
        assert_eq(a, i16::unpack(a.pack()));
    }

    #[test]
    fn i32_packing() {
        let a: i32 = -10;
        assert_eq(a, i32::unpack(a.pack()));
    }

    #[test]
    fn i64_packing() {
        let a: i64 = -10;
        assert_eq(a, i64::unpack(a.pack()));
    }

    #[test]
    fn bool_unpack_accepts_canonical_values() {
        assert_eq(bool::unpack([0]), false);
        assert_eq(bool::unpack([1]), true);
    }

    #[test]
    fn bool_unpack_treats_non_zero_fields_as_true() {
        assert_eq(bool::unpack([2]), true);
        assert_eq(bool::unpack([3]), true);
        assert_eq(bool::unpack([1000000]), true);
        assert_eq(bool::unpack([-1]), true);
    }

    #[test]
    fn bool_pack_unpack_roundtrip() {
        assert_eq(true.pack(), [1]);
        assert_eq(false.pack(), [0]);
        assert_eq(bool::unpack(true.pack()), true);
        assert_eq(bool::unpack(false.pack()), false);
    }

    #[test]
    fn option_pack_unpack_roundtrip() {
        let some: Option<u64> = Option::some(5);
        assert_eq(some.pack(), [1, 5]);
        assert_eq(Option::<u64>::unpack(some.pack()), some);

        let none: Option<u64> = Option::none();
        assert_eq(none.pack(), [0, 0]);
        assert_eq(Option::<u64>::unpack(none.pack()), none);
    }

    #[test]
    fn option_none_packs_to_zeros_even_if_zeroed_value_does_not() {
        assert_eq(std::mem::zeroed::<OffsetPacking>().pack(), [1]);
        assert_eq(Option::<OffsetPacking>::none().pack(), [0, 0]);
    }

    #[test]
    fn option_unpack_treats_non_zero_flags_as_some() {
        assert_eq(Option::<u64>::unpack([2, 5]), Option::some(5));
        assert_eq(Option::<u64>::unpack([-1, 5]), Option::some(5));
    }

    #[test]
    fn option_unpack_ignores_the_value_of_none() {
        assert_eq(Option::<u64>::unpack([0, 5]), Option::none());
    }

    #[test]
    fn bounded_vec_pack_unpack_roundtrip() {
        let empty: BoundedVec<u64, 3> = BoundedVec::new();
        assert_eq(empty.pack(), [0, 0, 0, 0]);
        assert_eq(BoundedVec::<u64, 3>::unpack(empty.pack()), empty);

        let partial: BoundedVec<u64, 3> = BoundedVec::from_array([7, 8]);
        assert_eq(partial.pack(), [7, 8, 0, 2]);
        assert_eq(BoundedVec::<u64, 3>::unpack(partial.pack()), partial);

        let full: BoundedVec<u64, 3> = BoundedVec::from_array([7, 8, 9]);
        assert_eq(full.pack(), [7, 8, 9, 3]);
        assert_eq(BoundedVec::<u64, 3>::unpack(full.pack()), full);
    }

    #[test]
    fn bounded_vec_pack_zeroes_removed_elements() {
        let mut vec: BoundedVec<u64, 3> = BoundedVec::from_array([7, 8]);
        let _ = vec.pop();
        assert_eq(vec.pack(), [7, 0, 0, 1]);
    }

    #[test]
    fn bounded_vec_unpack_caps_the_length_at_max_len() {
        let full: BoundedVec<u64, 3> = BoundedVec::from_array([7, 8, 9]);
        assert_eq(BoundedVec::<u64, 3>::unpack([7, 8, 9, 3]), full);
        assert_eq(BoundedVec::<u64, 3>::unpack([7, 8, 9, 4]), full);
        assert_eq(BoundedVec::<u64, 3>::unpack([7, 8, 9, -1]), full);
    }

    #[test]
    fn bounded_vec_unpack_ignores_elements_past_the_length() {
        let unpacked = BoundedVec::<u64, 3>::unpack([7, 8, 9, 1]);
        assert_eq(unpacked, BoundedVec::from_array([7]));
        assert_eq(unpacked.pack(), [7, 0, 0, 1]);
    }

    #[test]
    fn bounded_vec_unpack_truncates_the_length_to_u32() {
        assert_eq(
            BoundedVec::<u64, 3>::unpack([7, 8, 9, 0x100000001]),
            BoundedVec::from_array([7]),
        );
    }

    #[test]
    fn tuple_pack_unpack_roundtrip() {
        let single: (u64,) = (5,);
        assert_eq(single.pack(), [5]);
        assert_eq(<(u64,)>::unpack(single.pack()), single);

        let pair: (u64, Option<Field>) = (5, Option::some(6));
        assert_eq(pair.pack(), [5, 1, 6]);
        assert_eq(<(u64, Option<Field>)>::unpack(pair.pack()), pair);

        let six: (bool, u8, u16, u32, u64, Field) = (true, 2, 3, 4, 5, 6);
        assert_eq(six.pack(), [1, 2, 3, 4, 5, 6]);
        assert_eq(<(bool, u8, u16, u32, u64, Field)>::unpack(six.pack()), six);
    }

    #[test]
    fn derived_packable_struct_with_tuple_member_roundtrip() {
        let x = WithTuple { pair: (5, 6) };
        assert_eq(x.pack(), [5, 6]);
        assert_eq(WithTuple::unpack(x.pack()), x);
    }
}
