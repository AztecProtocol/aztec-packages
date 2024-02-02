use crate::avm::env_getters::{
    get_address,
    get_storage_address
};

// Getters that will be converted by the transpiler into their
// own opcodes
struct AvmContext {}

impl AvmContext {
    pub fn new() -> Self {
        Self {}
    }

    pub fn address() -> Field {
        get_address()
    }

    pub fn storage_address() -> Field {
        get_storage_address()
    }
}
