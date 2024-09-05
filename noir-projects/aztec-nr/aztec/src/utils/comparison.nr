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

mod test {
    use super::assert_comparison;
    use super::Comparator;

    #[test]
    fn test_assert_comparison_happy_path() {
        let lhs = 10;
        let rhs = 10;
        assert_comparison(lhs, Comparator.EQ, rhs, "Expected lhs to be equal to rhs");

        let lhs = 10;
        let rhs = 11;
        assert_comparison(lhs, Comparator.NEQ, rhs, "Expected lhs to be not equal to rhs");

        let lhs = 10;
        let rhs = 11;
        assert_comparison(lhs, Comparator.LT, rhs, "Expected lhs to be less than rhs");

        let lhs = 10;
        let rhs = 10;
        assert_comparison(
            lhs,
            Comparator.LTE,
            rhs,
            "Expected lhs to be less than or equal to rhs"
        );

        let lhs = 11;
        let rhs = 10;
        assert_comparison(lhs, Comparator.GT, rhs, "Expected lhs to be greater than rhs");

        let lhs = 10;
        let rhs = 10;
        assert_comparison(
            lhs,
            Comparator.GTE,
            rhs,
            "Expected lhs to be greater than or equal to rhs"
        );

        let lhs = 11;
        let rhs = 10;
        assert_comparison(
            lhs,
            Comparator.GTE,
            rhs,
            "Expected lhs to be greater than or equal to rhs"
        );
    }

    #[test(should_fail_with="Expected lhs to be equal to rhs")]
    fn test_assert_comparison_fail_eq() {
        let lhs = 10;
        let rhs = 11;
        assert_comparison(lhs, Comparator.EQ, rhs, "Expected lhs to be equal to rhs");
    }

    #[test(should_fail_with="Expected lhs to be not equal to rhs")]
    fn test_assert_comparison_fail_neq() {
        let lhs = 10;
        let rhs = 10;
        assert_comparison(lhs, Comparator.NEQ, rhs, "Expected lhs to be not equal to rhs");
    }

    #[test(should_fail_with="Expected lhs to be less than rhs")]
    fn test_assert_comparison_fail_lt() {
        let lhs = 11;
        let rhs = 10;
        assert_comparison(lhs, Comparator.LT, rhs, "Expected lhs to be less than rhs");
    }

    #[test(should_fail_with="Expected lhs to be less than or equal to rhs")]
    fn test_assert_comparison_fail_lte() {
        let lhs = 11;
        let rhs = 10;
        assert_comparison(
            lhs,
            Comparator.LTE,
            rhs,
            "Expected lhs to be less than or equal to rhs"
        );
    }

    #[test(should_fail_with="Expected lhs to be greater than rhs")]
    fn test_assert_comparison_fail_gt() {
        let lhs = 10;
        let rhs = 10;
        assert_comparison(lhs, Comparator.GT, rhs, "Expected lhs to be greater than rhs");
    }

    #[test(should_fail_with="Expected lhs to be greater than or equal to rhs")]
    fn test_assert_comparison_fail_gte() {
        let lhs = 10;
        let rhs = 11;
        assert_comparison(
            lhs,
            Comparator.GTE,
            rhs,
            "Expected lhs to be greater than or equal to rhs"
        );
    }

    #[test(should_fail_with="Expected lhs to be greater than or equal to rhs")]
    fn test_assert_comparison_fail_gte_2() {
        let lhs = 10;
        let rhs = 11;
        assert_comparison(
            lhs,
            Comparator.GTE,
            rhs,
            "Expected lhs to be greater than or equal to rhs"
        );
    }
}
