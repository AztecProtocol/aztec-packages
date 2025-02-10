use crate::traits::{Deserialize, Serialize};

global BOOL_SERIALIZED_LEN: u32 = 1;
global U8_SERIALIZED_LEN: u32 = 1;
global U16_SERIALIZED_LEN: u32 = 1;
global U32_SERIALIZED_LEN: u32 = 1;
global U64_SERIALIZED_LEN: u32 = 1;
global U128_SERIALIZED_LEN: u32 = 2;
global FIELD_SERIALIZED_LEN: u32 = 1;
global I8_SERIALIZED_LEN: u32 = 1;
global I16_SERIALIZED_LEN: u32 = 1;
global I32_SERIALIZED_LEN: u32 = 1;
global I64_SERIALIZED_LEN: u32 = 1;

impl Serialize<1> for Field {
    fn write<let N: u32>(self, writer: &mut Writer<N>) {
        writer.write(self);
    }
}

impl Deserialize<1> for Field {
    fn read<let N: u32>(reader: &mut Reader<N>) -> Self {
        reader.read()
    }
}

impl Serialize<1> for bool {
    fn write<let N: u32>(self, writer: &mut Writer<N>) {
        writer.write(self as Field);
    }
}

impl Deserialize<1> for bool {
    fn read<let N: u32>(reader: &mut Reader<N>) -> Self {
        reader.read() == 1
    }
}

impl Serialize<1> for u32 {
    fn write<let N: u32>(self, writer: &mut Writer<N>) {
        writer.write(self as Field);
    }
}

impl Deserialize<1> for u32 {
    fn read<let N: u32>(reader: &mut Reader<N>) -> Self {
        reader.read() as u32
    }
}

impl<T, let K: u32> Serialize<K + 1> for Option<T>
where
    T: Serialize<K>,
{
    fn write<let N: u32>(self, writer: &mut Writer<N>) {
        self.is_some().write(writer);
        self.unwrap_unchecked().write(writer);
    }
}

#[test]
fn test_u16_serialization() {
    let a: u16 = 10;
    assert_eq(a, u16::deserialize(a.serialize()));
}

#[test]
fn test_i8_serialization() {
    let a: i8 = -10;
    assert_eq(a, i8::deserialize(a.serialize()));
}

#[test]
fn test_i16_serialization() {
    let a: i16 = -10;
    assert_eq(a, i16::deserialize(a.serialize()));
}

#[test]
fn test_i32_serialization() {
    let a: i32 = -10;
    assert_eq(a, i32::deserialize(a.serialize()));
}

#[test]
fn test_i64_serialization() {
    let a: i64 = -10;
    assert_eq(a, i64::deserialize(a.serialize()));
}
