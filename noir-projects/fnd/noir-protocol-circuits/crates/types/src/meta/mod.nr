pub use serde::serialization::{derive_deserialize, derive_serialize};
use std::meta::type_def::StructField;

pub mod utils;

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
            .map(|generic| {
                let name = generic.typ();
                let maybe_integer_typ = generic.numeric_type();
                // numeric_type is Some only when the generic is numeric.
                if maybe_integer_typ.is_some() {
                    // The generic is numeric, so we return a quote defined as e.g. "let N: u32"
                    let integer_type = maybe_integer_typ.unwrap();
                    quote {let $name: $integer_type}
                } else {
                    // The generic is not numeric, so we return a quote containing the name of the generic (e.g. "T")
                    quote { $name }
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

    // numeric_type is Some only when the generic is numeric.
    let non_numeric_generics = generics.filter(|generic| generic.numeric_type().is_none());

    if non_numeric_generics.len() > 0 {
        let non_numeric_generics_declarations = non_numeric_generics
            .map(|generic| {
                let name = generic.typ();
                quote {$name: $trait_name}
            })
            .join(quote {,});
        quote {where $non_numeric_generics_declarations}
    } else {
        // There are no non-numeric generics, so we return an empty quote.
        quote {}
    }
}

/// Generates a [`Packable`](crate::traits::Packable) trait implementation for a given struct `s`.
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
    let params = nested_struct.definition().fields(nested_struct.generics());

    // Generates the generic parameter declarations (to be placed after the `impl` keyword) and the `where` clause
    // for the `Packable` trait.
    let generics_declarations = get_generics_declarations(s);
    let where_packable_clause = get_where_trait_clause(s, quote { Packable });

    // The following will give us:
    // <type_of_struct_member_1 as Packable>::N + <type_of_struct_member_2 as Packable>::N + ...
    // (or 0 if the struct has no members)
    let right_hand_side_of_definition_of_n = if params.len() > 0 {
        params
            .map(|field: StructField| {
                let param_type = field.typ();
                quote {
            <$param_type as $crate::traits::Packable>::N
        }
            })
            .join(quote {+})
    } else {
        quote { 0 }
    };

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
            .map(|field: StructField| {
                let param_name = field.name();
                let param_type = field.typ();
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
    } else if params.len() == 1 {
        let param_name = params[0].name();
        quote {
            $crate::traits::Packable::pack(self.$param_name)
        }
    } else {
        quote {
            [0; Self::N]
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
            .map(|field: StructField| {
                let param_name = field.name();
                let param_type = field.typ();
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
            .map(|field: StructField| {
                let param_name = field.name();
                quote { $param_name }
            })
            .join(quote {,});

        quote {
            let mut offset = 0;
            $unpacking_of_struct_members
            Self { $struct_members }
        }
    } else if params.len() == 1 {
        let param_name = params[0].name();
        quote {
            Self { $param_name: $crate::traits::Packable::unpack(packed) }
        }
    } else {
        quote {
            Self {}
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
    pub struct Empty {}

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
    fn packable_on_empty() {
        let original = Empty {};
        let packed = original.pack();
        assert_eq(packed, [], "Packed does not match empty array");
        let unpacked = Empty::unpack(packed);
        assert_eq(unpacked, original, "Unpacked does not match original");
    }

    #[test]
    fn packable_on_smol() {
        let smol = Smol { a: 1, b: 2 };
        let serialized = smol.serialize();
        assert(serialized == [1, 2], serialized);

        // None of the struct members implements the `Packable` trait so the packed and serialized data should be the same
        let packed = smol.pack();
        assert_eq(packed, serialized, "Packed does not match serialized");
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
