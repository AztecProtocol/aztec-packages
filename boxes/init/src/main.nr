
use aztec::macros::aztec;

#[aztec]
contract Main {
    #[external("private")]
    #[initializer]
    fn constructor() { }
}
