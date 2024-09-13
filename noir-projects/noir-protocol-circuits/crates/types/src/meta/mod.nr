use super::traits::Serialize;
use std::meta::type_of;

pub comptime fn flatten_to_fields(name: Quoted, typ: Type, omit: [Quoted]) -> ([Quoted], [Quoted]) {
    let mut fields = &[];
    let mut aux_vars = &[];

    if omit.all(| to_omit | to_omit != name) {
        if typ.is_field() | typ.as_integer().is_some() {
            fields = fields.push_back(quote { $name as Field });
        } else if typ.as_struct().is_some() {
            let nested_struct = typ.as_struct().unwrap();
            let params = nested_struct.0.fields();
            let struct_flattened = params.map(
                | (param_name, param_type): (Quoted, Type) | flatten_to_fields(quote {$name.$param_name}, param_type, omit)
            );
            let struct_flattened_fields = struct_flattened.fold(
                &[],
                | acc: [Quoted], (fields, _): (_, [Quoted]) | acc.append(fields)
            );
            let struct_flattened_aux_vars = struct_flattened.fold(
                &[],
                |acc: [Quoted], (_, aux_vars): ([Quoted], _) | acc.append(aux_vars)
            );
            fields = fields.append(struct_flattened_fields);
            aux_vars = aux_vars.append(struct_flattened_aux_vars);
        } else if typ.as_array().is_some() {
            let (element_type, array_len) = typ.as_array().unwrap();
            let array_len = array_len.as_constant().unwrap();
            for i in 0..array_len {
                let (element_fields, element_aux_vars) = flatten_to_fields(quote { $name[$i] }, element_type, omit);
                fields = fields.append(element_fields);
                aux_vars = aux_vars.append(element_aux_vars);
            }
        } else if typ.as_str().is_some() {
            let length_type = typ.as_str().unwrap();
            let str_len = length_type.as_constant().unwrap();
            let var_name = name.as_expr().unwrap().as_member_access().unwrap().1;
            let as_bytes_name = f"{var_name}_as_bytes".quoted_contents();
            let as_bytes = quote { let $as_bytes_name = $name.as_bytes() };
            for i in 0..str_len {
                fields = fields.push_back(quote { $as_bytes_name[$i] as Field } );
            }
            aux_vars = aux_vars.push_back(as_bytes);
        } else {
            assert(false, f"Unsupported type for serialization of argument {name} and type {typ}");
            std::mem::zeroed()
        }
    }
    (fields, aux_vars)
}

pub(crate) comptime fn derive_serialize(s: StructDefinition) -> Quoted {
    let typ = s.as_type();
    let (fields, aux_vars) = flatten_to_fields(quote { self }, typ, &[]);
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

#[derive(Serialize)]
struct Smol {
    a: Field,
    b: Field,
}

#[derive(Serialize)]
struct Fancier {
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
}

#[test]
fn fancier_test() {
    let fancier = Fancier { a: Smol { a: 1, b: 2 }, b: [0, 1], c: [1, 2, 3], d: "metaprogramming!" };
    let serialized = fancier.serialize();
    assert(
        serialized == [
            1, 2, 0, 1, 1, 2, 3, 0x6d, 0x65, 0x74, 0x61, 0x70, 0x72, 0x6f, 0x67, 0x72, 0x61, 0x6d, 0x6d, 0x69, 0x6e, 0x67, 0x21
        ], serialized
    );
}
