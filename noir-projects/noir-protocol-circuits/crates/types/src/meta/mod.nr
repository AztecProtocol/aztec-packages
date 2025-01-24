use super::traits::{Deserialize, Serialize};

/// Generates code that deserializes a struct, primitive type, array or string from a field array.
///
/// # Parameters
/// - `name`: The name of the current field being processed, used to identify fields for replacement.
/// - `typ`: The type of the struct or field being deserialized (e.g., a custom struct, array, or primitive).
/// - `field_array_name`: The name of the field array containing serialized field data (e.g., `"values"`).
/// - `num_already_consumed`: The number of fields already processed in previous recursion calls.
/// - `to_replace`: The name of a specific field that should be replaced during deserialization.
/// - `ro_replace_with`: The value to replace the `to_replace` field with (e.g., `NoteHeader::empty()`).
///
/// # Returns
/// A tuple containing:
/// - `Quoted`: A code that deserializes a given struct, primitive type, array, or string from the field array.
/// - `u32`: The total number of fields consumed during deserialization (used for recursion).
///
/// # Nested Struct Example
/// Given the following setup:
/// ```
/// struct UintNote {
///     value: U128,
///     owner: AztecAddress,
///     randomness: Field,
///     header: NoteHeader,
/// }
///
/// struct U128 {
///     lo: Field,
///     hi: Field,
/// }
///
/// struct AztecAddress {
///     inner: Field,
/// }
/// ```
///
/// If `UintNote` is the input type, and `header` is replaced with `NoteHeader::empty()`,
/// the function will generate the following deserialization code:
/// ```
/// UintNote {
///     value: U128 {
///         lo: fields[0],     // First field becomes low part of U128
///         hi: fields[1],     // Second field becomes high part of U128
///     },
///     owner: AztecAddress {
///         inner: fields[2],  // Third field becomes inner address
///     },
///     randomness: fields[3], // Fourth field as randomness
///     header: NoteHeader::empty() // Default/empty header
/// }
/// ```
///
/// # Panics
/// - If the deserialization logic encounters a type it does not support.
/// - If an incorrect number of fields are consumed when deserializing a string.
pub comptime fn generate_deserialize_from_fields<N>(
    name: Quoted,
    typ: Type,
    field_array_name: Quoted,
    num_already_consumed: u32,
    to_replace: Quoted,
    ro_replace_with: Quoted,
) -> (Quoted, u32) {
    let mut result = quote {};
    // Counter for the number of fields consumed
    let mut consumed_counter: u32 = 0;

    // Check if there is a replacement for the currently processed field
    if name == to_replace {
        // The currently processed field should be replaced so we do so
        result = ro_replace_with;
    } else {
        if typ.is_field() | typ.as_integer().is_some() | typ.is_bool() {
            // The field is a primitive so we just reference it in the field array
            result = quote { $field_array_name[$num_already_consumed] as $typ };
            consumed_counter = 1;
        } else if typ.as_struct().is_some() {
            // The field is a struct so we iterate over each struct field and recursively call
            // `generate_deserialize_from_fields`
            let (nested_def, generics) = typ.as_struct().unwrap();
            let nested_name = nested_def.name();
            let mut deserialized_fields_list = &[];

            // Iterate over each field in the struct
            for field in nested_def.fields(generics) {
                let (field_name, field_type) = field;
                // Recursively call `generate_deserialize_from_fields` for each field in the struct
                let (deserialized_field, num_consumed_in_recursion) = generate_deserialize_from_fields(
                    field_name,
                    field_type,
                    field_array_name,
                    consumed_counter + num_already_consumed,
                    to_replace,
                    ro_replace_with,
                );
                // We increment the consumed counter by the number of fields consumed in the recursion
                consumed_counter += num_consumed_in_recursion;
                // We add the deserialized field to the list of deserialized fields.
                // E.g. `value: U128 { lo: fields[0], hi: fields[1] }`
                deserialized_fields_list =
                    deserialized_fields_list.push_back(quote { $field_name: $deserialized_field });
            }

            // We can construct the struct from the deserialized fields
            let deserialized_fields = deserialized_fields_list.join(quote {,});
            result = quote {
                $nested_name {
                    $deserialized_fields
                }
            };
        } else if typ.as_array().is_some() {
            // The field is an array so we iterate over each element and recursively call
            // `generate_deserialize_from_fields`
            let (element_type, array_len) = typ.as_array().unwrap();
            let array_len = array_len.as_constant().unwrap();
            let mut array_fields_list = &[];

            // Iterate over each element in the array
            for _ in 0..array_len {
                // Recursively call `generate_deserialize_from_fields` for each element in the array
                let (deserialized_field, num_consumed_in_recursion) = generate_deserialize_from_fields(
                    name,
                    element_type,
                    field_array_name,
                    consumed_counter + num_already_consumed,
                    to_replace,
                    ro_replace_with,
                );
                // We increment the consumed counter by the number of fields consumed in the recursion
                consumed_counter += num_consumed_in_recursion;
                // We add the deserialized field to the list of deserialized fields.
                array_fields_list = array_fields_list.push_back(deserialized_field);
            }

            // We can construct the array from the deserialized fields
            let array_fields = array_fields_list.join(quote {,});
            result = quote { [ $array_fields ] };
        } else if typ.as_str().is_some() {
            // The field is a string and we expect each byte of the string to be represented as 1 field in the field
            // array. So we iterate over the string length and deserialize each character as u8 in the recursive call
            // to `generate_deserialize_from_fields`.
            let length_type = typ.as_str().unwrap();
            let str_len = length_type.as_constant().unwrap();
            let mut byte_list = &[];

            // Iterate over each character in the string
            for _ in 0..str_len {
                // Recursively call `generate_deserialize_from_fields` for each character in the string
                let (deserialized_field, num_consumed_in_recursion) = generate_deserialize_from_fields(
                    name,
                    quote {u8}.as_type(),
                    field_array_name,
                    consumed_counter + num_already_consumed,
                    to_replace,
                    ro_replace_with,
                );

                // We should consume just one field in the recursion so we sanity check that
                assert_eq(
                    num_consumed_in_recursion,
                    1,
                    "Incorrect number of fields consumed in string deserialization",
                );

                // We increment the consumed counter by 1 as we have consumed one field
                consumed_counter += 1;

                // We add the deserialized field to the list of deserialized fields.
                // E.g. `fields[6] as u8`
                byte_list = byte_list.push_back(deserialized_field);
            }

            // We construct the string from the deserialized fields
            let bytes = byte_list.join(quote {,});
            result = quote { [ $bytes ].as_str_unchecked() };
        } else {
            panic(
                f"Unsupported type for serialization of argument {name} and type {typ}",
            )
        }
    }

    (result, consumed_counter)
}

