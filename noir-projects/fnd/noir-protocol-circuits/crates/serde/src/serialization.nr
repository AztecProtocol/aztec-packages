use crate::{reader::Reader, writer::Writer};
use std::meta::type_def::StructField;

/// Trait for serializing Noir types into arrays of Fields.
///
/// An implementation of the Serialize trait has to follow Noir's intrinsic serialization (each member of a struct
/// converted directly into one or more Fields without any packing or compression). This trait (and Deserialize) are
/// typically used to communicate between Noir and TypeScript (via oracles and function arguments).
///
/// # On Following Noir's Intrinsic Serialization
/// When calling a Noir function from TypeScript (TS), first the function arguments are serialized into an array
/// of fields. This array is then included in the initial witness. Noir's intrinsic serialization is then used
/// to deserialize the arguments from the witness. When the same Noir function is called from Noir this Serialize trait
/// is used instead of the serialization in TS. For this reason we need to have a match between TS serialization,
/// Noir's intrinsic serialization and the implementation of this trait. If there is a mismatch, the function calls
/// fail with an arguments hash mismatch error message.
///
/// # Associated Constants
/// * `N` - The length of the output Field array, known at compile time
///
/// # Example
/// ```
/// impl<let N: u32> Serialize for str<N> {
///     let N: u32 = N;
///
///     fn serialize(self) -> [Field; Self::N] {
///         let mut writer: Writer<Self::N> = Writer::new();
///         self.stream_serialize(&mut writer);
///         writer.finish()
///     }
///
///     fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
///         let bytes = self.as_bytes();
///         for i in 0..bytes.len() {
///             writer.write(bytes[i] as Field);
///         }
///     }
/// }
/// ```
#[derive_via(derive_serialize)]
pub trait Serialize {
    let N: u32;

    fn serialize(self) -> [Field; Self::N];

    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>);
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
///     fn serialize(self) -> [Field; Self::N] {
///         let mut writer: Writer<Self::N> = Writer::new();
///         self.stream_serialize(&mut writer);
///         writer.finish()
///     }
///
///     #[inline_always]
///     fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
///         Serialize::stream_serialize(self.fields, writer);
///         Serialize::stream_serialize(self.length, writer);
///     }
/// }
/// ```
pub comptime fn derive_serialize(s: TypeDefinition) -> Quoted {
    let typ = s.as_type();
    let nested_struct = typ.as_data_type().unwrap();
    let params = nested_struct.definition().fields(nested_struct.generics());

    // Generates the generic parameter declarations (to be placed after the `impl` keyword) and the `where` clause
    // for the `Serialize` trait.
    let generics_declarations = get_generics_declarations(s);
    let where_serialize_clause = get_where_trait_clause(s, quote { Serialize });

    let params_len_quote = get_params_len_quote(params);

    let function_body = params
        .map(|field: StructField| {
            let name = field.name();
            quote {
                $crate::serialization::Serialize::stream_serialize(self.$name, writer);
            }
        })
        .join(quote {});

    quote {
        impl$generics_declarations $crate::serialization::Serialize for $typ
            $where_serialize_clause
        {
            let N: u32 = $params_len_quote;


            fn serialize(self) -> [Field; Self::N] {
                let mut writer: $crate::writer::Writer<Self::N> = $crate::writer::Writer::new();
                $crate::serialization::Serialize::stream_serialize(self, &mut writer);
                writer.finish()
            }


            #[inline_always]
             fn stream_serialize<let K: u32>(self, writer: &mut $crate::writer::Writer<K>) {
                $function_body
            }
        }
    }
}

/// Trait for deserializing Noir types from arrays of Fields.
///
/// An implementation of the Deserialize trait has to follow Noir's intrinsic serialization (each member of a struct
/// converted directly into one or more Fields without any packing or compression). This trait is typically used when
/// deserializing return values from function calls in Noir. Since the same function could be called from TypeScript
/// (TS), in which case the TS deserialization would get used, we need to have a match between the 2.
///
/// # Associated Constants
/// * `N` - The length of the input Field array, known at compile time
///
/// # Example
/// ```
/// impl<let M: u32> Deserialize for str<M> {
///     let N: u32 = M;
///
///     fn deserialize(fields: [Field; Self::N]) -> Self {
///         let mut reader = Reader::new(fields);
///         let result = Self::stream_deserialize(&mut reader);
///         reader.finish();
///         result
///     }
///
///     fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
///         let mut bytes = [0 as u8; M];
///         for i in 0..M {
///             bytes[i] = reader.read() as u8;
///         }
///         str::<M>::from(bytes)
///     }
/// }
/// ```
#[derive_via(derive_deserialize)]
pub trait Deserialize {
    let N: u32;

