use dep::std::{default::Default,cmp::Eq};

pub fn is_default<T>(item: T) -> bool where T: Default + Eq {
    item.eq(T::default())
}

pub fn is_default_array<T, N>(array: [T; N]) -> bool where T: Default + Eq {
    array.all(|elem| is_default(elem))
}

// If a Field is equal to zero, then it is regarded as zero.
// We will go with this definition for now, however it can be problematic 
// if a value can actually be zero. In a future refactor, we can 
// use the optional type for safety. Doing it now would lead to a worse devex
// and would make it harder to sync up with the cpp code.
trait Zero {
    fn zero() -> Self;
}

pub fn is_zero<T>(item: T) -> bool where T: Zero + Eq {
    item.eq(T::zero())
}

trait Hash {
    fn hash(self) -> Field;
}

trait ToField {
    fn to_field(self) -> Field;
}

impl ToField for Field {
    fn to_field(self) -> Field {
        self
    }
}

impl ToField for bool { fn to_field(self) -> Field { self as Field } }
impl ToField for u1 { fn to_field(self) -> Field { self as Field } }
impl ToField for u8 { fn to_field(self) -> Field { self as Field } }
impl ToField for u32 { fn to_field(self) -> Field { self as Field } }
impl ToField for u64 { fn to_field(self) -> Field { self as Field } }
impl ToField for U128 {
    fn to_field(self) -> Field {
        self.to_integer()
    }
}

trait FromField {
    fn from_field(value: Field) -> Self;
}

impl FromField for Field {
    fn from_field(value: Field) -> Self {
        value
    }
}

impl FromField for bool { fn from_field(value: Field) -> Self { value as bool } }
impl FromField for u1 { fn from_field(value: Field) -> Self { value as u1 } }
impl FromField for u8 { fn from_field(value: Field) -> Self { value as u8 } }
impl FromField for u32 { fn from_field(value: Field) -> Self { value as u32 } }
impl FromField for u64 { fn from_field(value: Field) -> Self { value as u64 } }
impl FromField for U128 {
    fn from_field(value: Field) -> Self {
        U128::from_integer(value)
    }
}

// docs:start:serialize
trait Serialize<N> {
    fn serialize(self) -> [Field; N];
}
// docs:end:serialize

// docs:start:deserialize
trait Deserialize<N> {
    fn deserialize(fields: [Field; N]) -> Self;
}
// docs:end:deserialize
