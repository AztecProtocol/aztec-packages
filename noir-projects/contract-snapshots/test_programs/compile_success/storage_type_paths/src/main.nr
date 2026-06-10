use aztec::macros::aztec;

// Verifies the #[storage] macro resolves and projects state variable field types regardless of how they are written:
// via a fully-qualified path, via an aliased import, and nested inside a `Map`. The macro injects `Context` by
// projecting the `StateVariable::Runtime` associated type, so all of these forms must resolve to the same runtime type.
#[aztec]
pub contract StorageTypePaths {
    use aztec::{
        macros::{functions::external, storage::storage},
        protocol::address::AztecAddress,
        state_vars::{Map, PublicMutable as PM},
    };

    #[storage]
    struct Storage {
        qualified: aztec::state_vars::PublicMutable<Field>,
        aliased: PM<Field>,
        nested: Map<AztecAddress, PM<u64>>,
    }

    #[external("public")]
    fn write_values(owner: AztecAddress, value: Field, amount: u64) {
        self.storage.qualified.write(value);
        self.storage.aliased.write(value);
        self.storage.nested.at(owner).write(amount);
    }
}