    fn deserialize(fields: [Field; Self::N]) -> Self;

    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self;
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
///     fn deserialize(fields: [Field; Self::N]) -> Self {
///         let mut reader = Reader::new(fields);
///         let result = Self::stream_deserialize(&mut reader);
///         reader.finish();
///         result
///     }
///
///     #[inline_always]
///     fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
///         let x = <AztecAddress as Deserialize>::stream_deserialize(reader);
///         let y = <Field as Deserialize>::stream_deserialize(reader);
///         Self { x, y }
///     }
/// }
/// ```
pub comptime fn derive_deserialize(s: TypeDefinition) -> Quoted {
    let typ = s.as_type();
    let nested_struct = typ.as_data_type().unwrap();
    let params = nested_struct.definition().fields(nested_struct.generics());

    // Generates the generic parameter declarations (to be placed after the `impl` keyword) and the `where` clause
    // for the `Deserialize` trait.
    let generics_declarations = get_generics_declarations(s);
    let where_deserialize_clause = get_where_trait_clause(s, quote { Deserialize });

    // The following will give us:
    // <type_of_struct_member_1 as Deserialize>::N + <type_of_struct_member_2 as Deserialize>::N + ...
    // (or 0 if the struct has no members)
    let right_hand_side_of_definition_of_n = if params.len() > 0 {
        params
            .map(|field: StructField| {
                let param_type = field.typ();
                quote {
            <$param_type as $crate::serialization::Deserialize>::N
        }
            })
            .join(quote {+})
    } else {
        quote { 0 }
    };

    // For structs containing a single member, we can enhance performance by directly deserializing the input array,
    // bypassing the need for loop-based array construction. While this optimization yields significant benefits in
    // Brillig where the loops are expected to not be optimized, it is not relevant in ACIR where the loops are
    // expected to be optimized away.
    let function_body = if params.len() > 1 {
        // This generates deserialization code for each struct member and concatenates them together.
        let deserialization_of_struct_members = params
            .map(|field: StructField| {
                let param_name = field.name();
                let param_type = field.typ();
                quote {
                    let $param_name = <$param_type as Deserialize>::stream_deserialize(reader);
                }
            })
            .join(quote {});

        // We join the struct member names with a comma to be used in the `Self { ... }` syntax
        // This will give us e.g. `a, b, c` for a struct with three fields named `a`, `b`, and `c`.
        let struct_members = params
            .map(|field: StructField| {
                let param_name = field.name();
                quote { $param_name }
            })
            .join(quote {,});

        quote {
            $deserialization_of_struct_members

            Self { $struct_members }
        }
    } else if params.len() == 1 {
        let param_name = params[0].name();
        quote {
            Self { $param_name: $crate::serialization::Deserialize::stream_deserialize(reader) }
        }
    } else {
        quote {
            Self {}
        }
    };

    quote {
        impl$generics_declarations $crate::serialization::Deserialize for $typ
            $where_deserialize_clause
        {
            let N: u32 = $right_hand_side_of_definition_of_n;

            fn deserialize(fields: [Field; Self::N]) -> Self {
                let mut reader = $crate::reader::Reader::new(fields);
                let result = Self::stream_deserialize(&mut reader);
                reader.finish();
                result
            }

            #[inline_always]
            fn stream_deserialize<let K: u32>(reader: &mut $crate::reader::Reader<K>) -> Self {
                $function_body
            }
        }
    }
}

/// Generates a quoted expression that computes the total serialized length of function parameters.
///
/// # Parameters
/// * `params` - The struct fields to serialize. Each field's type needs to implement the Serialize trait.
///
/// # Returns
/// A quoted expression that evaluates to:
/// * `0` if there are no parameters
/// * `(<type1 as Serialize>::N + <type2 as Serialize>::N + ...)` for one or more parameters
comptime fn get_params_len_quote(params: [StructField]) -> Quoted {
    if params.len() == 0 {
        quote { 0 }
    } else {
        let params_quote_without_parentheses = params
            .map(|field: StructField| {
                let param_type = field.typ();
                quote {
                    <$param_type as $crate::serialization::Serialize>::N
                }
            })
            .join(quote {+});
        quote { ($params_quote_without_parentheses) }
    }
}

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
