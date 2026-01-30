use aztec::macros::aztec;

// The sole purpose of this contract is to serve as a Noir interface for the real AuthRegistry contract. This was done
// because the real AuthRegistry contract has been stripped of `aztec-nr` macros which results in the nice Noir
// interface no longer being generated.
//
// (We've stripped the contract of `aztec-nr` macros in order for auditors to not need to audit them - protocol
// contracts were audited during the protocol circuits audit).
//
// For context, this is the interface I am talking about:
// ```noir
// let is_reject_all = self.view(AuthRegistry::at(CANONICAL_AUTH_REGISTRY_ADDRESS).is_reject_all(self.address));
// ```
// where the macros generate the `AuthRegistry` struct.
#[aztec]
pub contract AuthRegistry {
    use aztec::{macros::functions::{external, view}, protocol::address::AztecAddress};

    #[external("public")]
    fn set_authorized(message_hash: Field, authorize: bool) {}

    #[external("public")]
    fn set_reject_all(reject: bool) {}

    #[external("public")]
    fn consume(on_behalf_of: AztecAddress, inner_hash: Field) -> Field {
        0
    }

    #[external("private")]
    fn set_authorized_private(approver: AztecAddress, message_hash: Field, authorize: bool) {}

    #[external("public")]
    #[view]
    fn is_reject_all(on_behalf_of: AztecAddress) -> bool {
        false
    }

    #[external("public")]
    #[view]
    fn is_consumable(on_behalf_of: AztecAddress, message_hash: Field) -> bool {
        false
    }

    #[external("utility")]
    unconstrained fn utility_is_consumable(
        on_behalf_of: AztecAddress,
        message_hash: Field,
    ) -> bool {
        false
    }
}
