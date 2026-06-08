use crate::utils::cmap::CHashMap;
use std::meta::unquote;

/// Stores a map from a module to the name of the struct that describes its storage layout. This is then used when
/// generating a `storage_layout()` getter on the contract struct.
pub comptime mut global STORAGE_LAYOUT_NAME: CHashMap<Module, Quoted> = CHashMap::new();

/// Declares the contract's storage.
///
/// This function:
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

    // State variable types no longer take an explicit `Context` generic: the macro threads it through internally by
    // generating a separate `StorageRuntime<Context>` struct. Reject the old generic `Storage<Context>` syntax with an
    // actionable error so users know exactly what to change.
    if s.generics().len() != 0 {
        panic(
            f"The #[storage] macro requires a non-generic Storage struct. Change `struct Storage<Context> {{ .. }}` to `struct Storage {{ .. }}` and drop the `, Context` argument from each field type (e.g. `PublicMutable<u128, Context>` becomes `PublicMutable<u128>`). The macro now threads `Context` through internally.",
        )
    }

    assert(
        !s.has_named_attribute("storage_no_init"),
        f"Only one of #[storage] and #[storage_no_init] can be applied to the Storage struct.",
    );

    let mut slot: u32 = 1;
    let mut storage_runtime_fields = @[];
    let mut storage_vars_constructors = @[];
    let mut spec_field_initializers = @[];
    let mut storage_layout_struct_members = @[];
    let mut storage_layout_constructors = @[];

    for storage_struct_member in s.fields_as_written() {
        let (name, typ, _) = storage_struct_member;

        let _maybe_context = std::meta::typ::fresh_type_variable();
        if !typ.implements(quote { crate::state_vars::StateVariable<$_maybe_context> }.as_trait_constraint()) {
            let _maybe_owned_context = std::meta::typ::fresh_type_variable();
            if typ.implements(quote { crate::state_vars::OwnedStateVariable<$_maybe_owned_context> }
                .as_trait_constraint()) {
                panic(
                    f"Type {typ} implements OwnedStateVariable and hence cannot be placed in Storage struct without being wrapped in Owned. Wrap the type in Owned<...>.",
                )
            }

            panic(
                f"Type {typ} does not implement StateVariable and hence cannot be placed in Storage struct.",
            )
        }

        // `N` (the number of storage slots the state variable occupies) is an associated constant of `StateVariable`.
        // We read it by projecting it into an array length and reading back the resulting constant type. The spec
        // impls are generic over `Context` and `N` does not depend on it, so we project with an arbitrary concrete
        // context.
        let storage_size_typ = quote {
            [Field; <$typ as crate::state_vars::StateVariable<crate::context::PublicContext>>::N]
        }
            .as_type();
        let storage_size = storage_size_typ.as_array().unwrap().1.as_constant().unwrap();

        let slot_as_field = slot as Field;

        storage_runtime_fields = storage_runtime_fields.push_back(
            quote { $name: <$typ as aztec::state_vars::StateVariable<Context>>::Runtime },
        );
        storage_vars_constructors = storage_vars_constructors.push_back(
            quote { $name: aztec::state_vars::RuntimeStateVariable::new(context, $slot_as_field) },
        );
        // Empty spec marker construction for the field type as written/resolved, used by the dead-code marker below.
        spec_field_initializers = spec_field_initializers.push_back(quote { $name: $typ {} });

        // We have `Storable` in a separate `.nr` file instead of defining it in the last quote of this function
        // because that way a dev gets a more reasonable error if he defines a struct with the same name in a contract.
        storage_layout_struct_members =
            storage_layout_struct_members.push_back(quote { pub $name: aztec::state_vars::Storable });
        storage_layout_constructors = storage_layout_constructors.push_back(
            quote { $name: aztec::state_vars::Storable { slot: $slot_as_field } },
        );

        slot += storage_size;
    }

    // When `Storage` is empty, the generated `init` body is `Self { }` and never references `context`. Emit
    // `_context` in that case so the parameter does not trigger an unused-variable warning.
    let init_context_param = if s.fields_as_written().len() == 0 {
        quote { _context }
    } else {
        quote { context }
    };

    let storage_runtime_fields = storage_runtime_fields.join(quote {,});
    let storage_vars_constructors = storage_vars_constructors.join(quote {,});
    let spec_field_initializers = spec_field_initializers.join(quote {,});

    let storage_layout_struct_members = storage_layout_struct_members.join(quote {,});
    let storage_layout_constructors = storage_layout_constructors.join(quote {,});

    let module = s.module();
    let module_name = module.name();
    let storage_layout_name = f"STORAGE_LAYOUT_{module_name}".quoted_contents();
    let module_name_str = f"{module_name}".as_quoted_str();
    let module_name_len: u32 = unquote!(quote { $module_name_str.as_bytes().len() });
    STORAGE_LAYOUT_NAME.insert(module, storage_layout_name);

    quote {
        // The runtime storage struct whose fields hold the real state variables with `Context` threaded through. This
        // is what every contract function instantiates as `self.storage`; the user-written `Storage` struct exists only
        // as a declarative layout spec and is never constructed.
        pub struct StorageRuntime<Context> {
            $storage_runtime_fields
        }

        impl<Context> StorageRuntime<Context> {
            fn init($init_context_param: Context) -> Self {
                Self {
                    $storage_vars_constructors
                }
            }
        }

        // Force the user's `Storage` struct to count as "used" so it does not produce an "is never constructed"
        // warning. The function is never called and `dead_code` is allowed.
        #[contract_library_method]
        #[allow(dead_code)]
        fn _storage_spec_marker() -> Storage {
            Storage { $spec_field_initializers }
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
/// The contract's storage is accessed via the `storage` variable, which will automatically be made available in all
/// functions as an instance of the struct this macro was applied to.
///
/// Unlike `#[storage]`, this macro does not generate a separate runtime struct: the struct it is applied to _is_ the
/// runtime struct. It must therefore be named `StorageRuntime`, take a `Context` generic, and hold the runtime state
/// variable types (e.g. `RuntimePublicMutable<T, Context>`, `RuntimeOwned<..., Context>`) rather than the spec markers
/// (`PublicMutable<T>`, `Owned<...>`). This is an advanced escape hatch; prefer `#[storage]` unless you specifically
/// need manual storage slot allocation.
///
/// Only a single struct in the entire contract can have this macro (or `storage`) applied to it.
pub comptime fn storage_no_init(s: TypeDefinition) {
    // All `storage_no_init` does is provide the `init` implementation, so we don't need to do anything here. Applying
    // this macro however will cause for `macros::utils::module_has_storage` to return true, resulting in the injection
    // of the `storage` variable.

    // We do need to make sure that the type is called StorageRuntime, since we'll do `StorageRuntime::init` later on.

    if s.name() != quote { StorageRuntime } {
        let name = s.name();
        panic(
            f"The #[storage_no_init] macro can only be applied to a struct with name 'StorageRuntime', got '{name}' instead.",
        )
    }

    assert(
        !s.has_named_attribute("storage"),
        f"Only one of #[storage] and #[storage_no_init] can be applied to the storage struct.",
    );
}
