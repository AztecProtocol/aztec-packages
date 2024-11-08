use dep::protocol_types::{
    abis::call_context::CallContext, header::Header, traits::Empty,
    transaction::tx_context::TxContext,
};

// PrivateContextInputs are expected to be provided to each private function
// docs:start:private-context-inputs
pub struct PrivateContextInputs {
    pub call_context: CallContext,
    pub historical_header: Header,
    pub tx_context: TxContext,
    pub start_side_effect_counter: u32,
}
// docs:end:private-context-inputs

impl Empty for PrivateContextInputs {
    fn empty() -> Self {
        PrivateContextInputs {
            call_context: CallContext::empty(),
            historical_header: Header::empty(),
            tx_context: TxContext::empty(),
            start_side_effect_counter: 0 as u32,
        }
    }
}
