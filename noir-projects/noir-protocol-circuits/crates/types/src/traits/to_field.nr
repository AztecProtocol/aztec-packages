use crate::utils::field::field_from_bytes;

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
impl ToField for u8 {
    #[inline_always]
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for u16 {
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
