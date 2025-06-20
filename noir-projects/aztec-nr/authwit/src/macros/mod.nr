use aztec::macros::utils::AsStrQuote;
use poseidon::poseidon2::Poseidon2Hasher;
use std::{collections::umap::UHashMap, hash::{BuildHasherDefault, Hash, Hasher}};

pub comptime mut global AUTHWIT_TYPES: UHashMap<Type, (TypeDefinition, Field, [Quoted]), BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

pub comptime fn flatten_fields_to_str_array(typ: Type, name: Quoted) -> ([Quoted], [Quoted]) {
    let mut name_accumulator = &[];
    let mut type_accumulator = &[];
    if typ.as_data_type().is_some() {
        let (s, _) = typ.as_data_type().unwrap();
        let data_type_name = s.name();
        for field in s.fields_as_written() {
            let (field_name, typ, _) = field;
            let (names, types) =
                flatten_fields_to_str_array(typ, quote { $name.$data_type_name.$field_name });
            name_accumulator = name_accumulator.append(names);
            type_accumulator = type_accumulator.append(types);
        }
    } else if typ.as_array().is_some() {
        let (typ, array_len) = typ.as_array().unwrap();
        for i in 0..array_len.as_constant().unwrap() {
            let (names, types) = flatten_fields_to_str_array(typ, quote { $name.$i });
            name_accumulator = name_accumulator.append(names);
            type_accumulator = type_accumulator.append(types);
        }
    } else {
        let (field_name_str, len) = name.as_str_quote();
        name_accumulator = name_accumulator.push_back(field_name_str);
        type_accumulator = type_accumulator.push_back(quote { str<$len> });
    }
    (name_accumulator, type_accumulator)
}

pub comptime fn authwit(s: TypeDefinition) -> Quoted {
    let name = s.name();
    let mut hasher = Poseidon2Hasher::default();
    s.as_type().hash(&mut hasher);
    let hash = hasher.finish() as u32;
    let global_export_name = f"{name}_EXPORTS_{hash}".quoted_contents();

    let (field_names, field_types) = flatten_fields_to_str_array(s.as_type(), quote { });

    quote {
        #[abi(authwits)]
        global $global_export_name: ($field_types.join(", ")) = (
            $field_names.join(", "),
        );
    }
}
