// Tests that contract functions using a type that does not implement Serialize fail to compile, for all function types
// (private, public, utility) and both return types and parameters.
use aztec::macros::aztec;

#[aztec]
pub contract NonSerializable {
    use aztec::macros::functions::external;
    use aztec::protocol::traits::Deserialize;

    #[derive(Deserialize)]
    pub struct NotSerializable {
        x: Field,
    }

    #[external("private")]
    fn bad_private_return() -> pub NotSerializable {
        NotSerializable { x: 1 }
    }

    #[external("private")]
    fn bad_private_param(_p: NotSerializable) {}

    #[external("public")]
    fn bad_public_return() -> pub NotSerializable {
        NotSerializable { x: 1 }
    }

    #[external("public")]
    fn bad_public_param(_p: NotSerializable) {}

    #[external("utility")]
    unconstrained fn bad_utility_return() -> pub NotSerializable {
        NotSerializable { x: 1 }
    }

    #[external("utility")]
    unconstrained fn bad_utility_param(_p: NotSerializable) {}
}
