use aztec::macros::aztec;

#[aztec]
pub contract NonSerializableReturnType {
    use aztec::macros::functions::external;
    use aztec::protocol::traits::Deserialize;

    #[derive(Deserialize)]
    pub struct NotSerializable {
        x: Field,
    }

    #[external("private")]
    fn bad_return() -> pub NotSerializable {
        NotSerializable { x: 1 }
    }
}
