use crate::utils::field::field_from_bytes;
use crate::meta::{derive_deserialize, derive_serialize};

// Trait: is_empty
//
// The general is_empty trait checks if a data type is is empty,
// and it defines empty for the basic data types as 0.
//
// If a Field is equal to zero, then it is regarded as zero.
// We will go with this definition for now, however it can be problematic
// if a value can actually be zero. In a future refactor, we can
// use the optional type for safety. Doing it now would lead to a worse devex
// and would make it harder to sync up with the cpp code.
// Preferred over Default trait to convey intent, as default doesn't necessarily mean empty.
pub trait Empty {
    fn empty() -> Self;
}

impl Empty for Field {
    fn empty() -> Self {
        0
    }
}

impl Empty for u1 {
    fn empty() -> Self {
        0
    }
}
impl Empty for u8 {
    fn empty() -> Self {
        0
    }
}
impl Empty for u32 {
    fn empty() -> Self {
        0
    }
}
impl Empty for u64 {
    fn empty() -> Self {
        0
    }
}
impl Empty for U128 {
    fn empty() -> Self {
        U128::from_integer(0)
    }
}

pub fn is_empty<T>(item: T) -> bool where T: Empty + Eq {
    item.eq(T::empty())
}

pub fn is_empty_array<T, let N: u32>(array: [T; N]) -> bool where T: Empty + Eq {
    array.all(|elem| is_empty(elem))
}

pub trait Hash {
    fn hash(self) -> Field;
}

pub trait ToField {
    fn to_field(self) -> Field;
}

impl ToField for Field {
    fn to_field(self) -> Field {
        self
    }
}

