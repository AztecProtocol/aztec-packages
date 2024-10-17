// An entrypoint contract that allows everything to go through. Only used for testing
// Pair this with SignerlessWallet to perform multiple actions before any account contracts are deployed (and without authentication)
use dep::aztec::macros::aztec;

#[aztec]
contract MultiCallEntrypoint {
    use dep::authwit::entrypoint::app::AppPayload;
    use dep::aztec::macros::functions::private;

    #[private]
    fn entrypoint(app_payload: AppPayload) {
        app_payload.execute_calls(&mut context);
    }
}
