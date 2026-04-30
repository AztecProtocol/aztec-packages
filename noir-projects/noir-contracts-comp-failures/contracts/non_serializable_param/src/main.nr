use aztec::macros::aztec;

#[aztec]
pub contract NonSerializableParam {
    use aztec::macros::functions::external;
    use aztec::protocol::traits::Deserialize;

    #[derive(Deserialize)]
    pub struct NotSerializable {
        x: Field,
    }

    #[external("utility")]
    unconstrained fn bad_param(_param: NotSerializable) {}
}
