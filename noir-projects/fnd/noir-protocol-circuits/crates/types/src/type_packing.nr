use crate::traits::{Deserialize, Packable, Serialize};

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

    /// Unpacks a `bool`, constraining the field to be a canonical boolean. A field outside `{0, 1}` is
    /// rejected (rather than silently reinterpreted), so an arbitrary-origin field cannot be misread.
    /// `pack` always emits `0` or `1`, so round-tripping is unaffected.
    #[inline_always]
    fn unpack(fields: [Field; Self::N]) -> bool {
        let v = fields[0];
        // v * v == v holds iff v is 0 or 1: a single degree-2 constraint that both validates the field
        // is a canonical bool and avoids the byte-range decomposition that a cast to u8 would require.
        assert(v * v == v, "Packable::unpack: bool field must be 0 or 1");
        v == 1
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

#[test]
fn test_u16_packing() {
    let a: u16 = 10;
    assert_eq(a, u16::unpack(a.pack()));
}

#[test]
fn test_i8_packing() {
    let a: i8 = -10;
    assert_eq(a, i8::unpack(a.pack()));
}

#[test]
fn test_i16_packing() {
    let a: i16 = -10;
    assert_eq(a, i16::unpack(a.pack()));
}

#[test]
fn test_i32_packing() {
    let a: i32 = -10;
    assert_eq(a, i32::unpack(a.pack()));
}

#[test]
fn test_i64_packing() {
    let a: i64 = -10;
    assert_eq(a, i64::unpack(a.pack()));
}

#[test]
fn test_bool_unpack_accepts_canonical_values() {
    assert_eq(bool::unpack([0]), false);
    assert_eq(bool::unpack([1]), true);
}

#[test(should_fail_with = "bool field must be 0 or 1")]
fn test_bool_unpack_rejects_even_non_bool() {
    // 2 has LSB 0, so the previous LSB-based unpack silently returned false; now it is rejected.
    let _ = bool::unpack([2]);
}

#[test(should_fail_with = "bool field must be 0 or 1")]
fn test_bool_unpack_rejects_odd_non_bool() {
    // 3 has LSB 1, so the previous LSB-based unpack silently returned true; now it is rejected.
    let _ = bool::unpack([3]);
}

#[test(should_fail_with = "bool field must be 0 or 1")]
fn test_bool_unpack_rejects_large_field() {
    let _ = bool::unpack([1000000]);
}

#[test]
fn test_bool_pack_unpack_roundtrip() {
    // `pack` always emits 0 or 1, so it round-trips through the canonical-bool check in `unpack`.
    assert_eq(true.pack(), [1]);
    assert_eq(false.pack(), [0]);
    assert_eq(bool::unpack(true.pack()), true);
    assert_eq(bool::unpack(false.pack()), false);
}
