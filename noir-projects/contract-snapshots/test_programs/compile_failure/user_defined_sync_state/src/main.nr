/// The name `sync_state` is reserved for the function auto-injected by the #[aztec] macro.
/// Use AztecConfig::custom_sync_state() to customize sync behavior.
use aztec::macros::aztec;

#[aztec]
contract UserDefinedSyncState {
    use aztec::macros::functions::external;
    use aztec::protocol::address::AztecAddress;

    #[external("private")]
    fn sync_state(_scope: AztecAddress) {}
}
