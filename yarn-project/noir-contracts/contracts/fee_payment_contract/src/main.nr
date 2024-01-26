contract FeePayment {
    use dep::std;
    use dep::aztec::protocol_types::{
        abis::function_selector::FunctionSelector,
        address::AztecAddress,
    };

    #[aztec(private)]
    fn constructor() {}

    #[aztec(public)]
    fn disburse_fee(asset_contract_address: AztecAddress, coinbase: AztecAddress, fee: Field) {
        // No validation, just pay the sequencer the full fee
        // TODO(fees) validation
        // TODO(fees) gas
        // TODO(fees) refund fee leftover
        let this = context.this_address();
        let selector = FunctionSelector::from_signature("transfer_public((Field),(Field),Field,Field)");

        let _void = context.call_public_function(
            asset_contract_address,
            selector,
            [this.to_field(), coinbase.to_field(), fee, 0]
        );
    }
}
