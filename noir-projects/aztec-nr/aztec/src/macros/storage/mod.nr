use std::{
    collections::umap::UHashMap,
    hash::{BuildHasherDefault, poseidon2::Poseidon2Hasher}
};

use super::utils::get_serialized_size;
use super::utils::is_note;

comptime mut global STORAGE_LAYOUT_NAME: UHashMap<Module, Quoted, BuildHasherDefault<Poseidon2Hasher>> = UHashMap::default();

pub comptime fn is_storage_map(typ: Type) -> bool {
    if typ.as_struct().is_some() {
        let (def, generics) = typ.as_struct().unwrap();
        let maybe_map = if (def.name() == quote { Map }) & (generics.len() == 3) {
            let maybe_key = generics[0];
            let maybe_value = generics[1];
            let maybe_context = generics[2];
            quote { crate::state_vars::map::Map<$maybe_key, $maybe_value, $maybe_context> }.as_type()
        } else {
            quote {()}.as_type()
        };
        typ == maybe_map
    } else {
        false
    }
}

pub comptime fn generate_storage_field_constructor(typ: Type, slot: Quoted, parent_is_map: bool) -> (Quoted, u32) {
    assert(
        typ.as_struct().is_some(), "Storage containers must be generic structs of the form `Container<_, Context>`, or Map<Key, _, Context>"
    );
    let (container_struct, generics) = typ.as_struct().unwrap();
    let struct_name = container_struct.name();

    if is_storage_map(typ) {
        let (value_constructor, _) = generate_storage_field_constructor(generics[1], quote { slot }, true);
        (quote { $struct_name::new(context, $slot, | context, slot | { $value_constructor }) }, 1)
    } else {
        let (container_struct, container_struct_generics) = typ.as_struct().unwrap();
        let container_struct_name = container_struct.name();
        // Whatever's stored in a map occupies "a single slot"
        let serialized_size = if parent_is_map {
            1
        } else {
            let stored_struct = container_struct_generics[0];
            // Private notes always occupy a single slot. Someone could store a Note in PublicMutable for whatever reason though.
            if is_note(stored_struct) & (container_struct_name != quote { PublicMutable }) {
                1
            } else {
                get_serialized_size(stored_struct)
            }
        };
        (quote { $struct_name::new(context, $slot)}, serialized_size)
    }
}

comptime fn add_context_generic(typ: Type, context_generic: Type) -> Type {
    assert(
        typ.as_struct().is_some(), "Storage containers must be generic structs of the form `Container<..., Context>`"
    );
    if is_storage_map(typ) {
        let (def, mut generics) = typ.as_struct().unwrap();
        let name = def.name();
        generics[generics.len() - 2] = add_context_generic(generics[1], context_generic);
        generics[generics.len() - 1] = context_generic;
        let generics = generics.map(|typ: Type| quote{$typ}).join(quote{,});
        quote { $name<$generics> }.as_type()
    } else {
        let (def, mut generics) = typ.as_struct().unwrap();
        let name = def.name();
        generics[generics.len() - 1] = context_generic;
        let generics = generics.map(|typ: Type| quote{$typ}).join(quote{,});
        quote { $name<$generics> }.as_type()
    }
}

// Just to make sure the contract is marked as having storage
pub comptime fn storage_no_init(_s: StructDefinition) {}

pub comptime fn storage(s: StructDefinition) -> Quoted {
    let mut slot: u32 = 1;
    let mut storage_vars_constructors = &[];
    let mut storage_layout_fields = &[];
    let mut storage_layout_constructors = &[];
    //let mut new_storage_fields = &[];
    //let context_generic = s.add_generic("Context");
    for field in s.fields() {
        let (name, typ) = field;
        let (storage_field_constructor, serialized_size) = generate_storage_field_constructor(typ, quote { $slot }, false);
        storage_vars_constructors = storage_vars_constructors.push_back(quote { $name: $storage_field_constructor });
        storage_layout_fields = storage_layout_fields.push_back(quote { $name: dep::aztec::prelude::Storable });
        storage_layout_constructors = storage_layout_constructors.push_back(quote { $name: dep::aztec::prelude::Storable { slot: $slot } });
        //let with_context_generic = add_context_generic(typ, context_generic);
        //println(with_context_generic);
        //new_storage_fields = new_storage_fields.push_back((name,  with_context_generic ));ç
        slot += serialized_size;
    }

    //s.set_fields(new_storage_fields);

    let storage_vars_constructors = storage_vars_constructors.join(quote {,});
    let storage_impl = quote {
        impl<Context> Storage<Context> {
            fn init(context: Context) -> Self {
                Self {
                    $storage_vars_constructors
                }
            }
        }
    };

    let storage_layout_fields = storage_layout_fields.join(quote {,});
    let storage_layout_constructors = storage_layout_constructors.join(quote {,});

    let module = s.module();
    let module_name = module.name();
    let storage_layout_name = f"STORAGE_LAYOUT_{module_name}".quoted_contents();
    STORAGE_LAYOUT_NAME.insert(module, storage_layout_name);

    quote {
        $storage_impl

        struct StorageLayout {
            $storage_layout_fields
        }

        #[abi(storage)]
        global $storage_layout_name = StorageLayout {
            $storage_layout_constructors
        };
    }
}

