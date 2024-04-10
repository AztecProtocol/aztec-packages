use crate::context::globals::public_global_variables::PublicGlobalVariables;

use dep::protocol_types::{abis::call_context::CallContext, header::Header};

// PublicContextInputs are expected to be provided to each public function
// docs:start:public-context-inputs
struct PublicContextInputs {
    call_context: CallContext,
    historical_header: Header,

    public_global_variables: PublicGlobalVariables,

    start_side_effect_counter: u32,
}
// docs:end:public-context-inputs

impl Default for PublicContextInputs {
    fn default() -> Self {
        PublicContextInputs {
            call_context: CallContext::default(),
            historical_header: Header::default(),
            public_global_variables: PublicGlobalVariables::default(),
            start_side_effect_counter: 0 as u32,
        }
    }
}