impl ToField for bool {
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for u1 {
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for u8 {
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for u32 {
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for u64 {
    fn to_field(self) -> Field {
        self as Field
    }
}
impl ToField for U128 {
    fn to_field(self) -> Field {
        self.to_integer()
    }
}
impl<let N: u32> ToField for str<N> {
    fn to_field(self) -> Field {
        assert(N < 32, "String doesn't fit in a field, consider using Serialize instead");
        field_from_bytes(self.as_bytes(), true)
    }
}

pub trait FromField {
    fn from_field(value: Field) -> Self;
}

impl FromField for Field {
    fn from_field(value: Field) -> Self {
        value
    }
}

impl FromField for bool {
    fn from_field(value: Field) -> Self {
        value as bool
    }
}
impl FromField for u1 {
    fn from_field(value: Field) -> Self {
        value as u1
    }
}
impl FromField for u8 {
    fn from_field(value: Field) -> Self {
        value as u8
    }
}
impl FromField for u32 {
    fn from_field(value: Field) -> Self {
        value as u32
    }
}
impl FromField for u64 {
    fn from_field(value: Field) -> Self {
        value as u64
    }
}
impl FromField for U128 {
    fn from_field(value: Field) -> Self {
        U128::from_integer(value)
    }
}

// docs:start:serialize
#[derive_via(derive_serialize)]
pub trait Serialize<let N: u32> {
    fn serialize(self) -> [Field; N];
}
// docs:end:serialize

impl<let N: u32> Serialize<N> for [Field; N] {
    fn serialize(self) -> [Field; N] {
        self
    }
}

impl<let N: u32> Serialize<N> for str<N> {
    fn serialize(self) -> [Field; N] {
        let bytes = self.as_bytes();
        let mut fields = [0; N];
        for i in 0..bytes.len() {
            fields[i] = bytes[i] as Field;
        }
        fields
    }
}

// docs:start:deserialize
#[derive_via(derive_deserialize)]
pub trait Deserialize<let N: u32> {
    fn deserialize(fields: [Field; N]) -> Self;
}
// docs:end:deserialize

impl<let N: u32> Deserialize<N> for [Field; N] {
    fn deserialize(fields: [Field; N]) -> Self {
        fields
    }
}

/// A trait for types that can be deserialized from a calldata field array
#[derive_via(derive_from_calldata)]
pub trait FromCalldata<let N: u32> {
    /// Deserializes Self by reading it from calldata at the given index, also returning the next index to read from
    fn from_calldata(calldata: [Field; N], index: Field) -> (Self, Field);
}

pub comptime fn derive_from_calldata(s: StructDefinition) -> Quoted {
    let typ = s.as_type();

    let impl_generics = s.generics().map(|g| quote { $g });
    let impl_generics = impl_generics.push_front(quote { let N: u32 });
    let impl_generics = impl_generics.join(quote {,});

    let where_clause = s.generics().map(|name| quote { $name: FromCalldata<N> }).join(quote {,});

    let names = s.fields().map(|f: (Quoted, Type)| f.0);
    if names.len() == 0 {
        quote {
            impl <let N: u32> FromCalldata<N> for $typ {
                fn from_calldata(_calldata: [Field; N], index: Field) -> (Self, Field) {
                    (Self {}, index)
                }
            }
        }
    } else {
        let statements = names.map(
            |name: Quoted| {
            quote { 
                let ($name, index) = FromCalldata::from_calldata(calldata, index);
            }
        }
        );
        let self_names = names.join(quote { , });
        let statements = statements.join(quote { });
        quote {
            impl <$impl_generics> FromCalldata<N> for $typ where $where_clause {
                fn from_calldata(calldata: [Field; N], index: Field) -> (Self, Field) {
                    $statements
                    (Self { $self_names }, index)
                }
            }
        }
    }
}

impl <let N: u32> FromCalldata<N> for Field {
    fn from_calldata(calldata: [Field; N], index: Field) -> (Self, Field) {
        let value = calldata[index];
        (value, index + 1)
    }
}

impl <let N: u32> FromCalldata<N> for bool {
    fn from_calldata(calldata: [Field; N], index: Field) -> (Self, Field) {
        let value = calldata[index] as bool;
        (value, index + 1)
    }
}

impl <let N: u32> FromCalldata<N> for u1 {
    fn from_calldata(calldata: [Field; N], index: Field) -> (Self, Field) {
        let value = calldata[index] as u1;
        (value, index + 1)
    }
}

impl <let N: u32> FromCalldata<N> for u8 {
    fn from_calldata(calldata: [Field; N], index: Field) -> (Self, Field) {
        let value = calldata[index] as u8;
        (value, index + 1)
    }
}

impl <let N: u32> FromCalldata<N> for u16 {
    fn from_calldata(calldata: [Field; N], index: Field) -> (Self, Field) {
        let value = calldata[index] as u16;
        (value, index + 1)
    }
}

impl <let N: u32> FromCalldata<N> for u32 {
    fn from_calldata(calldata: [Field; N], index: Field) -> (Self, Field) {
        let value = calldata[index] as u32;
        (value, index + 1)
    }
}

impl <let N: u32> FromCalldata<N> for u64 {
    fn from_calldata(calldata: [Field; N], index: Field) -> (Self, Field) {
        let value = calldata[index] as u64;
        (value, index + 1)
    }
}

impl <let N: u32> FromCalldata<N> for i8 {
    fn from_calldata(calldata: [Field; N], index: Field) -> (Self, Field) {
        let value = calldata[index] as i8;
        (value, index + 1)
    }
}

impl <let N: u32> FromCalldata<N> for i16 {
    fn from_calldata(calldata: [Field; N], index: Field) -> (Self, Field) {
        let value = calldata[index] as i16;
        (value, index + 1)
    }
}

impl <let N: u32> FromCalldata<N> for i32 {
    fn from_calldata(calldata: [Field; N], index: Field) -> (Self, Field) {
        let value = calldata[index] as i32;
        (value, index + 1)
    }
}

impl <let N: u32> FromCalldata<N> for i64 {
    fn from_calldata(calldata: [Field; N], index: Field) -> (Self, Field) {
        let value = calldata[index] as i64;
        (value, index + 1)
    }
}

impl <let N: u32> FromCalldata<N> for U128 {
    fn from_calldata(calldata: [Field; N], index: Field) -> (Self, Field) {
        let input = [calldata[index]];
        (U128::deserialize(input), index + 1)
    }
}

impl <let N: u32, T, let M: u32> FromCalldata<N> for [T; M] where T: FromCalldata<N> {
    fn from_calldata(calldata: [Field; N], mut index: Field) -> (Self, Field) {
        let mut values = [std::mem::zeroed(); M];
        for loop_index in 0..M {
            let (value, new_index) = FromCalldata::from_calldata(calldata, index);
            values[loop_index] = value;
            index = new_index;
        }
        (values, index)
    }
}

mod tests {
    use super::FromCalldata;

    #[derive(FromCalldata)]
    struct Point<T> {
        x: T,
        y: T,
    }

    #[test]
    fn test_field_from_call_data() {
        let calldata = [1];
        let (value, index): (Field, Field) = FromCalldata::from_calldata(calldata, 0);
        assert_eq(value, 1);
        assert_eq(index, 1);
    }

    #[test]
    fn test_bool_from_call_data() {
        let calldata = [1];
        let (value, index): (bool, Field) = FromCalldata::from_calldata(calldata, 0);
        assert_eq(value, true);
        assert_eq(index, 1);

        let calldata = [0];
        let (value, index): (bool, Field) = FromCalldata::from_calldata(calldata, 0);
        assert_eq(value, false);
        assert_eq(index, 1);
    }

    #[test]
    fn test_u8_from_call_data() {
        let calldata = [1];
        let (value, index): (u8, Field) = FromCalldata::from_calldata(calldata, 0);
        assert_eq(value, 1);
        assert_eq(index, 1);
    }

    #[test]
    fn test_struct_from_call_data() {
        let calldata = [1, 2];
        let (value, index): (Point<Field>, Field) = FromCalldata::from_calldata(calldata, 0);
        assert_eq(value.x, 1);
        assert_eq(value.y, 2);
        assert_eq(index, 2);
    }

    #[test]
    fn test_array_from_call_data() {
        let calldata = [1, 2, 3];
        let (value, index): ([Field; 3], Field) = FromCalldata::from_calldata(calldata, 0);
        assert_eq(value, [1, 2, 3]);
        assert_eq(index, 3);
    }
}
