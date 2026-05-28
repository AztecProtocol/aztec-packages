/// Marks a function as an oracle integration test.
///
/// Oracle tests verify that TS and Noir agree on oracle serialization. The test calls a real oracle function, which the
/// TS resolver matches against hardcoded fixtures to verify both param deserialization and return serialization across
/// the Noir-TS boundary.
///
/// Oracle tests use a dedicated TS oracle resolver server (different from the one used by TXE). The macro generates a
/// `#[test]` wrapper with a `__oracle_test__` prefix that calls the original function, so that:
/// - They run against the test resolver rather than the TXE oracle resolver
/// - The CI test runner can target them separately
///
/// For oracles with no inputs and multiple fixture scenarios, pass a scenario name to select which fixture to use:
/// `#[oracle_test("some")]`. The resolver matches the name against the fixture's `name` field.
///
/// ## Usage
///
/// ```noir
/// use crate::macros::oracle_testing::oracle_test;
///
/// #[oracle_test]
/// unconstrained fn my_oracle() {
///     let result = my_oracle_internal(42);
///     assert_eq(result, 9999, "expected value");
/// }
///
/// #[oracle_test("some")]
/// unconstrained fn my_oracle_returns_some() {
///     let result = my_optional_oracle();
///     assert(result.is_some(), "expected Some");
/// }
///
/// #[oracle_test("none")]
/// unconstrained fn my_oracle_returns_none() {
///     let result = my_optional_oracle();
///     assert(result.is_none(), "expected None");
/// }
/// ```
#[varargs]
pub comptime fn oracle_test(f: FunctionDefinition, args: [CtString]) -> Quoted {
    let name = f.name();
    let prefixed_name = f"__oracle_test__{name}".quoted_contents();

    // If a scenario was configured, then call the oracle to set the scenario
    let setup = if args.len() == 0 {
        quote {}
    } else {
        let scenario = args[0].as_quoted_str!();
        quote { crate::macros::oracle_testing::set_oracle_test_scenario_oracle($scenario); }
    };

    // Generate test to call the function that contains the oracle call and assertions
    quote {
        #[test]
        unconstrained fn $prefixed_name() {
            $setup
            $name()
        }
    }
}

/// Tells the oracle test resolver to use a named fixture scenario for the next oracle call in this test session. This
/// oracle is only handled by the test resolver (PXE and TXE do not implement it). Called automatically by the
/// `#[oracle_test("scenario_name")]` macro.
///
#[oracle(aztec_oracle_test_set_scenario)]
pub(crate) unconstrained fn set_oracle_test_scenario_oracle<let N: u32>(_scenario_name: str<N>) {}
