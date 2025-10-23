use poseidon::poseidon2::Poseidon2Hasher;
use std::{collections::umap::UHashMap, hash::BuildHasherDefault};

/// Key is external function definition and value is the argument of the #[external] attribute ("private", "public",
/// or "utility").
comptime mut global EXTERNAL_REGISTRY: UHashMap<FunctionDefinition, CtString, BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

/// Registers functions in the EXTERNAL_REGISTRY map. Called by the #[external] macro.
pub(crate) comptime fn register(f: FunctionDefinition, f_type: CtString) {
    // Check if function is already registered as external
    if EXTERNAL_REGISTRY.get(f).is_some() {
        let name = f.name();
        panic(
            f"The #[external] attribute cannot be applied multiple times to the same function - {name} already has it",
        );
    }

    EXTERNAL_REGISTRY.insert(f, f_type);
}

pub(crate) comptime fn get(f: FunctionDefinition) -> Option<CtString> {
    EXTERNAL_REGISTRY.get(f)
}
