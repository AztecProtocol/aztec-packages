contract TestContract {
    fn constructor() -> pub Field {
        dep::test::foo()
    }
}
