use super::traits::{Deserialize, Packable, Serialize};

/// Returns the typed expression of a trait method implementation.
///
/// This helper function is preferred over directly inlining with `$typ::target_method()` in a quote,
/// as direct inlining would result in missing import warnings in the generated code (specifically,
/// warnings that the trait implementation is not in scope).
///
/// # Note
/// A copy of this function exists in `aztec-nr/aztec/src/macros/utils.nr`. We maintain separate copies
/// because importing it there from here would cause the `target_trait` to be interpreted in the context
/// of this crate, making it impossible to compile code for traits from that crate (e.g. NoteType).
comptime fn get_trait_impl_method(
    typ: Type,
    target_trait: Quoted,
    target_method: Quoted,
) -> TypedExpr {
    let trait_constraint = target_trait.as_trait_constraint();
    typ
        .get_trait_impl(trait_constraint)
        .expect(f"Could not find impl for {target_trait} for type {typ}")
        .methods()
        .filter(|m| m.name() == target_method)[0]
        .as_typed_expr()
}

pub comptime fn get_packable_len(typ: Type) -> u32 {
    // We currently don't seem to have a way to access an associated constant of a `TraitImpl` at comptime so
    // I work around this by:

    // 1. Getting the packable constraint
    let packable_constraint: TraitConstraint =
        quote { crate::traits::Packable }.as_trait_constraint();
    // 2. Getting the trait impl
    let trait_impl =
        typ.get_trait_impl(packable_constraint).expect(f"Type {typ} does not implement Packable");
    // 3. Getting the return type of the pack method
    let pack_method_return_type = trait_impl.methods()[0].return_type();
    // 3. Representing the return type as an array - this gives me (Type, Type) where the first type is the type of
    // elements in the array and the second is the length of the array.
    let pack_method_return_type_as_array = pack_method_return_type.as_array().unwrap();
    // 4. Getting the length and representing it as a constant.
    let packed_len_as_constant = pack_method_return_type_as_array.1.as_constant().expect(
        f"Could not represent packed length as a constant when getting packable len for {typ}",
    );

    packed_len_as_constant
}

