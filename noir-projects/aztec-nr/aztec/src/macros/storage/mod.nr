use std::{collections::umap::UHashMap, hash::{BuildHasherDefault, poseidon2::Poseidon2Hasher}};

use super::utils::get_serialized_size;
use super::utils::is_note;

/// Stores a map from a module to the name of the struct that describes its storage layout.
/// This is then used when generating a `storage_layout()` getter on the contract struct.
pub comptime mut global STORAGE_LAYOUT_NAME: UHashMap<Module, Quoted, BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

/// Marks a struct as the one describing the storage layout of a contract. Only a single struct in the entire contract
/// should have this macro (or `storage_no_init`) applied to it.
/// The contract's storage is accessed via the `storage` variable, which will will automatically be made available in
/// all functions as an instance of the struct this macro was applied to.
pub comptime fn storage(s: StructDefinition) -> Quoted {
    // This macro performs three things:
    //  - it marks the contract as having storage, so that `macros::utils::module_has_storage` will return true and
    //    functions will have the storage variable injected and initialized via the `init` function.
    //  - it implements said `init` function by allocating appropriate storage slots to each state variable.
    //  - it exposes the storage layout by creating a `StorageLayout` struct that is exposed via the `abi(storage)`
    //    macro.
    let mut slot: u32 = 1;
    let mut storage_vars_constructors = &[];
    let mut storage_layout_fields = &[];
    let mut storage_layout_constructors = &[];

    // TODO(#8658): uncomment the code below to inject the Context type parameter.
    //let mut new_storage_fields = &[];
    //let context_generic = s.add_generic("Context");
    for field in s.fields_as_written() {
        // FIXME: This doesn't handle field types with generics
        let (name, typ) = field;
        let (storage_field_constructor, serialized_size) =
            generate_storage_field_constructor(typ, quote { $slot }, false);
        storage_vars_constructors =
            storage_vars_constructors.push_back(quote { $name: $storage_field_constructor });
        // We have `Storable` in a separate `.nr` file instead of defining it in the last quote of this function
        // because that way a dev gets a more reasonable error if he defines a struct with the same name in
        // a contract.
        storage_layout_fields =
            storage_layout_fields.push_back(quote { $name: dep::aztec::prelude::Storable });
        storage_layout_constructors = storage_layout_constructors.push_back(
            quote { $name: dep::aztec::prelude::Storable { slot: $slot } },
        );
        //let with_context_generic = add_context_generic(typ, context_generic);
        //println(with_context_generic);
        //new_storage_fields = new_storage_fields.push_back((name,  with_context_generic ));
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
    let (module_name_str, module_name_len) = module_name.as_str_quote();
    STORAGE_LAYOUT_NAME.insert(module, storage_layout_name);

    quote {
        $storage_impl

        pub struct StorageLayoutFields {
            $storage_layout_fields
        }

        pub struct StorageLayout<let N: u32> {
            pub contract_name: str<N>,
            pub fields: StorageLayoutFields
        }

        #[abi(storage)]
        pub global $storage_layout_name: StorageLayout<$module_name_len> = StorageLayout {
            contract_name: $module_name_str,
            fields: StorageLayoutFields { $storage_layout_constructors }
        };
    }
}

/// Same as `storage`, except the user is in charge of providing an implementation of the `init` constructor function
/// with signature `fn init<Context>(context: Context) -> Self`, which allows for manual control of storage slot
/// allocation. Similarly, no `StorageLayout` struct will be created.
/// Only a single struct in the entire contract should have this macro (or `storage`) applied to it.
pub comptime fn storage_no_init(_s: StructDefinition) {
    // All `storage` does is provide the `init` implementation, so we don't need to do anything here. Applying this
    // macro however will cause for `macros::utils::module_has_storage` to return true, resulting in the injection of
    // the `storage` variable.
}

/// Returns the expression required to initialize a state variable with a given slot, along with its serialization size,
/// i.e. how many contiguous storage slots the variable requires.
comptime fn generate_storage_field_constructor(
    typ: Type,
    slot: Quoted,
    parent_is_map: bool,
) -> (Quoted, u32) {
    assert(
        typ.as_struct().is_some(),
        "Storage containers must be generic structs of the form `Container<_, Context>`, or Map<Key, _, Context>",
    );
    let (container_struct, generics) = typ.as_struct().unwrap();
    let struct_name = container_struct.name();

    if is_storage_map(typ) {
        // Map state variables recursively initialize their contents - this includes nested maps.
        let (value_constructor, _) =
            generate_storage_field_constructor(generics[1], quote { slot }, true);
        (quote { $struct_name::new(context, $slot, | context, slot | { $value_constructor }) }, 1)
    } else {
        let (container_struct, container_struct_generics) = typ.as_struct().unwrap();
        let container_struct_name = container_struct.name();

        let serialized_size = if parent_is_map {
            // Variables inside a map do not require contiguous slots since the map slot derivation is assumed to result
            // in slots very far away from one another.
            1
        } else {
            let stored_struct = container_struct_generics[0];
            if is_note(stored_struct) & (container_struct_name != quote { PublicMutable }) {
                // Private notes always occupy a single slot, since the slot is only used as a state variable
                // identifier.
                // Someone could store a Note in PublicMutable for whatever reason though.
                // TODO(#8659): remove the PublicMutable exception above
                1
            } else {
                get_serialized_size(stored_struct)
            }
        };

        // We assume below that all state variables implement `fn new<Context>(context: Context, slot: Field) -> Self`.
        (quote { $struct_name::new(context, $slot)}, serialized_size)
    }
}

/// Returns true if `typ` is `state_vars::map::Map`.
comptime fn is_storage_map(typ: Type) -> bool {
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

comptime fn add_context_generic(typ: Type, context_generic: Type) -> Type {
    let (def, mut generics) = typ.as_struct().expect(
        f"Storage containers must be generic structs of the form `Container<..., Context>`",
    );
    let name = def.name();

    if is_storage_map(typ) {
        generics[generics.len() - 2] = add_context_generic(generics[1], context_generic);
        generics[generics.len() - 1] = context_generic;
    } else {
        generics[generics.len() - 1] = context_generic;
    }

    let generics = generics.map(|typ: Type| quote {$typ}).join(quote {,});
    quote { $name<$generics> }.as_type()
}
