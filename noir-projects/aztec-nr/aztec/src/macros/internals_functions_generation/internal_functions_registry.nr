//! Registry for internal functions that are added to the corresponding global variable when the `#[internal(...)]`
//! macro is applied. This registry is then used by the `#[aztec]` macro to transform the internal functions.
//!
//! Note that we need to use this registry approach instead of directly iterating over the functions in the `#[aztec]`
//! macro, because at that point we do not have the information about whether a given internal function is private or
//! public. We only see the internal attribute itself, not the "private" or "public" argument.

use poseidon::poseidon2::Poseidon2Hasher;
use std::{collections::umap::UHashMap, hash::BuildHasherDefault};

// Key is a contract module, value is an array of function definitions.
comptime mut global PRIVATE_INTERNAL_REGISTRY: UHashMap<Module, [FunctionDefinition], BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();
comptime mut global PUBLIC_INTERNAL_REGISTRY: UHashMap<Module, [FunctionDefinition], BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

comptime fn add_to_registry(
    registry: &mut UHashMap<Module, [FunctionDefinition], BuildHasherDefault<Poseidon2Hasher>>,
    f: FunctionDefinition,
) {
    let module = f.module();
    let current_functions = registry.get(module);
    let functions_to_insert = if current_functions.is_some() {
        current_functions.unwrap().push_back(f)
    } else {
        &[f]
    };
    registry.insert(module, functions_to_insert);
}

pub(crate) comptime fn add_private(f: FunctionDefinition) {
    add_to_registry(&mut PRIVATE_INTERNAL_REGISTRY, f);
}

pub(crate) comptime fn add_public(f: FunctionDefinition) {
    add_to_registry(&mut PUBLIC_INTERNAL_REGISTRY, f);
}

pub(crate) comptime fn get_private_functions(m: Module) -> [FunctionDefinition] {
    PRIVATE_INTERNAL_REGISTRY.get(m).unwrap_or(&[])
}

pub(crate) comptime fn get_public_functions(m: Module) -> [FunctionDefinition] {
    PUBLIC_INTERNAL_REGISTRY.get(m).unwrap_or(&[])
}
