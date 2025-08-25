use crate::traits::Packable;

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

impl Packable for bool {
    let N: u32 = BOOL_PACKED_LEN;

    #[inline_always]
    fn pack(self) -> [Field; Self::N] {
        [self as Field]
    }

    #[inline_always]
    fn unpack(fields: [Field; Self::N]) -> bool {
        (fields[0] as u1) != 0
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
        let mut result: [T; M] = std::mem::zeroed();
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
