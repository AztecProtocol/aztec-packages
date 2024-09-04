struct ComparatorEnum {
    EQ: u8,
    NEQ: u8,
    LT: u8,
    LTE: u8,
    GT: u8,
    GTE: u8,
}

global Comparator = ComparatorEnum {
    EQ: 1,
    NEQ: 2,
    LT: 3,
    LTE: 4,
    GT: 5,
    GTE: 6,
};

pub fn assert_comparison<let N: u32>(lhs: Field, operation: u8, rhs: Field, error_msg: str<N>) {
    // Values are computed ahead of time because circuits evaluate all branches
    let is_equal = lhs == rhs;
    let is_lt = lhs.lt(rhs);

    if (operation == Comparator.EQ) {
        assert(is_equal, error_msg);
    } else if (operation == Comparator.NEQ) {
        assert(!is_equal, error_msg);
    } else if (operation == Comparator.LT) {
        assert(is_lt, error_msg);
    } else if (operation == Comparator.LTE) {
        assert(is_lt | is_equal, error_msg);
    } else if (operation == Comparator.GT) {
        assert(!is_lt & !is_equal, error_msg);
    } else if (operation == Comparator.GTE) {
        assert(!is_lt, error_msg);
    }
}
