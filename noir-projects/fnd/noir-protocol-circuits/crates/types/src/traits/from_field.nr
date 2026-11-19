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
impl FromField for u8 {
    #[inline_always]
    fn from_field(value: Field) -> Self {
        value as u8
    }
}
impl FromField for u16 {
    fn from_field(value: Field) -> Self {
        value as u16
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
impl FromField for i8 {
    #[inline_always]
    fn from_field(value: Field) -> Self {
        value as u8 as i8
    }
}
impl FromField for i16 {
    #[inline_always]
    fn from_field(value: Field) -> Self {
        value as u16 as i16
    }
}
impl FromField for i32 {
    #[inline_always]
    fn from_field(value: Field) -> Self {
        value as u32 as i32
    }
}
impl FromField for i64 {
    #[inline_always]
    fn from_field(value: Field) -> Self {
        value as u64 as i64
    }
}

mod test {
    use crate::traits::{FromField, Packable, ToField};

    #[test]
    fn signed_integers_to_field_from_field_roundtrip() {
        let i8_values: [i8; 5] = [-128, -1, 0, 1, 127];
        for value in i8_values {
            assert_eq(i8::from_field(value.to_field()), value);
        }
        let i16_values: [i16; 5] = [-32768, -1, 0, 1, 32767];
        for value in i16_values {
            assert_eq(i16::from_field(value.to_field()), value);
        }
        let i32_values: [i32; 5] = [-2147483648, -1, 0, 1, 2147483647];
        for value in i32_values {
            assert_eq(i32::from_field(value.to_field()), value);
        }
        let i64_values: [i64; 5] = [-9223372036854775808, -1, 0, 1, 9223372036854775807];
        for value in i64_values {
            assert_eq(i64::from_field(value.to_field()), value);
        }
    }

    #[test]
    fn signed_integers_to_field_matches_packing() {
        let i8_value: i8 = -2;
        assert_eq(i8_value.to_field(), i8_value.pack()[0]);
        let i16_value: i16 = -2;
        assert_eq(i16_value.to_field(), i16_value.pack()[0]);
        let i32_value: i32 = -2;
        assert_eq(i32_value.to_field(), i32_value.pack()[0]);
        let i64_value: i64 = -2;
        assert_eq(i64_value.to_field(), i64_value.pack()[0]);
    }

    #[test]
    fn signed_integers_from_field_truncate_to_their_width() {
        assert_eq(i8::from_field(0x1ff), -1);
        assert_eq(i16::from_field(0x1ffff), -1);
        assert_eq(i32::from_field(0x1ffffffff), -1);
        assert_eq(i64::from_field(0x1ffffffffffffffff), -1);
    }
}
