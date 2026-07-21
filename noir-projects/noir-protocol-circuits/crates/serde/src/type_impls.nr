use crate::{reader::Reader, serialization::{Deserialize, Serialize}, writer::Writer};
use std::embedded_curve_ops::EmbeddedCurvePoint;
use std::embedded_curve_ops::EmbeddedCurveScalar;

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
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as Field);
    }
}

impl Deserialize for bool {
    let N: u32 = BOOL_SERIALIZED_LEN;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> bool {
        reader.read() != 0
    }
}

impl Serialize for u8 {
    let N: u32 = U8_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as Field);
    }
}

impl Deserialize for u8 {
    let N: u32 = U8_SERIALIZED_LEN;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u8
    }
}

impl Serialize for u16 {
    let N: u32 = U16_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as Field);
    }
}

impl Deserialize for u16 {
    let N: u32 = U16_SERIALIZED_LEN;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u16
    }
}

impl Serialize for u32 {
    let N: u32 = U32_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as Field);
    }
}

impl Deserialize for u32 {
    let N: u32 = U32_SERIALIZED_LEN;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u32
    }
}

impl Serialize for u64 {
    let N: u32 = U64_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as Field);
    }
}

impl Deserialize for u64 {
    let N: u32 = U64_SERIALIZED_LEN;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u64
    }
}

impl Serialize for u128 {
    let N: u32 = U128_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as Field);
    }
}

impl Deserialize for u128 {
    let N: u32 = U128_SERIALIZED_LEN;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u128
    }
}

impl Serialize for Field {
    let N: u32 = FIELD_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self);
    }
}

impl Deserialize for Field {
    let N: u32 = FIELD_SERIALIZED_LEN;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read()
    }
}

impl Serialize for i8 {
    let N: u32 = I8_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as u8 as Field);
    }
}

impl Deserialize for i8 {
    let N: u32 = I8_SERIALIZED_LEN;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u8 as i8
    }
}

impl Serialize for i16 {
    let N: u32 = I16_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as u16 as Field);
    }
}

impl Deserialize for i16 {
    let N: u32 = I16_SERIALIZED_LEN;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u16 as i16
    }
}

impl Serialize for i32 {
    let N: u32 = I32_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as u32 as Field);
    }
}

impl Deserialize for i32 {
    let N: u32 = I32_SERIALIZED_LEN;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        reader.read() as u32 as i32
    }
}

impl Serialize for i64 {
    let N: u32 = I64_SERIALIZED_LEN;

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self as u64 as Field);
    }
}

impl Deserialize for i64 {
    let N: u32 = I64_SERIALIZED_LEN;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

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

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

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

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

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

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write_bool(self.is_some());
        if self.is_some() {
            self.unwrap_unchecked().stream_serialize(writer);
        } else {
            writer.advance_offset(<T as Serialize>::N);
        }
    }
}

impl<T> Deserialize for Option<T>
where
    T: Deserialize,
{
    let N: u32 = <T as Deserialize>::N + 1;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

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

global SCALAR_SIZE: u32 = 2;

impl Serialize for EmbeddedCurveScalar {

    let N: u32 = SCALAR_SIZE;

    fn serialize(self) -> [Field; SCALAR_SIZE] {
        [self.lo, self.hi]
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self.lo);
        writer.write(self.hi);
    }
}

impl Deserialize for EmbeddedCurveScalar {
    let N: u32 = SCALAR_SIZE;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Self { lo: fields[0], hi: fields[1] }
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        Self { lo: reader.read(), hi: reader.read() }
    }
}

global POINT_SIZE: u32 = 2;

impl Serialize for EmbeddedCurvePoint {
    let N: u32 = POINT_SIZE;

    fn serialize(self) -> [Field; Self::N] {
        [self.x, self.y]
    }

    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self.x);
        writer.write(self.y);
    }
}

impl Deserialize for EmbeddedCurvePoint {
    let N: u32 = POINT_SIZE;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Self { x: fields[0], y: fields[1] }
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        Self { x: reader.read(), y: reader.read() }
    }
}

