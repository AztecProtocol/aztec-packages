fn main(x: pub(u8), n: u8) -> pub u8 {
    if x == 0 {
        0
    }
    if x == 1 {
        1
    }
    main(x - 1) + main(x - 2)
}

