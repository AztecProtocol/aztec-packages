// A contract used in end to end tests
contract TestAssert {
    use dep::aztec::{
        oracle::compute_selector::compute_selector,
    };

    #[aztec(private)]
    fn constructor(value: Field) {
        let selector = compute_selector("assert_is_zero(Field)");
        context.call_public_function(context.this_address(), selector, [value]);
    }

    #[aztec(public)]
    fn assert_is_zero(value: Field) {
        assert(0 == value);
    }
}
