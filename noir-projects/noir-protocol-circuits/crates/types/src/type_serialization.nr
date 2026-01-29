use crate::traits::{Deserialize, Serialize};
use super::base_utils::{reader::Reader, writer::Writer};

global U1_SERIALIZED_LEN: u32 = 1;
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

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as Field);
    }
}

impl Deserialize for bool {
    let N: u32 = BOOL_SERIALIZED_LEN;

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> bool {
        reader.read() != 0
    }
}

impl Serialize for u1 {
    let N: u32 = U1_SERIALIZED_LEN;

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as Field);
    }
}

impl Deserialize for u1 {
    let N: u32 = U1_SERIALIZED_LEN;

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u1
    }
}

impl Serialize for u8 {
    let N: u32 = U8_SERIALIZED_LEN;

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as Field);
    }
}

impl Deserialize for u8 {
    let N: u32 = U8_SERIALIZED_LEN;

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u8
    }
}

impl Serialize for u16 {
    let N: u32 = U16_SERIALIZED_LEN;

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as Field);
    }
}

impl Deserialize for u16 {
    let N: u32 = U16_SERIALIZED_LEN;

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u16
    }
}

impl Serialize for u32 {
    let N: u32 = U32_SERIALIZED_LEN;

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as Field);
    }
}

impl Deserialize for u32 {
    let N: u32 = U32_SERIALIZED_LEN;

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u32
    }
}

impl Serialize for u64 {
    let N: u32 = U64_SERIALIZED_LEN;

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as Field);
    }
}

impl Deserialize for u64 {
    let N: u32 = U64_SERIALIZED_LEN;

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u64
    }
}

impl Serialize for u128 {
    let N: u32 = U128_SERIALIZED_LEN;

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as Field);
    }
}

impl Deserialize for u128 {
    let N: u32 = U128_SERIALIZED_LEN;

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u128
    }
}

impl Serialize for Field {
    let N: u32 = FIELD_SERIALIZED_LEN;

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self);
    }
}

impl Deserialize for Field {
    let N: u32 = FIELD_SERIALIZED_LEN;

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read()
    }
}

impl Serialize for i8 {
    let N: u32 = I8_SERIALIZED_LEN;

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as u8 as Field);
    }
}

impl Deserialize for i8 {
    let N: u32 = I8_SERIALIZED_LEN;

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u8 as i8
    }
}

impl Serialize for i16 {
    let N: u32 = I16_SERIALIZED_LEN;

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as u16 as Field);
    }
}

impl Deserialize for i16 {
    let N: u32 = I16_SERIALIZED_LEN;

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u16 as i16
    }
}

impl Serialize for i32 {
    let N: u32 = I32_SERIALIZED_LEN;

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as u32 as Field);
    }
}

impl Deserialize for i32 {
    let N: u32 = I32_SERIALIZED_LEN;

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u32 as i32
    }
}

impl Serialize for i64 {
    let N: u32 = I64_SERIALIZED_LEN;

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as u64 as Field);
    }
}

impl Deserialize for i64 {
    let N: u32 = I64_SERIALIZED_LEN;

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u64 as i64
    }
}

impl<T, let M: u32> Serialize for [T; M]
where
    T: Serialize,
{
    let N: u32 = <T as Serialize>::N * M;

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        for i in 0..M {
            self[i].stream_serialize(writer);
        }
    }
}

impl<T, let M: u32> Deserialize for [T; M]
where
    T: Deserialize,
{
    let N: u32 = <T as Deserialize>::N * M;

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        let mut result: [T; M] = std::mem::zeroed();
        for i in 0..M {
            result[i] = T::stream_deserialize(reader);
        }
        result
    }
}

impl<T> Serialize for Option<T>
where
    T: Serialize,
{
    let N: u32 = <T as Serialize>::N + 1;

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write_bool(self.is_some());
        self.unwrap_unchecked().stream_serialize(writer);
    }
}

impl<T> Deserialize for Option<T>
where
    T: Deserialize,
{
    let N: u32 = <T as Deserialize>::N + 1;

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        if reader.read_bool() {
            Option::some(<T as Deserialize>::stream_deserialize(reader))
        } else {
            reader.advance_offset(<T as Deserialize>::N);
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
    fn array_serialization() {
        let array = [1, 2, 3, 4];

        let serialized: [Field; 4] = array.serialize();
        let deserialized: [Field; 4] = Deserialize::deserialize(serialized);
        assert_eq(deserialized, array);
    }

    #[test]
    fn nested_array_serialization() {
        let nested_array = [[1, 2, 3, 4], [5, 6, 7, 8]];

        let serialized: [Field; 8] = nested_array.serialize();
        let deserialized: [[Field; 4]; 2] = Deserialize::deserialize(serialized);

        assert_eq(deserialized, nested_array);
    }

    #[test]
    fn option_array_serialization() {
        let opt_some = Option::some([2, 5]);
        assert_eq(Option::<_>::deserialize(opt_some.serialize()), opt_some);

        let opt_none = Option::none();
        assert_eq(Option::<Field>::deserialize(opt_none.serialize()), opt_none);
    }
}
