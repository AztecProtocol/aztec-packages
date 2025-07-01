use crate::traits::{Deserialize, Serialize};

global BOOL_SERIALIZED_LEN: u32 = 1;
global U8_SERIALIZED_LEN: u32 = 1;
global U16_SERIALIZED_LEN: u32 = 1;
global U32_SERIALIZED_LEN: u32 = 1;
global U64_SERIALIZED_LEN: u32 = 1;
global U128_SERIALIZED_LEN: u32 = 1;
global FIELD_SERIALIZED_LEN: u32 = 1;
global I8_SERIALIZED_LEN: u32 = 1;
global I16_SERIALIZED_LEN: u32 = 1;
global I32_SERIALIZED_LEN: u32 = 1;
global I64_SERIALIZED_LEN: u32 = 1;

impl Serialize for bool {
    let N: u32 = BOOL_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        [self as Field]
    }
}

impl Deserialize<BOOL_SERIALIZED_LEN> for bool {
    fn deserialize(fields: [Field; BOOL_SERIALIZED_LEN]) -> bool {
        fields[0] != 0
    }
}

impl Serialize for u8 {
    let N: u32 = U8_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        [self as Field]
    }
}

impl Deserialize<U8_SERIALIZED_LEN> for u8 {
    fn deserialize(fields: [Field; U8_SERIALIZED_LEN]) -> Self {
        fields[0] as u8
    }
}

impl Serialize for u16 {
    let N: u32 = U16_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        [self as Field]
    }
}

impl Deserialize<U16_SERIALIZED_LEN> for u16 {
    fn deserialize(fields: [Field; U16_SERIALIZED_LEN]) -> Self {
        fields[0] as u16
    }
}

impl Serialize for u32 {
    let N: u32 = U32_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        [self as Field]
    }
}

impl Deserialize<U32_SERIALIZED_LEN> for u32 {
    fn deserialize(fields: [Field; U32_SERIALIZED_LEN]) -> Self {
        fields[0] as u32
    }
}

impl Serialize for u64 {
    let N: u32 = U64_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        [self as Field]
    }
}

impl Deserialize<U64_SERIALIZED_LEN> for u64 {
    fn deserialize(fields: [Field; U64_SERIALIZED_LEN]) -> Self {
        fields[0] as u64
    }
}

impl Serialize for u128 {
    let N: u32 = U128_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        [self as Field]
    }
}

impl Deserialize<U128_SERIALIZED_LEN> for u128 {
    fn deserialize(fields: [Field; U128_SERIALIZED_LEN]) -> Self {
        fields[0] as u128
    }
}

impl Serialize for Field {
    let N: u32 = FIELD_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        [self]
    }
}

impl Deserialize<FIELD_SERIALIZED_LEN> for Field {
    fn deserialize(fields: [Field; FIELD_SERIALIZED_LEN]) -> Self {
        fields[0]
    }
}

impl Serialize for i8 {
    let N: u32 = I8_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        [self as u8 as Field]
    }
}

impl Deserialize<I8_SERIALIZED_LEN> for i8 {
    fn deserialize(fields: [Field; I8_SERIALIZED_LEN]) -> Self {
        fields[0] as u8 as i8
    }
}

impl Serialize for i16 {
    let N: u32 = I16_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        [self as u16 as Field]
    }
}

impl Deserialize<I16_SERIALIZED_LEN> for i16 {
    fn deserialize(fields: [Field; I16_SERIALIZED_LEN]) -> Self {
        fields[0] as u16 as i16
    }
}

impl Serialize for i32 {
    let N: u32 = I32_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        [self as u32 as Field]
    }
}

impl Deserialize<I32_SERIALIZED_LEN> for i32 {
    fn deserialize(fields: [Field; I32_SERIALIZED_LEN]) -> Self {
        fields[0] as u32 as i32
    }
}

impl Serialize for i64 {
    let N: u32 = I64_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        [self as u64 as Field]
    }
}

impl Deserialize<I64_SERIALIZED_LEN> for i64 {
    fn deserialize(fields: [Field; I64_SERIALIZED_LEN]) -> Self {
        fields[0] as u64 as i64
    }
}

impl<T, let N: u32> Serialize for [T; N]
where
    T: Serialize,
{
    let N: u32 = <T as Serialize>::N * N;

    fn serialize(self) -> [Field; Self::N] {
        let mut result: [Field; _] = std::mem::zeroed();
        for i in 0..N {
            let serialized_t = self[i].serialize();
            for j in 0..<T as Serialize>::N {
                result[i * <T as Serialize>::N + j] = serialized_t[j];
            }
        }
        result
    }
}

impl<T, let N: u32, let M: u32> Deserialize<N * M> for [T; N]
where
    T: Deserialize<M>,
{
    fn deserialize(fields: [Field; N * M]) -> Self {
        let mut reader = crate::utils::reader::Reader::new(fields);
        let mut result: [T; N] = std::mem::zeroed();
        reader.read_struct_array::<T, M, N>(Deserialize::deserialize, result)
    }
}

impl<T, let N: u32> Serialize<N + 1> for Option<T>
where
    T: Serialize<N>,
{
    fn serialize(self) -> [Field; N + 1] {
        let mut result: [Field; N + 1] = std::mem::zeroed();

        result[0] = if self.is_some() { 1 } else { 0 };

        let value_serialized = self.unwrap_unchecked().serialize();
        for i in 0..N {
            result[1 + i] = value_serialized[i];
        }

        result
    }
}

impl<T, let N: u32> Deserialize<N + 1> for Option<T>
where
    T: Deserialize<N>,
{
    fn deserialize(fields: [Field; N + 1]) -> Self {
        if fields[0] == 1 {
            let mut value_serialized: [Field; N] = std::mem::zeroed();
            for i in 0..N {
                value_serialized[i] = fields[1 + i];
            }

            Option::some(T::deserialize(value_serialized))
        } else {
            Option::none()
        }
    }
}

mod test {
    use crate::traits::{Deserialize, Serialize};

    #[test]
    fn u16_serialization() {
        let a: u16 = 10;
        assert_eq(a, u16::deserialize(a.serialize()));
    }

    #[test]
    fn i8_serialization() {
        let a: i8 = -10;
        assert_eq(a, i8::deserialize(a.serialize()));
    }

    #[test]
    fn i16_serialization() {
        let a: i16 = -10;
        assert_eq(a, i16::deserialize(a.serialize()));
    }

    #[test]
    fn i32_serialization() {
        let a: i32 = -10;
        assert_eq(a, i32::deserialize(a.serialize()));
    }

    #[test]
    fn i64_serialization() {
        let a: i64 = -10;
        assert_eq(a, i64::deserialize(a.serialize()));
    }

    #[test]
    fn option_field_serialization() {
        let opt_some = Option::some(5);
        assert_eq(Option::<_>::deserialize(opt_some.serialize()), opt_some);

        let opt_none = Option::none();
        assert_eq(Option::<Field>::deserialize(opt_none.serialize()), opt_none);
    }

    #[test]
    fn option_array_serialization() {
        let opt_some = Option::some([2, 5]);
        assert_eq(Option::<_>::deserialize(opt_some.serialize()), opt_some);

        let opt_none = Option::none();
        assert_eq(Option::<Field>::deserialize(opt_none.serialize()), opt_none);
    }
}
