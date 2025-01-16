use super::traits::{Deserialize, Serialize};

pub comptime fn pack_from_fields<N>(
    name: Quoted,
    typ: Type,
    buffer: Quoted,
    already_consumed: u32,
    replacements: [(Quoted, Quoted)],
) -> (Quoted, u32) {
    let mut result = quote {};
    let mut consumed: u32 = 0;

    let found_replacements = replacements.filter(|(to_omit, _): (Quoted, Quoted)| to_omit == name);

    let replacement = if found_replacements.len() == 1 {
        replacements[0].1
    } else {
        quote {}
    };

    if replacement == quote {} {
        if typ.is_field() | typ.as_integer().is_some() | typ.is_bool() {
            result = quote { $buffer[$already_consumed] as $typ };
            consumed = 1;
        } else if typ.as_struct().is_some() {
            let (nested_def, generics) = typ.as_struct().unwrap();
            let nested_name = nested_def.name();
            let mut deserialized_fields_list = &[];
            for field in nested_def.fields(generics) {
                let (field_name, field_type) = field;
                let (deserialized_field, consumed_by_field) = pack_from_fields(
                    quote { $field_name },
                    field_type,
                    quote { $buffer },
                    consumed + already_consumed,
                    replacements,
                );
                consumed += consumed_by_field;
                deserialized_fields_list =
                    deserialized_fields_list.push_back(quote { $field_name: $deserialized_field });
            }
            let deserialized_fields = deserialized_fields_list.join(quote {,});
            result = quote {
                $nested_name {
                    $deserialized_fields
                }
            };
        } else if typ.as_array().is_some() {
            let (element_type, array_len) = typ.as_array().unwrap();
            let array_len = array_len.as_constant().unwrap();
            let mut array_fields_list = &[];
            for _ in 0..array_len {
                let (deserialized_field, consumed_by_field) = pack_from_fields(
                    quote { $name },
                    element_type,
                    quote { $buffer },
                    consumed + already_consumed,
                    replacements,
                );
                array_fields_list = array_fields_list.push_back(deserialized_field);
                consumed += consumed_by_field;
            }
            let array_fields = array_fields_list.join(quote {,});
            result = quote { [ $array_fields ] };
        } else if typ.as_str().is_some() {
            let length_type = typ.as_str().unwrap();
            let str_len = length_type.as_constant().unwrap();
            let mut byte_list = &[];
            for _ in 0..str_len {
                let (deserialized_field, consumed_by_field) = pack_from_fields(
                    quote { $name },
                    quote { u8}.as_type(),
                    quote { $buffer },
                    consumed + already_consumed,
                    replacements,
                );
                byte_list = byte_list.push_back(deserialized_field);
                consumed += consumed_by_field;
            }
            let bytes = byte_list.join(quote {,});
            result = quote { [ $bytes ].as_str_unchecked() };
        } else {
            panic(
                f"Unsupported type for serialization of argument {name} and type {typ}",
            )
        }
    } else {
        result = replacement;
    }
    (result, consumed)
}

