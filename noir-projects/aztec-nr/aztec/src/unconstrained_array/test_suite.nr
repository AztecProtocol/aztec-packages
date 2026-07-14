//! Generates a shared [`UnconstrainedArray`](crate::unconstrained_array::UnconstrainedArray)
//! test suite from the helpers in [`test_helpers`](crate::unconstrained_array::test_helpers).

use crate::utils::cmap::CHashMap;

/// Maps test helpers marked with [`should_fail_test`] to their expected failure message.
pub(crate) comptime mut global EXPECTED_FAILURES: CHashMap<FunctionDefinition, Quoted> = CHashMap::new();

/// Marks a test helper as expected to fail with the given message, passed as a quoted string literal:
/// `#[should_fail_test(quote { "out of bounds" })]`. The tests generated from the helper get
/// `#[test(should_fail_with = ...)]` instead of plain `#[test]`.
pub(crate) comptime fn should_fail_test(f: FunctionDefinition, message: Quoted) {
    EXPECTED_FAILURES.insert(f, message);
}

/// Generates a shared [`UnconstrainedArray`](crate::unconstrained_array::UnconstrainedArray) test suite against the
/// given backend. Apply to a test module, passing the backend's oracle as a quoted path:
/// `#[unconstrained_array_tests(quote { crate::ephemeral::EphemeralOracles })]`.
pub(crate) comptime fn unconstrained_array_tests(_m: Module, oracle: Quoted) -> Quoted {
    let helpers = quote { crate::unconstrained_array::test_helpers }.as_module().unwrap();
    let mut tests = quote {};
    for f in helpers.functions() {
        let name = f.name();
        if f.is_unconstrained() {
            let fail = EXPECTED_FAILURES.get(f);
            let attr = if fail.is_some() {
                let msg = fail.unwrap();
                quote { #[test(should_fail_with = $msg)] }
            } else {
                quote { #[test] }
            };
            tests = quote {
                $tests
                $attr
                unconstrained fn $name() {
                    crate::unconstrained_array::test_helpers::$name::<$oracle>();
                }
            };
        } else {
            panic(
                f"unexpected non-unconstrained function `{name}` in test_helpers: every test helper must be unconstrained",
            )
        }
    }
    tests
}
