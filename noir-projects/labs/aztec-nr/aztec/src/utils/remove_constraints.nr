/// Calls a function and returns its return value, but removes any constraints associated with calling the function,
/// behaving as if the function was unconstrained.
pub unconstrained fn remove_constraints<Env, T>(f: fn[Env]() -> T) -> T {
    f()
}

/// Calls a function and returns its return value, removing any constraints associated with calling the function if
/// `condition` is true, behaving as if the function was unconstrained.
///
/// Requires `condition` to be a compile time constant.
pub fn remove_constraints_if<Env, T>(condition: bool, f: fn[Env]() -> T) -> T {
    // If `condition` is not a compile-time constant, then the compiler won't optimize away the branch not taken in the
    // if statement below, and we may end up with constraints for `f` regardless of the runtime value of `condition`.
    assert_constant(condition);

    if condition {
        // Safety: the purpose of this function is to execute `f` with no constraints when `condition` is true.
        unsafe {
            remove_constraints(f)
        }
    } else {
        f()
    }
}

mod test {
    use super::remove_constraints;

    fn return_unit() -> () {
        ()
    }

    fn return_field() -> Field {
        5
    }

    #[test]
    fn returns_unit() {
        let expected = return_unit();
        // Safety: this is a test
        let actual = unsafe { remove_constraints(|| return_unit()) };
        assert_eq(actual, expected);
    }

    #[test]
    fn returns_original_value() {
        let expected = return_field();
        // Safety: this is a test
        let actual = unsafe { remove_constraints(|| return_field()) };
        assert_eq(actual, expected);
    }

    #[test]
    unconstrained fn returns_unit_unconstrained() {
        let expected = return_unit();
        let actual = remove_constraints(|| return_unit());
        assert_eq(actual, expected);
    }

    #[test]
    unconstrained fn returns_original_value_unconstrained() {
        let expected = return_field();
        let actual = remove_constraints(|| return_field());
        assert_eq(actual, expected);
    }
}