/// Flattens `typ` into a list of fields prefixed with `name` while omitting fields in `omit`. Also returns a list of
/// auxiliary variables that are needed for serialization (e.g. "let string_value_as_bytes = string_value.as_bytes()").
pub comptime fn flatten_to_fields(name: Quoted, typ: Type, omit: [Quoted]) -> ([Quoted], [Quoted]) {
    let mut fields = &[];
    let mut aux_vars = &[];

    if omit.all(|to_omit| to_omit != name) {
        if typ.is_field() {
            // For field we just add the value to fields
            fields = fields.push_back(name);
        } else if typ.is_field() | typ.as_integer().is_some() | typ.is_bool() {
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
                    quote { $param_name }
                } else {
                    // Triggered when we want to prefix the param name with the `name` from function input. This
                    // can typically be `self` when implementing a method on a struct.
                    quote { $name.$param_name }
                };
                flatten_to_fields(quote {$maybe_prefixed_name}, param_type, omit)
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
            // For array we recursively call flatten_to_fields for each element
            let (element_type, array_len) = typ.as_array().unwrap();
            let array_len = array_len.as_constant().unwrap();
            for i in 0..array_len {
                let (element_fields, element_aux_vars) =
                    flatten_to_fields(quote { $name[$i] }, element_type, omit);
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

comptime fn derive_serialize(s: StructDefinition) -> Quoted {
    let struct_type = s.as_type();
    let mut serialize_lengths = &[];
    let mut trait_constraints = &[];
    let mut append_statements = &[];

    let generic_types = s.generics().map(|generic: (Type, Option<Type>)| generic.0);

    for field in s.fields(generic_types) {
        let (field_name, field_type) = field;
        let serialize_length_name = f"{field_name}_serialized_length".quoted_contents();
        serialize_lengths = serialize_lengths.push_back(quote { $serialize_length_name });
        trait_constraints =
            trait_constraints.push_back(quote { $field_type: Serialize<$serialize_length_name> });
        let serialized_name = f"{field_name}_serialized".quoted_contents();
        append_statements = append_statements.push_back(
            quote {
            let $serialized_name = self.$field_name.serialize();
            for i in 0..$serialize_length_name {
                serialized[offset+i] = $serialized_name[i];
            }
            offset += $serialize_length_name;
        },
        );
    }
    let mut impl_generics = s.generics().map(|generic| quote { $generic });
    for length in serialize_lengths {
        impl_generics = impl_generics.push_back(quote { let $length: u32 });
    }

    let joined_impl_generics = impl_generics.join(quote {,});
    let total_serialize_length = serialize_lengths.join(quote {+});
    let joined_trait_constraints = trait_constraints.join(quote {,});
    let joined_append_statements = append_statements.join(quote {});
    let result = quote {
        impl<$joined_impl_generics> Serialize <$total_serialize_length> for $struct_type where $joined_trait_constraints {
            fn serialize(self) -> [Field; $total_serialize_length] {
                let mut serialized = [0; $total_serialize_length];
                let mut offset = 0;
                $joined_append_statements
                serialized
            }
        }
    };
    println(result);

    result
}

comptime fn derive_deserialize(s: StructDefinition) -> Quoted {
    let struct_type = s.as_type();
    let mut deserialize_lengths = &[];
    let mut trait_constraints = &[];
    let mut append_statements = &[];
    let generic_types = s.generics().map(|generic: (Type, Option<Type>)| generic.0);

    for field in s.fields(generic_types) {
        let (field_name, field_type) = field;
        let serialize_length_name = f"{field_name}_serialized_length".quoted_contents();
        deserialize_lengths = deserialize_lengths.push_back(quote { $serialize_length_name });
        trait_constraints =
            trait_constraints.push_back(quote { $field_type: Deserialize<$serialize_length_name> });
        let serialized_name = f"{field_name}_serialized".quoted_contents();
        append_statements = append_statements.push_back(
            quote {
            let mut $serialized_name = [0; $serialize_length_name];
            for i in 0..$serialize_length_name {
                $serialized_name[i] = serialized[offset+i];
            }
            offset += $serialize_length_name;
            let $field_name = Deserialize::deserialize($serialized_name);
        },
        );
    }
    let mut impl_generics = generic_types.map(|g| quote {$g});
    for length in deserialize_lengths {
        impl_generics = impl_generics.push_back(quote { let $length: u32 });
    }

    let joined_impl_generics = impl_generics.join(quote {,});
    let total_serialize_length = deserialize_lengths.join(quote {+});
    let joined_trait_constraints = trait_constraints.join(quote {,});
    let joined_append_statements = append_statements.join(quote {});
    let instantiation = s.fields_as_written().map(|field: (Quoted, Type)| field.0).join(quote {,});
    let result = quote {
        impl<$joined_impl_generics> Deserialize <$total_serialize_length> for $struct_type where $joined_trait_constraints {
           fn deserialize(serialized: [Field; $total_serialize_length]) -> Self {
                let mut offset = 0;
                $joined_append_statements
                Self {
                    $instantiation
                }
            }
        }
    };
    println(result);

    result
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
