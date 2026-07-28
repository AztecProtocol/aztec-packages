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
