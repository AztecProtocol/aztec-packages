use aztec::macros::aztec;

// The sole purpose of this contract is to serve as a Noir interface for the real FeeJuice contract. This was done
// because the real FeeJuice contract has been stripped of `aztec-nr` macros which results in the nice Noir
// interface no longer being generated.
//
// (We've stripped the contract of `aztec-nr` macros in order for auditors to not need to audit them - protocol
// contracts were audited during the protocol circuits audit).
//
// For context, this is the interface I am talking about:
// ```noir
// let balance = self.view(FeeJuice::at(FEE_JUICE_ADDRESS).balance_of_public(owner));
// ```
// where the macros generate the `FeeJuice` struct.
#[aztec]
pub contract FeeJuice {
    use aztec::{macros::functions::{allow_phase_change, external, only_self, view}, protocol::address::AztecAddress};

    #[external("private")]
    fn claim(to: AztecAddress, amount: u128, secret: Field, message_leaf_index: Field) {}

    #[external("private")]
    #[allow_phase_change]
    fn claim_and_end_setup(to: AztecAddress, amount: u128, secret: Field, message_leaf_index: Field) {}

    #[external("public")]
    #[only_self]
    fn _increase_public_balance(to: AztecAddress, amount: u128) {}

    #[external("public")]
    #[view]
    fn check_balance(fee_limit: u128) {}

    #[external("public")]
    #[view]
    fn balance_of_public(owner: AztecAddress) -> pub u128 {
        0
    }
}
