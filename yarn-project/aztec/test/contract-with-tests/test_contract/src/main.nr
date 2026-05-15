contract TestContract {
    fn dummy() -> pub Field {
        0
    }
}

#[test]
fn test_should_not_be_in_contract() {
    assert(1 == 1);
}
