// Tests that contract functions using a type that does not implement Deserialize fail to compile, for all function types
// (private, public, utility) and both return types and parameters.
use aztec::macros::aztec;

#[aztec]
pub contract NonDeserializable {
    use aztec::macros::functions::external;
    use aztec::protocol::traits::Serialize;

    #[derive(Serialize)]
    pub struct NotDeserializable {
        x: Field,
    }

    #[external("private")]
    fn bad_private_return() -> pub NotDeserializable {
        NotDeserializable { x: 1 }
    }

    #[external("private")]
    fn bad_private_param(_p: NotDeserializable) {}

    #[external("public")]
    fn bad_public_return() -> pub NotDeserializable {
        NotDeserializable { x: 1 }
    }

    #[external("public")]
    fn bad_public_param(_p: NotDeserializable) {}

    #[external("utility")]
    unconstrained fn bad_utility_return() -> pub NotDeserializable {
        NotDeserializable { x: 1 }
    }

    #[external("utility")]
    unconstrained fn bad_utility_param(_p: NotDeserializable) {}
}
