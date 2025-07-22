use super::traits::{Deserialize, Packable, Serialize};

pub comptime fn derive_serialize(s: TypeDefinition) -> Quoted {
    let typ = s.as_type();
    let nested_struct = typ.as_data_type().unwrap();
    let params = nested_struct.0.fields(nested_struct.1);

    // The following will give us <type_of_struct_member_1 as Serialize>::N + <type_of_struct_member_2 as Serialize>::N + ...
    let right_hand_side_of_definition_of_n = params
        .map(|(_, param_type, _): (Quoted, Type, Quoted)| {
            quote {
            <$param_type as $crate::traits::Serialize>::N
        }
        })
        .join(quote {+});

    // Generates serialization code for each struct member that:
    // 1. Serializes the member
    // 2. Copies serialized fields into result array at correct offset
    // 3. Updates offset for next member
    let serialization_of_struct_members = params
        .map(|(param_name, param_type, _): (Quoted, Type, Quoted)| {
            quote {
                let serialized_member = $crate::traits::Serialize::serialize(self.$param_name);
                let serialized_member_len = <$param_type as $crate::traits::Serialize>::N;
                for i in 0..serialized_member_len {
                    result[i + offset] = serialized_member[i];
                }
                offset += serialized_member_len;
            }
        })
        .join(quote {});

    quote {
        impl $crate::traits::Serialize for $typ {
            let N: u32 = $right_hand_side_of_definition_of_n;

            #[inline_always]
            fn serialize(self) -> [Field; Self::N] {
                let mut result = [0; _];
                let mut offset = 0;

                $serialization_of_struct_members

                result
            }
        }
    }
}

pub(crate) comptime fn derive_deserialize(s: TypeDefinition) -> Quoted {
    let typ = s.as_type();
    let nested_struct = typ.as_data_type().unwrap();
    let params = nested_struct.0.fields(nested_struct.1);

    // The following will give us <type_of_struct_member_1 as Deserialize>::N + <type_of_struct_member_2 as Deserialize>::N + ...
    let right_hand_side_of_definition_of_n = params
        .map(|(_, param_type, _): (Quoted, Type, Quoted)| {
            quote {
            <$param_type as $crate::traits::Deserialize>::N
        }
        })
        .join(quote {+});

    // This generates deserialization code for each struct member that and concatenates them together.
    let deserialization_of_struct_members = params
        .map(|(param_name, param_type, _): (Quoted, Type, Quoted)| {
            quote {
                let mut member_fields = [0; <$param_type as Deserialize>::N];
                for i in 0..<$param_type as Deserialize>::N {
                    member_fields[i] = serialized[i + offset];
                }
                let $param_name = <$param_type as Deserialize>::deserialize(member_fields);
                offset += <$param_type as Deserialize>::N;
            }
        })
        .join(quote {});

    // We join the struct member names with a comma to be used in the `Self { ... }` syntax
    // This will give us e.g. `a, b, c` for a struct with three fields named `a`, `b`, and `c`.
    let struct_members = params
        .map(|(param_name, _, _): (Quoted, Type, Quoted)| quote { $param_name })
        .join(quote {,});

    quote {
        impl $crate::traits::Deserialize for $typ {
            let N: u32 = $right_hand_side_of_definition_of_n;

            #[inline_always]
            fn deserialize(serialized: [Field; Self::N]) -> Self {
                let mut offset = 0;

                $deserialization_of_struct_members

                Self { $struct_members }
            }
        }
    }
}

