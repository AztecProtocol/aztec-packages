use poseidon::poseidon2::Poseidon2Hasher;
use std::{collections::umap::UHashMap, hash::BuildHasherDefault};

pub(crate) comptime mut global AUTHORIZE_ONCE_REGISTRY: UHashMap<FunctionDefinition, [CtString], BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();
