use aztec::macros::aztec;

#[aztec]
pub contract NonDeserializableParam {
    use aztec::macros::functions::external;
    use aztec::protocol::traits::Serialize;

    #[derive(Serialize)]
    pub struct NotDeserializable {
        x: Field,
    }

    #[external("utility")]
    unconstrained fn bad_param(_param: NotDeserializable) {}
}