/// Generates a `Packable` trait implementation for a given struct `s`.
///
/// # Arguments
/// * `s` - The struct type definition to generate the implementation for
///
/// # Returns
/// A `Quoted` block containing the generated trait implementation
///
/// # Requirements
/// Each struct member type must implement the `Packable` trait (it gets used in the generated code).
///
/// # Example
/// For a struct like:
/// ```
/// struct MyStruct {
///     x: AztecAddress,
///     y: Field,
/// }
/// ```
///
/// This generates:
/// ```
/// impl Packable for MyStruct {
///     let N: u32 = 2;
///
///     fn pack(self) -> [Field; 2] {
///         let mut result: [Field; 2] = [0_Field; 2];
///         let mut offset: u32 = 0_u32;
///         let packed_member: [Field; 1] = self.x.pack();
///         let packed_member_len: u32 = <Field as Packable>::N;
///         for i in 0_u32..packed_member_len {
///             {
///                 result[i + offset] = packed_member[i];
///             }
///         }
///         offset = offset + packed_member_len;
///         let packed_member: [Field; 1] = self.y.pack();
///         let packed_member_len: u32 = <Field as Packable>::N;
///         for i in 0_u32..packed_member_len {
///             {
///                 result[i + offset] = packed_member[i];
///             }
///         }
///         offset = offset + packed_member_len;
///         result
///     }
///
///     fn unpack(packed: [Field; 2]) -> Self {
///         let mut offset: u32 = 0_u32;
///         let mut member_fields: [Field; 1] = [0_Field; 1];
///         for i in 0_u32..<AztecAddress as Packable>::N {
///             member_fields[i] = packed[i + offset];
///         }
///         let x: AztecAddress = <AztecAddress as Packable>::unpack(member_fields);
///         offset = offset + <AztecAddress as Packable>::N;
///         let mut member_fields: [Field; 1] = [0_Field; 1];
///         for i in 0_u32..<Field as Packable>::N {
///             member_fields[i] = packed[i + offset];
///         }
///         let y: Field = <Field as Packable>::unpack(member_fields);
///         offset = offset + <Field as Packable>::N;
///         Self { x: x, y: y }
///     }
/// }
/// ```
pub comptime fn derive_packable(s: TypeDefinition) -> Quoted {
    let typ = s.as_type();
    let nested_struct = typ.as_data_type().unwrap();
    let params = nested_struct.0.fields(nested_struct.1);

    // The following will give us <type_of_struct_member_1 as Packable>::N + <type_of_struct_member_2 as Packable>::N + ...
    let right_hand_side_of_definition_of_n = params
        .map(|(_, param_type, _): (Quoted, Type, Quoted)| {
            quote {
            <$param_type as $crate::traits::Packable>::N
        }
        })
        .join(quote {+});

    // Generates packing code for each struct member that:
    // 1. Packs the member
    // 2. Copies packed fields into result array at correct offset
    // 3. Updates offset for next member
    let packing_of_struct_members = params
        .map(|(param_name, param_type, _): (Quoted, Type, Quoted)| {
            quote {
                let packed_member = $crate::traits::Packable::pack(self.$param_name);
                let packed_member_len = <$param_type as $crate::traits::Packable>::N;
                for i in 0..packed_member_len {
                    result[i + offset] = packed_member[i];
                }
                offset += packed_member_len;
            }
        })
        .join(quote {});

    // This generates unpacking code for each struct member and concatenates them together.
    let unpacking_of_struct_members = params
        .map(|(param_name, param_type, _): (Quoted, Type, Quoted)| {
            quote {
                let mut member_fields = [0; <$param_type as $crate::traits::Packable>::N];
                for i in 0..<$param_type as $crate::traits::Packable>::N {
                    member_fields[i] = packed[i + offset];
                }
                let $param_name = <$param_type as $crate::traits::Packable>::unpack(member_fields);
                offset += <$param_type as $crate::traits::Packable>::N;
            }
        })
        .join(quote {});

    // We join the struct member names with a comma to be used in the `Self { ... }` syntax
    let struct_members = params
        .map(|(param_name, _, _): (Quoted, Type, Quoted)| quote { $param_name })
        .join(quote {,});

    quote {
        impl $crate::traits::Packable for $typ {
            let N: u32 = $right_hand_side_of_definition_of_n;

            fn pack(self) -> [Field; Self::N] {
                let mut result = [0; Self::N];
                let mut offset = 0;

                $packing_of_struct_members

                result
            }

            fn unpack(packed: [Field; Self::N]) -> Self {
                let mut offset = 0;

                $unpacking_of_struct_members

                Self { $struct_members }
            }
        }
    }
}

#[derive(Packable, Serialize, Deserialize, Eq)]
pub struct Smol {
    a: Field,
    b: Field,
}

#[derive(Serialize, Deserialize, Eq)]
pub struct HasArray {
    a: [Field; 2],
    b: bool,
}

#[derive(Serialize, Deserialize, Eq)]
pub struct Fancier {
    a: Smol,
    b: [Field; 2],
    c: [u8; 3],
    d: str<16>,
}

fn main() {
    assert(false);
}

#[test]
fn smol_test() {
    let smol = Smol { a: 1, b: 2 };
    let serialized = smol.serialize();
    assert(serialized == [1, 2], serialized);
    let deserialized = Smol::deserialize(serialized);
    assert(deserialized == smol);

    // None of the struct members implements the `Packable` trait so the packed and serialized data should be the same
    let packed = smol.pack();
    assert_eq(packed, serialized, "Packed does not match serialized");
}

#[test]
fn has_array_test() {
    let has_array = HasArray { a: [1, 2], b: true };
    let serialized = has_array.serialize();
    assert(serialized == [1, 2, 1], serialized);
    let deserialized = HasArray::deserialize(serialized);
    assert(deserialized == has_array);
}

#[test]
fn fancier_test() {
    let fancier =
        Fancier { a: Smol { a: 1, b: 2 }, b: [0, 1], c: [1, 2, 3], d: "metaprogramming!" };
    let serialized = fancier.serialize();
    assert(
        serialized
            == [
                1, 2, 0, 1, 1, 2, 3, 0x6d, 0x65, 0x74, 0x61, 0x70, 0x72, 0x6f, 0x67, 0x72, 0x61,
                0x6d, 0x6d, 0x69, 0x6e, 0x67, 0x21,
            ],
        serialized,
    );
    let deserialized = Fancier::deserialize(serialized);
    assert(deserialized == fancier);
}
