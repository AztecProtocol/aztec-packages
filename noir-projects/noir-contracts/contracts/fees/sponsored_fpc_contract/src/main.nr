use dep::aztec::macros::aztec;

/// FOR TESTING ONLY
/// Sponsored Fee Payment Contract (Sponsored FPC)
/// This contract covers transaction fees for users unconditionally.
#[aztec]
pub contract SponsoredFPC {
    use dep::aztec::macros::functions::private;

    /// Sponsors the transaction unconditionally.
    #[private]
    fn sponsor_unconditionally() {
        // Set the FPC as the fee payer of the tx.
        context.set_as_fee_payer();
    }
}
