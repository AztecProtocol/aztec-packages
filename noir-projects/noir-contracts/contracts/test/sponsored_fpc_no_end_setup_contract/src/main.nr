use dep::aztec::macros::aztec;

/// FOR TESTING ONLY
/// This contract covers transaction fees for users unconditionally, and doesn't end the setup phase.
/// Useful for e2e testing of phase checking only.
#[aztec]
pub contract SponsoredFPCNoEndSetup {
    use dep::aztec::macros::functions::{external, nophasecheck};

    /// Sponsors the transaction unconditionally. Doesn't end the setup phase.
    #[external("private")]
    #[nophasecheck]
    fn sponsor_unconditionally() {
        // Set the FPC as the fee payer of the tx.
        self.context.set_as_fee_payer();
    }
}
