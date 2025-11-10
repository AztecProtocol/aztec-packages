// TODO(F-131): Drop all this and instead just iterate over the functions directly in the `#[aztec]` macro. This
// approach was already implemented for `#[internal(...)]` functions.

//! Registry of self-call function stubs (CallSelf, CallSelfStatic, EnqueueSelf and EnqueueSelfStatic) that allow for
//! the following API:
//!   self.call_self.some_private_function(args)
//!   self.call_self_static.some_view_function(args)
//!   self.enqueue_self.some_public_function(args)
//!   self.enqueue_self_static.some_view_function(args)

use poseidon::poseidon2::Poseidon2Hasher;
use std::{collections::umap::UHashMap, hash::BuildHasherDefault};

// Each of the maps contains a quote of concatenated function stubs for a given contract module.

comptime mut global CALL_SELF_PRIVATE_STUBS: UHashMap<Module, Quoted, BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

comptime mut global CALL_SELF_PUBLIC_STUBS: UHashMap<Module, Quoted, BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

comptime mut global ENQUEUE_SELF_STUBS: UHashMap<Module, Quoted, BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

comptime mut global CALL_SELF_PRIVATE_STATIC_STUBS: UHashMap<Module, Quoted, BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

comptime mut global CALL_SELF_PUBLIC_STATIC_STUBS: UHashMap<Module, Quoted, BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

comptime mut global ENQUEUE_SELF_STATIC_STUBS: UHashMap<Module, Quoted, BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

comptime fn concat_to_stubs(
    map: &mut UHashMap<Module, Quoted, BuildHasherDefault<Poseidon2Hasher>>,
    m: Module,
    stub: Quoted,
) {
    let maybe_current_stubs = map.get(m);
    let stubs_to_insert = if maybe_current_stubs.is_some() {
        let current_stubs = maybe_current_stubs.unwrap();
        quote { $current_stubs $stub }
    } else {
        stub
    };
    map.insert(m, stubs_to_insert);
}

pub(crate) comptime fn register_call_self_private(m: Module, stub: Quoted) {
    concat_to_stubs(&mut CALL_SELF_PRIVATE_STUBS, m, stub);
}

pub(crate) comptime fn register_call_self_public(m: Module, stub: Quoted) {
    concat_to_stubs(&mut CALL_SELF_PUBLIC_STUBS, m, stub);
}

pub(crate) comptime fn register_enqueue_self(m: Module, stub: Quoted) {
    concat_to_stubs(&mut ENQUEUE_SELF_STUBS, m, stub);
}

pub(crate) comptime fn register_call_self_private_static(m: Module, stub: Quoted) {
    concat_to_stubs(&mut CALL_SELF_PRIVATE_STATIC_STUBS, m, stub);
}

pub(crate) comptime fn register_call_self_public_static(m: Module, stub: Quoted) {
    concat_to_stubs(&mut CALL_SELF_PUBLIC_STATIC_STUBS, m, stub);
}

pub(crate) comptime fn register_enqueue_self_static(m: Module, stub: Quoted) {
    concat_to_stubs(&mut ENQUEUE_SELF_STATIC_STUBS, m, stub);
}

pub struct SelfCallStubs {
    pub call_self_private_methods: Quoted,
    pub call_self_public_methods: Quoted,
    pub enqueue_self_methods: Quoted,
    pub call_self_private_static_methods: Quoted,
    pub call_self_public_static_methods: Quoted,
    pub enqueue_self_static_methods: Quoted,
}

pub comptime fn get_all_self_call_stubs(m: Module) -> SelfCallStubs {
    SelfCallStubs {
        call_self_private_methods: CALL_SELF_PRIVATE_STUBS.get(m).unwrap_or(quote {}),
        call_self_public_methods: CALL_SELF_PUBLIC_STUBS.get(m).unwrap_or(quote {}),
        enqueue_self_methods: ENQUEUE_SELF_STUBS.get(m).unwrap_or(quote {}),
        call_self_private_static_methods: CALL_SELF_PRIVATE_STATIC_STUBS.get(m).unwrap_or(quote {}),
        call_self_public_static_methods: CALL_SELF_PUBLIC_STATIC_STUBS.get(m).unwrap_or(quote {}),
        enqueue_self_static_methods: ENQUEUE_SELF_STATIC_STUBS.get(m).unwrap_or(quote {}),
    }
}
