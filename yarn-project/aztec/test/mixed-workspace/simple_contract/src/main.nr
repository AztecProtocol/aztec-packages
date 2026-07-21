use aztec::macros::aztec;

#[aztec]
pub contract SimpleContract {
    use aztec::macros::functions::external;

    #[external("private")]
    fn private_function() -> Field {
        0
    }

    #[external("private")]
    fn another_private_function(x: Field) -> Field {
        x
    }
}