/// Generates code that serializes a type into an array of fields. Also generates auxiliary variables if necessary
/// for serialization.
///
/// # Parameters
/// - `name`: The base identifier (e.g., `self`, `some_var`).
/// - `typ`: The type being serialized (e.g., a custom struct, array, or primitive type).
/// - `omit`: A list of field names (as `Quoted`) to be excluded from the serialized output.
///
/// # Returns
/// A tuple containing:
/// - A flattened array of `Quoted` field references representing the serialized fields.
/// - An array of `Quoted` auxiliary variables needed for serialization, such as byte arrays for strings.
///
/// # Examples
///
/// ## Struct
/// Given the following struct:
/// ```rust
/// struct U128 {
///     lo: Field,
///     hi: Field,
/// }
/// ```
///
/// Serializing the struct:
/// ```rust
/// generate_serialize_to_fields(quote { my_u128 }, U128, &[])
/// // Returns:
/// // ([`my_u128.lo`, `my_u128.hi`], [])
/// ```
///
/// ## Nested Struct with Omitted Field
/// For a more complex struct:
/// ```rust
/// struct UintNote {
///     value: U128,
///     randomness: Field,
///     header: NoteHeader,
/// }
/// ```
///
/// Serializing while omitting `header`:
/// ```rust
/// generate_serialize_to_fields(quote { self }, UintNote, &[quote { self.header }])
/// // Returns:
/// // ([`self.value.lo`, `self.value.hi`, `self.randomness`], [])
/// ```
///
/// ## Array
/// For an array type:
/// ```rust
/// generate_serialize_to_fields(quote { my_array }, [Field; 3], &[])
/// // Returns:
/// // ([`my_array[0]`, `my_array[1]`, `my_array[2]`], [])
/// ```
///
/// ## String
/// For a string field, where each character is serialized as a `Field`:
/// ```rust
/// generate_serialize_to_fields(quote { my_string }, StringType, &[])
/// // Returns:
/// // ([`my_string_as_bytes[0] as Field`, `my_string_as_bytes[1] as Field`, ...],
/// // [`let my_string_as_bytes = my_string.as_bytes()`])
/// ```
///
/// # Panics
/// - If the type is unsupported for serialization.
/// - If the provided `typ` contains invalid constants or incompatible structures.
pub comptime fn generate_serialize_to_fields(
    name: Quoted,
    typ: Type,
    omit: [Quoted],
) -> ([Quoted], [Quoted]) {
    let mut fields = &[];
    let mut aux_vars = &[];

    // Proceed if none of the omit rules omits this name
    if !omit.any(|to_omit| to_omit == name) {
        if typ.is_field() {
            // For field we just add the value to fields
            fields = fields.push_back(name);
        } else if typ.as_integer().is_some() | typ.is_bool() {
            // For integer and bool we just cast to Field and add the value to fields
            fields = fields.push_back(quote { $name as Field });
        } else if typ.as_struct().is_some() {
            // For struct we pref
            let nested_struct = typ.as_struct().unwrap();
            let params = nested_struct.0.fields(nested_struct.1);
            let struct_flattened = params.map(|(param_name, param_type): (Quoted, Type)| {
                let maybe_prefixed_name = if name == quote {} {
                    // Triggered when the param name is of a value available in the current scope (e.g. a function
                    // argument) --> then we don't prefix the name with anything.
                    param_name
                } else {
                    // Triggered when we want to prefix the param name with the `name` from function input. This
                    // can typically be `self` when implementing a method on a struct.
                    quote { $name.$param_name }
                };
                generate_serialize_to_fields(quote {$maybe_prefixed_name}, param_type, omit)
            });
            let struct_flattened_fields = struct_flattened.fold(
                &[],
                |acc: [Quoted], (fields, _): (_, [Quoted])| acc.append(fields),
            );
            let struct_flattened_aux_vars = struct_flattened.fold(
                &[],
                |acc: [Quoted], (_, aux_vars): ([Quoted], _)| acc.append(aux_vars),
            );
            fields = fields.append(struct_flattened_fields);
            aux_vars = aux_vars.append(struct_flattened_aux_vars);
        } else if typ.as_array().is_some() {
            // For array we recursively call generate_serialize_to_fields for each element
            let (element_type, array_len) = typ.as_array().unwrap();
            let array_len = array_len.as_constant().unwrap();
            for i in 0..array_len {
                let (element_fields, element_aux_vars) =
                    generate_serialize_to_fields(quote { $name[$i] }, element_type, omit);
                fields = fields.append(element_fields);
                aux_vars = aux_vars.append(element_aux_vars);
            }
        } else if typ.as_str().is_some() {
            // For string we convert the value to bytes, we store the `as_bytes` in an auxiliary variables and
            // then we add each byte to fields as a Field
            let length_type = typ.as_str().unwrap();
            let str_len = length_type.as_constant().unwrap();
            let as_member = name.as_expr().unwrap().as_member_access();
            let var_name = if as_member.is_some() {
                as_member.unwrap().1
            } else {
                name
            };
            let as_bytes_name = f"{var_name}_as_bytes".quoted_contents();
            let as_bytes = quote { let $as_bytes_name = $name.as_bytes() };
            for i in 0..str_len {
                fields = fields.push_back(quote { $as_bytes_name[$i] as Field });
            }
            aux_vars = aux_vars.push_back(as_bytes);
        } else {
            panic(
                f"Unsupported type for serialization of argument {name} and type {typ}",
            )
        }
    }
    (fields, aux_vars)
}

