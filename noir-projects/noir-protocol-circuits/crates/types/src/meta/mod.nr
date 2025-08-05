comptime fn get_generics_declarations(s: TypeDefinition) -> Quoted {
    let generics = s.generics();

    // Constructs the "<let N: u32, let M: u8>" string that is injected after the "impl" keyword in e.g.
    // "impl<let N: u32, let M: u8> Serialize for Foo<N, M>".
    // Returns an empty quote if the struct has no generics.
    if generics.len() > 0 {
        let generics_declarations_items = generics
            .map(|(name, maybe_integer_typ)| {
                // The second item in the generics tuple is an Option of an integer type that is Some if the generic is
                //numeric.
                if maybe_integer_typ.is_some() {
                    // The generic is numeric, so we return a quote defined as e.g. "let N: u32"
                    let integer_type = maybe_integer_typ.unwrap();
                    quote {let $name: $integer_type}
                } else {
                    // The generic is not numeric, so we return a quote containing the name of the generic (e.g. "T")
                    quote {$name}
                }
            })
            .join(quote {,});
        quote {<$generics_declarations_items>}
    } else {
        // The struct doesn't have any generics defined, so we just return an empty quote.
        quote {}
    }
}

comptime fn get_where_trait_clause(s: TypeDefinition, trait_name: Quoted) -> Quoted {
    let generics = s.generics();

    // The second item in the generics tuple is an Option of an integer type that is Some if the generic is
    // numeric.
    let non_numeric_generics =
        generics.filter(|(_, maybe_integer_typ)| maybe_integer_typ.is_none());

    if non_numeric_generics.len() > 0 {
        let non_numeric_generics_declarations =
            non_numeric_generics.map(|(name, _)| quote {$name: $trait_name}).join(quote {,});
        quote {where $non_numeric_generics_declarations}
    } else {
        // There are no non-numeric generics, so we return an empty quote.
        quote {}
    }
}

/// Generates a `Serialize` trait implementation for a struct type.
///
/// # Parameters
/// - `s`: The struct type definition to generate the implementation for
///
/// # Returns
/// A quoted code block containing the trait implementation
///
/// # Example
/// For a struct defined as:
/// ```
/// struct Log<N> {
///     fields: [Field; N],
///     length: u32
/// }
/// ```
///
/// This function generates code equivalent to:
/// ```
/// impl<let N: u32> Serialize for Log<N> {
///     let N: u32 = <[Field; N] as Serialize>::N + <u32 as Serialize>::N;
///
///     #[inline_always]
///     fn serialize(self) -> [Field; Self::N] {
///         let mut result = [0; _];
///         let mut offset = 0;
///
///         let serialized_member = Serialize::serialize(self.fields);
///         let serialized_member_len = <[Field; N] as Serialize>::N;
///         for i in 0..serialized_member_len {
///             result[i + offset] = serialized_member[i];
///         }
///         offset += serialized_member_len;
///
///         let serialized_member = Serialize::serialize(self.length);
///         let serialized_member_len = <u32 as Serialize>::N;
///         for i in 0..serialized_member_len {
///             result[i + offset] = serialized_member[i];
///         }
///         offset += serialized_member_len;
///
///         result
///     }
/// }
/// ```
pub comptime fn derive_serialize(s: TypeDefinition) -> Quoted {
    let typ = s.as_type();
    let nested_struct = typ.as_data_type().unwrap();
    let params = nested_struct.0.fields(nested_struct.1);

    let generics_declarations = get_generics_declarations(s);
    let where_serialize_clause = get_where_trait_clause(s, quote {Serialize});

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
        impl$generics_declarations $crate::traits::Serialize for $typ
            $where_serialize_clause
        {
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

    let generics_declarations = get_generics_declarations(s);
    let where_deserialize_clause = get_where_trait_clause(s, quote {Deserialize});

    // The following will give us <type_of_struct_member_1 as Deserialize>::N + <type_of_struct_member_2 as Deserialize>::N + ...
    let right_hand_side_of_definition_of_n = params
        .map(|(_, param_type, _): (Quoted, Type, Quoted)| {
            quote {
            <$param_type as $crate::traits::Deserialize>::N
        }
        })
        .join(quote {+});

    // This generates deserialization code for each struct member and concatenates them together.
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
        impl$generics_declarations $crate::traits::Deserialize for $typ
            $where_deserialize_clause
        {
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

mod test {

    use crate::traits::{Deserialize, Packable, Serialize};

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

    #[derive(Serialize, Deserialize, Eq)]
    pub struct ContainsArrayWithGenerics<T, let N: u32> {
        pub fields: [T; N],
        pub length: u32,
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

    #[test]
    fn struct_with_array_of_generics_test() {
        let struct_with_array_of_generics =
            ContainsArrayWithGenerics { fields: [1, 2, 3], length: 3 };
        let serialized = struct_with_array_of_generics.serialize();
        assert(serialized == [1, 2, 3, 3], serialized);
        let deserialized = ContainsArrayWithGenerics::deserialize(serialized);
        assert(deserialized == struct_with_array_of_generics);
    }

}
