// A contract with both private and public functions used to test initialization behavior, including init checks,
// self-calls during initialization, and public/private ordering.
use aztec::macros::aztec;

#[aztec]
pub contract InitTest {
    use aztec::macros::functions::{external, initializer, noinitcheck, only_self, view};
    use aztec::protocol::address::AztecAddress;

    #[external("private")]
    #[initializer]
    fn constructor(owner: AztecAddress, value: Field) {}

    #[external("private")]
    #[initializer]
    fn initializer_self_calling_private_not_init_checked(owner: AztecAddress, value: Field) {
        self.call_self.priv_no_init_check(owner, value);
    }

    #[external("private")]
    #[initializer]
    fn initializer_self_calling_private_init_checked(owner: AztecAddress, value: Field) {
        self.call_self.priv_init_check(owner, value);
    }

    #[external("private")]
    #[initializer]
    fn initializer_enqueuing_public_init_checked(owner: AztecAddress, value: Field) {
        self.enqueue_self.pub_init_check(owner, value);
    }

    #[external("private")]
    #[initializer]
    fn initializer_calling_only_self(owner: AztecAddress, value: Field) {
        self.call_self.priv_only_self(owner, value);
    }

    // Tests that a public initializer cannot self-call a public function that has init checks, since the contract is
    // not yet initialized at that point.
    #[external("public")]
    #[initializer]
    fn public_initializer_self_calling_init_checked(owner: AztecAddress, value: Field) {
        self.call_self.pub_init_check(owner, value);
    }

    #[external("private")]
    #[only_self]
    fn priv_only_self(owner: AztecAddress, value: Field) {}

    #[external("private")]
    fn priv_init_check(owner: AztecAddress, value: Field) {}

    #[external("private")]
    #[noinitcheck]
    fn priv_no_init_check(owner: AztecAddress, value: Field) {}

    #[external("public")]
    fn pub_init_check(owner: AztecAddress, value: Field) {}

    #[external("public")]
    #[noinitcheck]
    #[view]
    fn pub_no_init_check(owner: AztecAddress) -> pub Field {
        1
    }

    #[external("utility")]
    unconstrained fn utility_init_check(owner: AztecAddress) -> Field {
        2
    }
}