// Note: The main usecase of this function is gone (it's no longer used in derive_serialize) so there is most likely
// a potential to significantly simplify this.
/// Generates code that serializes a type into an array of fields. Also generates auxiliary variables if necessary
/// for serialization. If `should_pack` is true, we check if the type implements the `Packable` trait and pack it
/// if it does.
///
/// # Parameters
/// - `name`: The base identifier (e.g., `self`, `some_var`).
/// - `typ`: The type being serialized (e.g., a custom struct, array, or primitive type).
/// - `should_pack`: A boolean indicating whether the type should be packed.
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
/// struct MockStruct {
///     a: Field,
///     b: Field,
/// }
/// ```
///
/// Serializing the struct:
/// ```rust
/// generate_serialize_to_fields(quote { my_mock_struct }, MockStruct, false)
/// // Returns:
/// // ([`my_mock_struct.a`, `my_mock_struct.b`], [])
/// ```
///
/// ## Nested Struct
/// For a more complex struct:
/// ```rust
/// struct NestedStruct {
///     m1: MockStruct,
///     m2: MockStruct,
/// }
/// ```
///
/// Serialization output:
/// ```rust
/// generate_serialize_to_fields(quote { self }, NestedStruct, false)
/// // Returns:
/// // ([`self.m1.a`, `self.m1.b`, `self.m2.a`, `self.m2.b`], [])
/// ```
///
/// ## Array
/// For an array type:
/// ```rust
/// generate_serialize_to_fields(quote { my_array }, [Field; 3], false)
/// // Returns:
/// // ([`my_array[0]`, `my_array[1]`, `my_array[2]`], [])
/// ```
///
/// ## String
/// For a string field, where each character is serialized as a `Field`:
/// ```rust
/// generate_serialize_to_fields(quote { my_string }, StringType, false)
/// // Returns:
/// // ([`my_string_as_bytes[0] as Field`, `my_string_as_bytes[1] as Field`, ...],
/// // [`let my_string_as_bytes = my_string.as_bytes()`])
/// ```
///
/// ## Nested Struct with packing enabled
/// - u128 has a `Packable` implementation hence it will be packed.
///
/// For a more complex struct:
/// ```rust
/// struct MyStruct {
///     value: u128,
///     value2: Field,
/// }
/// ```
///
/// # Panics
/// - If the type is unsupported for serialization.
/// - If the provided `typ` contains invalid constants or incompatible structures.
pub comptime fn generate_serialize_to_fields(
    name: Quoted,
    typ: Type,
    should_pack: bool,
) -> ([Quoted], [Quoted]) {
    let mut fields = &[];
    let mut aux_vars = &[];

    // If the type implements `Packable`, its length will be assigned to the `maybe_packed_len_typ` variable.
    let packable_constraint = quote { crate::traits::Packable}.as_trait_constraint();

    if (should_pack & typ.implements(packable_constraint)) {
        // Packing is enabled and the given type implements the `Packable` trait so we call the `pack()`
        // method, add the resulting field array to `aux_vars` and each field to `fields`.

        let packed_len = get_packable_len(typ);

        // We collapse the name to a one that gets tokenized as a single token (e.g. "self.value" -> "self_value").
        let name_at_one_token = collapse_to_one_token(name);
        let packed_struct_name = f"{name_at_one_token}_aux_var".quoted_contents();

        // We add the individual fields to the fields array
        let pack_method =
            get_trait_impl_method(typ, quote { crate::traits::Packable }, quote { pack });
        let packed_struct = quote { let $packed_struct_name = $pack_method($name) };
        for i in 0..packed_len {
            fields = fields.push_back(quote { $packed_struct_name[$i] });
        }

        // We add the new auxiliary variable to the aux_vars array
        aux_vars = aux_vars.push_back(packed_struct);
    } else if typ.is_field() {
        // For field we just add the value to fields
        fields = fields.push_back(name);
    } else if typ.as_integer().is_some() | typ.is_bool() {
        // For integer and bool we just cast to Field and add the value to fields
        fields = fields.push_back(quote { $name as Field });
    } else if typ.as_data_type().is_some() {
        // For struct we pref
        let nested_struct = typ.as_data_type().unwrap();
        let params = nested_struct.0.fields(nested_struct.1);
        let struct_flattened = params.map(|(param_name, param_type, _)| {
            let maybe_prefixed_name = if name == quote {} {
                // Triggered when the param name is of a value available in the current scope (e.g. a function
                // argument) --> then we don't prefix the name with anything.
                param_name
            } else {
                // Triggered when we want to prefix the param name with the `name` from function input. This
                // can typically be `self` when implementing a method on a struct.
                quote { $name.$param_name }
            };
            generate_serialize_to_fields(quote {$maybe_prefixed_name}, param_type, should_pack)
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
        // For array we recursively call `generate_serialize_to_fields(...)` for each element
        let (element_type, array_len) = typ.as_array().unwrap();
        let array_len = array_len.as_constant().unwrap();
        for i in 0..array_len {
            let (element_fields, element_aux_vars) =
                generate_serialize_to_fields(quote { $name[$i] }, element_type, should_pack);
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

    (fields, aux_vars)
}

/// From a quote that gets tokenized to a multiple tokens we collapse it to a single token by replacing all `.` with `_`.
/// E.g. "self.values[0]" -> "self_values_0_"
comptime fn collapse_to_one_token(q: Quoted) -> Quoted {
    let tokens = q.tokens();

    let mut single_token = quote {};
    for token in tokens {
        let new_token = if ((token == quote {.}) | (token == quote {[}) | (token == quote {]})) {
            quote {_}
        } else {
            token
        };
        single_token = f"{single_token}{new_token}".quoted_contents();
    }
    single_token
}

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

/// Generates `Packable` implementation for a given struct.
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
