use poseidon::poseidon2::Poseidon2Hasher;
use std::{collections::umap::UHashMap, hash::BuildHasherDefault};

/// Registers the functions that have the `#[authorize_once(...)]` macro, and the parameters the macro was invoked with.
/// This is used to later inject the authorization check (see ./utils.nr -> create_authorize_once_check)
/// via the #[private] or #[public] macros.
/// The `#[authorize_once(...)]` macro is not used directly to inject the check because it has to be placed
/// after context instantiation but before the function body, which only the aforementioned macros can do.
pub(crate) comptime mut global AUTHORIZE_ONCE_REGISTRY: UHashMap<FunctionDefinition, [CtString], BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();
