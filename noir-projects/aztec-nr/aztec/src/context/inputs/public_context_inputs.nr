use dep::protocol_types::traits::Empty;

struct PublicContextInputs {
    selector: Field,
    args_hash: Field,
}

impl Empty for PublicContextInputs {
    fn empty() -> Self {
        PublicContextInputs {
            selector: 0,
            args_hash: 0,
        }
    }
}
