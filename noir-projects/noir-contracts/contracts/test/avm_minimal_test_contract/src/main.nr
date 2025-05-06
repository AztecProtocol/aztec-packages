use dep::aztec::macros::aztec;

#[aztec]
contract AvmMinimalTest {
    use dep::aztec::macros::functions::public;

    #[public]
    fn add_u8(a: u8, b: u8) -> u8 {
        a + b
    }
}
