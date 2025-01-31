struct ComparatorEnum {
    pub EQ: u8,
    pub NEQ: u8,
    pub LT: u8,
    pub LTE: u8,
    pub GT: u8,
    pub GTE: u8,
}

pub global Comparator: ComparatorEnum =
    ComparatorEnum { EQ: 1, NEQ: 2, LT: 3, LTE: 4, GT: 5, GTE: 6 };

pub fn compare(lhs: Field, operation: u8, rhs: Field) -> bool {
    // Values are computed ahead of time because circuits evaluate all branches
    let is_equal = lhs == rhs;
    let is_lt = lhs.lt(rhs);

    if (operation == Comparator.EQ) {
        is_equal
    } else if (operation == Comparator.NEQ) {
        !is_equal
    } else if (operation == Comparator.LT) {
        is_lt
    } else if (operation == Comparator.LTE) {
        is_lt | is_equal
    } else if (operation == Comparator.GT) {
        !is_lt & !is_equal
    } else if (operation == Comparator.GTE) {
        !is_lt
    } else {
        panic(f"Invalid operation")
    }
}

mod test {
    use super::Comparator;
    use super::compare;

    #[test]
    unconstrained fn test_compare() {
        let lhs = 10;
        let rhs = 10;
        assert(compare(lhs, Comparator.EQ, rhs), "Expected lhs to be equal to rhs");

        let lhs = 10;
        let rhs = 11;
        assert(compare(lhs, Comparator.NEQ, rhs), "Expected lhs to be not equal to rhs");

        let lhs = 10;
        let rhs = 11;
        assert(compare(lhs, Comparator.LT, rhs), "Expected lhs to be less than rhs");

        let lhs = 10;
        let rhs = 10;
        assert(compare(lhs, Comparator.LTE, rhs), "Expected lhs to be less than or equal to rhs");

        let lhs = 11;
        let rhs = 10;
        assert(compare(lhs, Comparator.GT, rhs), "Expected lhs to be greater than rhs");

        let lhs = 10;
        let rhs = 10;
        assert(
            compare(lhs, Comparator.GTE, rhs),
            "Expected lhs to be greater than or equal to rhs",
        );

        let lhs = 11;
        let rhs = 10;
        assert(
            compare(lhs, Comparator.GTE, rhs),
            "Expected lhs to be greater than or equal to rhs",
        );

        let lhs = 10;
        let rhs = 11;
        assert(!compare(lhs, Comparator.EQ, rhs), "Expected lhs to be not equal to rhs");

        let lhs = 10;
        let rhs = 10;
        assert(!compare(lhs, Comparator.NEQ, rhs), "Expected lhs to not be not equal to rhs");

        let lhs = 11;
        let rhs = 10;
        assert(!compare(lhs, Comparator.LT, rhs), "Expected lhs to not be less than rhs");

        let lhs = 11;
        let rhs = 10;
        assert(
            !compare(lhs, Comparator.LTE, rhs),
            "Expected lhs to not be less than or equal to rhs",
        );

        let lhs = 10;
        let rhs = 10;
        assert(!compare(lhs, Comparator.GT, rhs), "Expected lhs to not be greater than rhs");

        let lhs = 10;
        let rhs = 11;
        assert(
            !compare(lhs, Comparator.GTE, rhs),
            "Expected lhs to not be greater than or equal to rhs",
        );

        let lhs = 10;
        let rhs = 11;
        assert(
            !compare(lhs, Comparator.GTE, rhs),
            "Expected lhs to not be greater than or equal to rhs",
        );
    }
}
