// An entrypoint contract that allows all calls to go through.
//
// Used for testing and for situations such as account contract self-deployments (when the account's own entrypoint
// cannot be used because it is not yet deployed).
//
// Pair this with SignerlessWallet to perform multiple actions before any account contracts are deployed (and without
// authentication).
//
// Note that this contract should not be grouped with protocol contracts as it is not part of the protocol. We keep
// it here for now as it allows us to use hardcoded address.
use aztec::{macros::{aztec, AztecConfig}, messages::discovery::do_sync_state_no_op};

#[aztec(AztecConfig::new().custom_sync_state(do_sync_state_no_op))]
pub contract MultiCallEntrypoint {
    use aztec::{authwit::entrypoint::app::AppPayload, macros::functions::{allow_phase_change, external}};

    #[external("private")]
    #[allow_phase_change]
    fn entrypoint(app_payload: AppPayload) {
        app_payload.execute_calls(self.context);
    }
}