impl<let M: u32> Deserialize for str<M> {
    let N: u32 = M;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        let u8_arr = <[u8; Self::N] as Deserialize>::stream_deserialize(reader);
        str::<Self::N>::from(u8_arr)
    }
}

impl<let M: u32> Serialize for str<M> {
    let N: u32 = M;

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        self.as_bytes().stream_serialize(writer);
    }
}

// Note: Not deriving this because it's not supported to call derive_serialize on a "remote" struct (and it will never
// be supported).
impl<T, let M: u32> Deserialize for BoundedVec<T, M>
where
    T: Deserialize,
{
    let N: u32 = <T as Deserialize>::N * M + 1;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        let mut new_bounded_vec: BoundedVec<T, M> = BoundedVec::new();
        let payload_len = Self::N - 1;

        // Length is stored in the last field as we need to match intrinsic Noir serialization and the `len` struct
        // field is after `storage` struct field (see `bounded_vec.nr` in noir-stdlib)
        let len = reader.peek_offset(payload_len) as u32;

        for i in 0..M {
            if i < len {
                new_bounded_vec.push(<T as Deserialize>::stream_deserialize(reader));
            }
        }

        // +1 for the length of the BoundedVec
        reader.advance_offset((M - len) * <T as Deserialize>::N + 1);

        new_bounded_vec
    }
}

// This may cause issues if used as program input, because noir disallows empty arrays for program input.
// I think this is okay because I don't foresee a unit type being used as input. But leaving this comment as a hint
// if someone does run into this in the future.
impl Deserialize for () {
    let N: u32 = 0;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(_reader: &mut Reader<K>) -> Self {
        ()
    }
}

// Note: Not deriving this because it's not supported to call derive_serialize on a "remote" struct (and it will never
// be supported).
impl<T, let M: u32> Serialize for BoundedVec<T, M>
where
    T: Serialize,
{
    let N: u32 = <T as Serialize>::N * M + 1; // +1 for the length of the BoundedVec

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: Writer<Self::N> = Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        self.storage().stream_serialize(writer);
        // Length is stored in the last field as we need to match intrinsic Noir serialization and the `len` struct
        // field is after `storage` struct field (see `bounded_vec.nr` in noir-stdlib)
        writer.write_u32(self.len() as u32);
    }
}

// Create a slice of the given length with each element made from `f(i)` where `i` is the current index
comptime fn make_slice<Env, T>(length: u32, f: fn[Env](u32) -> T) -> [T] {
    let mut slice = @[];
    for i in 0..length {
        slice = slice.push_back(f(i));
    }
    slice
}

// Implements Serialize and Deserialize for an arbitrary tuple type
comptime fn impl_serialize_for_tuple(_m: Module, length: u32) -> Quoted {
    // `T0`, `T1`, `T2`
    let type_names = make_slice(length, |i| f"T{i}".quoted_contents());

    // `result0`, `result1`, `result2`
    let result_names = make_slice(length, |i| f"result{i}".quoted_contents());

    // `T0, T1, T2`
    let field_generics = type_names.join(quote [,]);

    // `<T0 as Serialize>::N + <T1 as Serialize>::N + <T2 as Serialize>::N`
    let full_size_serialize = type_names
        .map(|type_name| quote {
            <$type_name as Serialize>::N
        })
        .join(quote [+]);

    // `<T0 as Deserialize>::N + <T1 as Deserialize>::N + <T2 as Deserialize>::N`
    let full_size_deserialize = type_names
        .map(|type_name| quote {
            <$type_name as Deserialize>::N
        })
        .join(quote [+]);

    // `T0: Serialize, T1: Serialize, T2: Serialize,`
    let serialize_constraints = type_names
        .map(|field_name| quote {
        $field_name: Serialize,
    })
        .join(quote []);

    // `T0: Deserialize, T1: Deserialize, T2: Deserialize,`
    let deserialize_constraints = type_names
        .map(|field_name| quote {
        $field_name: Deserialize,
    })
        .join(quote []);

    // Statements to serialize each field
    let serialized_fields = type_names
        .mapi(|i, _type_name| quote {
            $crate::serialization::Serialize::stream_serialize(self.$i, writer);
        })
        .join(quote []);

    // Statements to deserialize each field
    let deserialized_fields = type_names
        .mapi(|i, type_name| {
            let result_name = result_names[i];
            quote {
            let $result_name = <$type_name as $crate::serialization::Deserialize>::stream_deserialize(reader);
        }
        })
        .join(quote []);
    let deserialize_results = result_names.join(quote [,]);

    quote {
        impl<$field_generics> Serialize for ($field_generics) where $serialize_constraints {
            let N: u32 = $full_size_serialize;

            fn serialize(self) -> [Field; Self::N] {
                let mut writer: $crate::writer::Writer<Self::N> = $crate::writer::Writer::new();
                self.stream_serialize(&mut writer);
                writer.finish()
            }

            #[inline_always]
            fn stream_serialize<let K: u32>(self, writer: &mut $crate::writer::Writer<K>) {

                $serialized_fields
            }
        }

        impl<$field_generics> Deserialize for ($field_generics) where $deserialize_constraints {
            let N: u32 = $full_size_deserialize;

            fn deserialize(fields: [Field; Self::N]) -> Self {
                let mut reader = $crate::reader::Reader::new(fields);
                let result = Self::stream_deserialize(&mut reader);
                reader.finish();
                result
            }
    
            #[inline_always]
            fn stream_deserialize<let K: u32>(reader: &mut $crate::reader::Reader<K>) -> Self {
                $deserialized_fields
                ($deserialize_results)
            }
        }
    }
}

