fn main(x: pub u8, y: u8) {
    /// Safety: testing
    unsafe {}

    /// Safety: testing
    unsafe {
        //@safety: testing
        assert_eq(x, y);
    }
}

