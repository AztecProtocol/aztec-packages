/// Generates the generic parameter declarations for a struct's trait implementation.
///
/// This function takes a struct type definition and generates the generic parameter declarations
/// that go after the `impl` keyword. For example, given a struct with generics `N: u32` and `T`,
/// it generates `<let N: u32, T>`.
///
/// # Parameters
/// - `s`: The struct type definition to generate generic declarations for
///
/// # Returns
/// A quoted code block containing the generic parameter declarations, or an empty quote if the struct
/// has no generic parameters
///
/// # Example
/// For a struct defined as:
/// ```
/// struct Container<T, let N: u32> {
///     items: [T; N],
///     count: u32
/// }
/// ```
///
/// This function generates:
/// ```
/// <let N: u32, T>
/// ```
comptime fn get_generics_declarations(s: TypeDefinition) -> Quoted {
    let generics = s.generics();

    if generics.len() > 0 {
        let generics_declarations_items = generics
            .map(|(name, maybe_integer_typ)| {
                // The second item in the generics tuple is an Option of an integer type that is Some only if
                // the generic is numeric.
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

/// Generates the `where` clause for a trait implementation that constrains non-numeric generic type parameters.
///
/// This function takes a struct type definition and a trait name, and generates a `where` clause that
/// requires all non-numeric generic type parameters to implement the specified trait.
///
/// # Parameters
/// - `s`: The struct type definition to generate the where clause for
/// - `trait_name`: The name of the trait that non-numeric generic parameters must implement
///
/// # Returns
/// A quoted code block containing the where clause, or an empty quote if the struct has no non-numeric
/// generic parameters
///
/// # Example
/// For a struct defined as:
/// ```
/// struct Container<T, let N: u32> {
///     items: [T; N],
///     count: u32
/// }
/// ```
///
/// And trait name "Serialize", this function generates:
/// ```
/// where T: Serialize
/// ```
comptime fn get_where_trait_clause(s: TypeDefinition, trait_name: Quoted) -> Quoted {
    let generics = s.generics();

    // The second item in the generics tuple is an Option of an integer type that is Some only if the generic is
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

    // Generates the generic parameter declarations (to be placed after the `impl` keyword) and the `where` clause
    // for the `Serialize` trait.
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

    // For structs containing a single member, we can enhance performance by directly returning the serialized member,
    // bypassing the need for loop-based array construction. While this optimization yields significant benefits in
    // Brillig where the loops are expected to not be optimized, it is not relevant in ACIR where the loops are
    // expected to be optimized away.
    let function_body = if params.len() > 1 {
        // For multiple struct members, generate serialization code that:
        // 1. Serializes each member
        // 2. Copies the serialized fields into the result array at the correct offset
        // 3. Updates the offset for the next member
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
            let mut result = [0; _];
            let mut offset = 0;

            $serialization_of_struct_members

            result
        }
    } else {
        let param_name = params[0].0;
        quote {
            $crate::traits::Serialize::serialize(self.$param_name)
        }
    };

    quote {
        impl$generics_declarations $crate::traits::Serialize for $typ
            $where_serialize_clause
        {
            let N: u32 = $right_hand_side_of_definition_of_n;

            #[inline_always]
            fn serialize(self) -> [Field; Self::N] {
                $function_body
            }
        }
    }
}

/// Generates a `Deserialize` trait implementation for a given struct `s`.
///
/// # Arguments
/// * `s` - The struct type definition to generate the implementation for
///
/// # Returns
/// A `Quoted` block containing the generated trait implementation
///
/// # Requirements
/// Each struct member type must implement the `Deserialize` trait (it gets used in the generated code).
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
/// impl Deserialize for MyStruct {
///     let N: u32 = <AztecAddress as Deserialize>::N + <Field as Deserialize>::N;
///
///     fn deserialize(serialized: [Field; Self::N]) -> Self {
///         let mut offset = 0;
///         let mut member_fields = [0; <AztecAddress as Deserialize>::N];
///         for i in 0..<AztecAddress as Deserialize>::N {
///             member_fields[i] = serialized[i + offset];
///         }
///         let x = <AztecAddress as Deserialize>::deserialize(member_fields);
///         offset += <AztecAddress as Deserialize>::N;
///
///         let mut member_fields = [0; <Field as Deserialize>::N];
///         for i in 0..<Field as Deserialize>::N {
///             member_fields[i] = serialized[i + offset];
///         }
///         let y = <Field as Deserialize>::deserialize(member_fields);
///         offset += <Field as Deserialize>::N;
///
///         Self { x, y }
///     }
/// }
/// ```
pub(crate) comptime fn derive_deserialize(s: TypeDefinition) -> Quoted {
    let typ = s.as_type();
    let nested_struct = typ.as_data_type().unwrap();
    let params = nested_struct.0.fields(nested_struct.1);

    // Generates the generic parameter declarations (to be placed after the `impl` keyword) and the `where` clause
    // for the `Deserialize` trait.
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

    // For structs containing a single member, we can enhance performance by directly deserializing the input array,
    // bypassing the need for loop-based array construction. While this optimization yields significant benefits in
    // Brillig where the loops are expected to not be optimized, it is not relevant in ACIR where the loops are
    // expected to be optimized away.
    let function_body = if params.len() > 1 {
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
            let mut offset = 0;

            $deserialization_of_struct_members

            Self { $struct_members }
        }
    } else {
        let param_name = params[0].0;
        quote {
            Self { $param_name: $crate::traits::Deserialize::deserialize(serialized) }
        }
    };

    quote {
        impl$generics_declarations $crate::traits::Deserialize for $typ
            $where_deserialize_clause
        {
            let N: u32 = $right_hand_side_of_definition_of_n;

            #[inline_always]
            fn deserialize(serialized: [Field; Self::N]) -> Self {
                $function_body
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

    // Generates the generic parameter declarations (to be placed after the `impl` keyword) and the `where` clause
    // for the `Packable` trait.
    let generics_declarations = get_generics_declarations(s);
    let where_packable_clause = get_where_trait_clause(s, quote {Packable});

    // The following will give us <type_of_struct_member_1 as Packable>::N + <type_of_struct_member_2 as Packable>::N + ...
    let right_hand_side_of_definition_of_n = params
        .map(|(_, param_type, _): (Quoted, Type, Quoted)| {
            quote {
            <$param_type as $crate::traits::Packable>::N
        }
        })
        .join(quote {+});

    // For structs containing a single member, we can enhance performance by directly returning the packed member,
    // bypassing the need for loop-based array construction. While this optimization yields significant benefits in
    // Brillig where the loops are expected to not be optimized, it is not relevant in ACIR where the loops are
    // expected to be optimized away.
    let pack_function_body = if params.len() > 1 {
        // For multiple struct members, generate packing code that:
        // 1. Packs each member
        // 2. Copies the packed fields into the result array at the correct offset
        // 3. Updates the offset for the next member
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

        quote {
            let mut result = [0; Self::N];
            let mut offset = 0;

            $packing_of_struct_members

            result
        }
    } else {
        let param_name = params[0].0;
        quote {
            $crate::traits::Packable::pack(self.$param_name)
        }
    };

    // For structs containing a single member, we can enhance performance by directly unpacking the input array,
    // bypassing the need for loop-based array construction. While this optimization yields significant benefits in
    // Brillig where the loops are expected to not be optimized, it is not relevant in ACIR where the loops are
    // expected to be optimized away.
    let unpack_function_body = if params.len() > 1 {
        // For multiple struct members, generate unpacking code that:
        // 1. Unpacks each member
        // 2. Copies packed fields into member array at correct offset
        // 3. Updates offset for next member
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
            let mut offset = 0;
            $unpacking_of_struct_members
            Self { $struct_members }
        }
    } else {
        let param_name = params[0].0;
        quote {
            Self { $param_name: $crate::traits::Packable::unpack(packed) }
        }
    };

    quote {
        impl$generics_declarations $crate::traits::Packable for $typ
            $where_packable_clause
        {
            let N: u32 = $right_hand_side_of_definition_of_n;

            #[inline_always]
            fn pack(self) -> [Field; Self::N] {
                $pack_function_body
            }

            #[inline_always]
            fn unpack(packed: [Field; Self::N]) -> Self {
                $unpack_function_body
            }
        }
    }
}

mod test {
    use crate::traits::{Deserialize, Packable, Serialize};

    #[derive(Deserialize, Eq, Packable, Serialize)]
    pub struct Smol {
        a: Field,
        b: Field,
    }

    #[derive(Deserialize, Eq, Serialize)]
    pub struct HasArray {
        a: [Field; 2],
        b: bool,
    }

    #[derive(Deserialize, Eq, Serialize)]
    pub struct Fancier {
        a: Smol,
        b: [Field; 2],
        c: [u8; 3],
        d: str<16>,
    }

    #[derive(Deserialize, Eq, Packable, Serialize)]
    pub struct HasArrayWithGenerics<T, let N: u32> {
        pub fields: [T; N],
        pub length: u32,
    }

    #[test]
    fn serde_on_smol() {
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
    fn serde_on_has_array() {
        let has_array = HasArray { a: [1, 2], b: true };
        let serialized = has_array.serialize();
        assert(serialized == [1, 2, 1], serialized);
        let deserialized = HasArray::deserialize(serialized);
        assert(deserialized == has_array);
    }

    #[test]
    fn serde_on_fancier() {
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
    fn serde_on_contains_array_with_generics() {
        let struct_with_array_of_generics = HasArrayWithGenerics { fields: [1, 2, 3], length: 3 };
        let serialized = struct_with_array_of_generics.serialize();
        assert(serialized == [1, 2, 3, 3], serialized);
        let deserialized = HasArrayWithGenerics::deserialize(serialized);
        assert(deserialized == struct_with_array_of_generics);
    }

    #[test]
    fn packable_on_contains_array_with_generics() {
        let struct_with_array_of_generics = HasArrayWithGenerics { fields: [1, 2, 3], length: 3 };
        let packed = struct_with_array_of_generics.pack();
        assert(packed == [1, 2, 3, 3], packed);

        let unpacked = HasArrayWithGenerics::unpack(packed);
        assert(unpacked == struct_with_array_of_generics);
    }

}