// Keeping these manual impls. They are more efficient since they do not
// require copying sub-arrays from any serialized arrays.
impl<T1> Serialize for (T1,)
where
    T1: Serialize,
{
    let N: u32 = <T1 as Serialize>::N;

    fn serialize(self) -> [Field; Self::N] {
        let mut writer: crate::writer::Writer<Self::N> = crate::writer::Writer::new();
        self.stream_serialize(&mut writer);
        writer.finish()
    }

    #[inline_always]
    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        self.0.stream_serialize(writer);
    }
}

impl<T1> Deserialize for (T1,)
where
    T1: Deserialize,
{
    let N: u32 = <T1 as Deserialize>::N;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut reader = crate::reader::Reader::new(fields);
        let result = Self::stream_deserialize(&mut reader);
        reader.finish();
        result
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        (<T1 as Deserialize>::stream_deserialize(reader),)
    }
}

#[impl_serialize_for_tuple(2)]
#[impl_serialize_for_tuple(3)]
#[impl_serialize_for_tuple(4)]
#[impl_serialize_for_tuple(5)]
#[impl_serialize_for_tuple(6)]
mod impls {
    use crate::serialization::{Deserialize, Serialize};
}

#[test]
unconstrained fn bounded_vec_serialization() {
    // Test empty BoundedVec
    let empty_vec: BoundedVec<Field, 3> = BoundedVec::from_array([]);
    let serialized = empty_vec.serialize();
    let deserialized = BoundedVec::<Field, 3>::deserialize(serialized);
    assert_eq(empty_vec, deserialized);
    assert_eq(deserialized.len(), 0);

    // Test partially filled BoundedVec
    let partial_vec: BoundedVec<[u32; 2], 3> = BoundedVec::from_array([[1, 2]]);
    let serialized = partial_vec.serialize();
    let deserialized = BoundedVec::<[u32; 2], 3>::deserialize(serialized);
    assert_eq(partial_vec, deserialized);
    assert_eq(deserialized.len(), 1);
    assert_eq(deserialized.get(0), [1, 2]);

    // Test full BoundedVec
    let full_vec: BoundedVec<[u32; 2], 3> = BoundedVec::from_array([[1, 2], [3, 4], [5, 6]]);
    let serialized = full_vec.serialize();
    let deserialized = BoundedVec::<[u32; 2], 3>::deserialize(serialized);
    assert_eq(full_vec, deserialized);
    assert_eq(deserialized.len(), 3);
    assert_eq(deserialized.get(0), [1, 2]);
    assert_eq(deserialized.get(1), [3, 4]);
    assert_eq(deserialized.get(2), [5, 6]);
}
