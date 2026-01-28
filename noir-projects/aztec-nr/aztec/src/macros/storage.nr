use poseidon::poseidon2::Poseidon2Hasher;
use std::{collections::umap::UHashMap, hash::BuildHasherDefault};

use super::utils::AsStrQuote;

/// Stores a map from a module to the name of the struct that describes its storage layout. This is then used when
/// generating a `storage_layout()` getter on the contract struct.
pub comptime mut global STORAGE_LAYOUT_NAME: UHashMap<Module, Quoted, BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

/// This function
/// - marks the contract as having storage, so that `macros::utils::module_has_storage` will return true,
/// - marks the struct `s` as the one describing the storage layout of a contract,
/// - generates an `impl` block for the storage struct with an `init` function (call to `init` is then injected at the
/// beginning of every `#[external(...)]` and `#[internal]` contract function and the storage is then available as
/// `self.storage`),
/// - creates a `StorageLayout` struct that is is exposed via the `abi(storage)` macro in the contract artifact.
///
/// Only a single struct in the entire contract should have this macro (or `storage_no_init`) applied to it, and the
/// struct has to be called 'Storage'.
pub comptime fn storage(s: TypeDefinition) -> Quoted {
    let struct_name = s.name();
    if struct_name != quote { Storage } {
        panic(
            f"The #[storage] macro can only be applied to a struct with name 'Storage', got '{struct_name}' instead.",
        )
    }

    assert(
        !s.has_named_attribute("storage_no_init"),
        f"Only one of #[storage] and #[storage_no_init] can be applied to the Storage struct.",
    );

    let mut slot: u32 = 1;
    let mut storage_vars_constructors = @[];
    let mut storage_layout_struct_members = @[];
    let mut storage_layout_constructors = @[];

    for storage_struct_member in s.fields_as_written() {
        let (name, typ, _) = storage_struct_member;

        let maybe_storage_size = std::meta::typ::fresh_type_variable();
        let _maybe_context = std::meta::typ::fresh_type_variable();

        if !typ.implements(quote { crate::state_vars::StateVariable<$maybe_storage_size, $_maybe_context> }
            .as_trait_constraint()) {
            let _maybe_owned_context = std::meta::typ::fresh_type_variable();
            if typ.implements(quote { crate::state_vars::OwnedStateVariable<$_maybe_owned_context> }
                .as_trait_constraint()) {
                panic(
                    f"Type {typ} implements OwnedStateVariable and hence cannot be placed in Storage struct without being wrapped in Owned. Define the type in storage as Owned<{typ}<..., Context>>, Context>.",
                )
            }

            panic(
                f"Type {typ} does not implement StateVariable and hence cannot be placed in Storage struct.",
            )
        }

        let storage_size = maybe_storage_size.as_constant().unwrap();
        let slot_as_field = slot as Field;

        storage_vars_constructors = storage_vars_constructors.push_back(
            quote { $name: aztec::state_vars::StateVariable::<$storage_size, Context>::new(context, $slot_as_field) },
        );

        // We have `Storable` in a separate `.nr` file instead of defining it in the last quote of this function
        // because that way a dev gets a more reasonable error if he defines a struct with the same name in a contract.
        storage_layout_struct_members =
            storage_layout_struct_members.push_back(quote { pub $name: aztec::state_vars::Storable });
        storage_layout_constructors = storage_layout_constructors.push_back(
            quote { $name: aztec::state_vars::Storable { slot: $slot_as_field } },
        );

        slot += storage_size;
    }

    let storage_vars_constructors = storage_vars_constructors.join(quote {,});

    let storage_layout_struct_members = storage_layout_struct_members.join(quote {,});
    let storage_layout_constructors = storage_layout_constructors.join(quote {,});

    let module = s.module();
    let module_name = module.name();
    let storage_layout_name = f"STORAGE_LAYOUT_{module_name}".quoted_contents();
    let (module_name_str, module_name_len) = module_name.as_str_quote();
    STORAGE_LAYOUT_NAME.insert(module, storage_layout_name);

    quote {
        impl<Context> Storage<Context> {
            fn init(context: Context) -> Self {
                Self {
                    $storage_vars_constructors
                }
            }
        }

        pub struct StorageLayoutFields {
            $storage_layout_struct_members
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
///
/// The contract's storage is accessed via the `storage` variable, which will will automatically be made available in
/// all functions as an instance of the struct this macro was applied to.
///
/// Only a single struct in the entire contract can have this macro (or storage_no_init) applied to it, and the struct
/// has to be called 'Storage'.
pub comptime fn storage_no_init(s: TypeDefinition) {
    // All `storage` does is provide the `init` implementation, so we don't need to do anything here. Applying this
    // macro however will cause for `macros::utils::module_has_storage` to return true, resulting in the injection of
    // the `storage` variable.

    // We do need to make sure that the type is called Storage, since we'll do `Storage::init` later on.

    if s.name() != quote { Storage } {
        let name = s.name();
        panic(
            f"The #[storage_no_init] macro can only be applied to a struct with name 'Storage', got '{name}' instead.",
        )
    }

    assert(
        !s.has_named_attribute("storage"),
        f"Only one of #[storage] and #[storage_no_init] can be applied to the Storage struct.",
    );
}
