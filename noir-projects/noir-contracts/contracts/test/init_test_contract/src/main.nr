// A contract with both private and public functions used to test initialization behavior,
// including init checks, self-calls during initialization, and public/private ordering.
use aztec::macros::aztec;

#[aztec]
pub contract InitTest {
    use aztec::macros::{
        functions::{external, initializer, noinitcheck, only_self, view},
        storage::storage,
    };
    use aztec::protocol::address::AztecAddress;
    use aztec::state_vars::{Map, PublicMutable};

    #[storage]
    struct Storage<Context> {
        public_values: Map<AztecAddress, PublicMutable<Field, Context>, Context>,
    }

    #[external("private")]
    #[initializer]
    fn constructor(owner: AztecAddress, value: Field) {}

    #[external("private")]
    #[initializer]
    fn initializer_self_calling_private_not_init_checked(owner: AztecAddress, value: Field) {
        self.call_self.private_fn_no_init_check(owner, value);
    }

    #[external("private")]
    #[initializer]
    fn initializer_self_calling_private_init_checked(owner: AztecAddress, value: Field) {
        self.call_self.private_fn_init_check(owner, value);
    }

    #[external("private")]
    #[initializer]
    fn initializer_enqueuing_public_init_checked(owner: AztecAddress, value: Field) {
        self.enqueue_self.public_fn_init_check_write_value(owner, value);
    }

    #[external("private")]
    #[initializer]
    fn initializer_calling_only_self(owner: AztecAddress, value: Field) {
        self.call_self.private_only_self_fn(owner, value);
    }

    // Tests that a public initializer cannot self-call a public function that has init checks,
    // since the contract is not yet initialized at that point.
    #[external("public")]
    #[initializer]
    fn public_initializer_self_calling_init_checked(owner: AztecAddress, value: Field) {
        self.call_self.public_fn_init_check_write_value(owner, value);
    }

    #[external("private")]
    #[only_self]
    fn private_only_self_fn(owner: AztecAddress, value: Field) {}

    #[external("private")]
    fn private_fn_init_check(owner: AztecAddress, value: Field) {}

    #[external("private")]
    #[noinitcheck]
    fn private_fn_no_init_check(owner: AztecAddress, value: Field) {}

    #[external("public")]
    fn public_fn_init_check_write_value(owner: AztecAddress, value: Field) {
        self.storage.public_values.at(owner).write(value);
    }

    #[external("public")]
    #[noinitcheck]
    #[view]
    fn public_fn_no_init_check_read_value(owner: AztecAddress) -> pub Field {
        self.storage.public_values.at(owner).read()
    }
}
