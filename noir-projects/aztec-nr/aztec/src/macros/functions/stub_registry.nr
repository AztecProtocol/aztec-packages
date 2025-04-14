use poseidon::poseidon2::Poseidon2Hasher;
use std::{collections::umap::UHashMap, hash::BuildHasherDefault};

comptime mut global STUBS: UHashMap<Module, [Quoted], BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

/// Registers a function stub created via `stub_fn` as part of a module,
pub(crate) comptime fn register(m: Module, stub: Quoted) {
    let current_stubs = STUBS.get(m);
    let stubs_to_insert = if current_stubs.is_some() {
        current_stubs.unwrap().push_back(stub)
    } else {
        &[stub]
    };
    STUBS.insert(m, stubs_to_insert);
}

pub comptime fn get(m: Module) -> Option<[Quoted]> {
    STUBS.get(m)
}
