use aztec::macros::aztec;

#[aztec]
pub contract Main {
    use aztec::macros::functions::{external, initializer};

    #[initializer]
    #[external("private")]
    fn constructor() {}
}