pub(crate) comptime fn derive_serialize(s: StructDefinition) -> Quoted {
    let typ = s.as_type();
    let (fields, aux_vars) = generate_serialize_to_fields(quote { self }, typ, &[]);
    let aux_vars_for_serialization = if aux_vars.len() > 0 {
        let joint = aux_vars.join(quote {;});
        quote { $joint; }
    } else {
        quote {}
    };

    let field_serializations = fields.join(quote {,});
    let serialized_len = fields.len();
    quote {
        impl Serialize<$serialized_len> for $typ {
            fn serialize(self) -> [Field; $serialized_len] {
                $aux_vars_for_serialization
                [ $field_serializations ]
            }
        }
    }
}

pub(crate) comptime fn derive_deserialize(s: StructDefinition) -> Quoted {
    let typ = s.as_type();
    let (fields, _) = generate_serialize_to_fields(quote { self }, typ, &[]);
    let serialized_len = fields.len();
    let (deserialized, _) = generate_deserialize_from_fields(
        quote { self },
        typ,
        quote { serialized },
        0,
        quote {},
        quote {},
    );
    quote {
        impl Deserialize<$serialized_len> for $typ {
            fn deserialize(serialized: [Field; $serialized_len]) -> Self {
                $deserialized
            }
        }
    }
}

#[derive(Serialize, Deserialize, Eq)]
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
