//! # Oracle serialization roundtrip tests
//!
//! Both sides of an oracle must agree on how each argument and return value is serialized to field elements. If they
//! drift (one side reorders fields, changes a type's wire layout, adds a value) calls silently corrupt, so we want a
//! test that exercises the *real* serialization on both sides and checks they still match.
//!
//! `#[generate_oracle_tests]`, applied to a module, generates that test from each oracle's signature. The generated
//! test:
//!   1. builds a canonical value for every parameter and the return type (via the [`OracleTestValue`] trait),
//!   2. calls the real oracle, which serializes the arguments and sends them to a dedicated TS resolver,
//!   3. the resolver deserializes the arguments, checks them against the same canonical values (which it rebuilds
//!      independently from the oracle's registered type), and serializes a canonical return value back,
//!   4. Noir deserializes that return value and asserts it equals the expected one.
//!
//! So if the two serializers agree the test passes, and if they drift it fails. The TS half of the convention lives in
//! `yarn-project/txe/src/oracle/test-resolver/default_fixtures.ts` and must stay in lockstep with this file: its
//! `TEST_VALUE_IMPLS` table mirrors the [`OracleTestValue`] impls here one-to-one.
//!
//! ## The scenario convention
//!
//! [`OracleTestValue`] maps a `seed` to an array of [`Scenario`]s, each a canonical value plus the name of the
//! serialization shape it exercises. Most types have a single, unnamed scenario; a type whose cases serialize
//! differently declares several named ones (`Option<T>` has `some` and `none`). The macro emits one test per scenario.
//!
//! ## What gets generated
//!
//! Given an oracle in a module annotated with `#[generate_oracle_tests(...)]`:
//!
//! ```noir
//! #[oracle(aztec_avm_nullifierExists)]
//! unconstrained fn nullifier_exists_opcode(siloed_nullifier: Field) -> bool {}
//! ```
//!
//! the macro produces:
//!
//! ```noir
//! #[test]
//! unconstrained fn __oracle_test__nullifier_exists_opcode() {
//!     let __arg_0 = <Field as OracleTestValue<1>>::oracle_test_value(0)[0];
//!     let __ret = <bool as OracleTestValue<1>>::oracle_test_value(0)[0];
//!     assert_eq(nullifier_exists_opcode(__arg_0.value), __ret.value, "...");
//! }
//! ```
//!
//! ## Multiple scenarios
//!
//! A value with more than one serialization shape (e.g. an `Option`, which has two: `some` and `none`) makes the macro
//! emit one test per scenario. For example:
//!
//! ```noir
//! #[oracle(aztec_utl_getWitness)]
//! unconstrained fn get_witness_oracle(key: Option<Field>) -> Option<Field> {}
//! ```
//!
//! produces two tests: `some+some` and `none+none`. Each scenario becomes its own `#[test]`, suffixed by index
//! (`__0`, `__1`, …).

use crate::protocol::{
    abis::function_selector::FunctionSelector,
    address::{AztecAddress, EthAddress},
    traits::FromField,
};

/// Max capacity of [`Scenario`] names.
global MAX_SCENARIO_NAME_LEN: u32 = 64;

/// The base every seed is offset by.
///
/// When generating test values we want two parameters of the same type to get different values, so that a Noir/TS
/// disagreement about argument order shows up as a mismatch instead of passing silently. Each value is derived from a
/// `seed`: argument `i` uses `SEED_BASE + i`, and the return value uses `SEED_BASE + len(args)` (the slot right after
/// the last argument, so it stays distinct from every parameter). We start from a non-zero base because otherwise a
/// serializer that zeroes or drops a field could match a coincidentally-zero expected value. Must match `SEED_BASE` in
/// the TS synthesizer (`default_fixtures.ts`).
global SEED_BASE: u32 = 10;

/// One canonical test case for a type: the `value` to put on the wire (or expect back from it), and the `name` of the
/// serialization shape it exercises. Single-scenario types leave the name empty; it is never sent to the resolver.
pub struct Scenario<T> {
    pub value: T,
    pub name: BoundedVec<u8, MAX_SCENARIO_NAME_LEN>,
}

impl<T> Scenario<T> {
    pub fn unnamed(value: T) -> Self {
        Self { value, name: BoundedVec::new() }
    }

    pub fn named<let N: u32>(value: T, name: str<N>) -> Self {
        Self { value, name: BoundedVec::from_array(name.as_bytes()) }
    }
}

/// Maps a `seed` to the canonical test scenarios for a type, one per serialization shape. `N` is the scenario count,
/// declared on each impl and read from there by [`num_scenarios`]. See [`SEED_BASE`] for what `seed` is. Mirrored
/// exactly by the TS resolver's fixture synthesizer (`default_fixtures.ts`).
pub trait OracleTestValue<let N: u32> {
    fn oracle_test_value(seed: u32) -> [Scenario<Self>; N];
}

impl OracleTestValue<1> for Field {
    fn oracle_test_value(seed: u32) -> [Scenario<Self>; 1] {
        [Scenario::unnamed(seed as Field)]
    }
}
impl OracleTestValue<1> for u32 {
    fn oracle_test_value(seed: u32) -> [Scenario<Self>; 1] {
        [Scenario::unnamed(seed)]
    }
}
impl OracleTestValue<1> for u64 {
    fn oracle_test_value(seed: u32) -> [Scenario<Self>; 1] {
        [Scenario::unnamed(seed as u64)]
    }
}
impl OracleTestValue<1> for u128 {
    fn oracle_test_value(seed: u32) -> [Scenario<Self>; 1] {
        [Scenario::unnamed(seed as u128)]
    }
}
impl OracleTestValue<1> for u8 {
    fn oracle_test_value(seed: u32) -> [Scenario<Self>; 1] {
        [Scenario::unnamed(seed as u8)]
    }
}
impl OracleTestValue<1> for bool {
    fn oracle_test_value(seed: u32) -> [Scenario<Self>; 1] {
        [Scenario::unnamed((seed % 2) != 0)]
    }
}
impl OracleTestValue<1> for AztecAddress {
    fn oracle_test_value(seed: u32) -> [Scenario<Self>; 1] {
        [Scenario::unnamed(AztecAddress::from_field(seed as Field))]
    }
}
impl OracleTestValue<1> for FunctionSelector {
    fn oracle_test_value(seed: u32) -> [Scenario<Self>; 1] {
        [Scenario::unnamed(FunctionSelector::from_field(seed as Field))]
    }
}
impl OracleTestValue<1> for EthAddress {
    fn oracle_test_value(seed: u32) -> [Scenario<Self>; 1] {
        [Scenario::unnamed(EthAddress::from_field(seed as Field))]
    }
}
impl<T> OracleTestValue<2> for Option<T>
where
    T: OracleTestValue<1>,
{
    fn oracle_test_value(seed: u32) -> [Scenario<Self>; 2] {
        [
            Scenario::named(Option::some(T::oracle_test_value(seed)[0].value), "some"),
            Scenario::named(Option::none(), "none"),
        ]
    }
}
impl<T, let N: u32> OracleTestValue<1> for [T; N]
where
    T: OracleTestValue<1>,
{
    fn oracle_test_value(seed: u32) -> [Scenario<Self>; 1] {
        // `N` is the array length, which `pinned_type` set to `TEST_COLLECTION_LEN`; each element is seeded distinctly
        // so element ordering is covered too.
        let mut array: [T; N] = std::mem::zeroed();
        for i in 0..N {
            array[i] = T::oracle_test_value(seed + i)[0].value;
        }
        [Scenario::unnamed(array)]
    }
}
impl<T, let MaxLen: u32> OracleTestValue<1> for BoundedVec<T, MaxLen>
where
    T: OracleTestValue<1>,
{
    fn oracle_test_value(seed: u32) -> [Scenario<Self>; 1] {
        // TEST_COLLECTION_LEN elements into a capacity the macro pins to TEST_BOUNDED_VEC_CAP, leaving a padded tail.
        let mut bounded_vec: BoundedVec<T, MaxLen> = BoundedVec::new();
        for i in 0..TEST_COLLECTION_LEN {
            bounded_vec.push(T::oracle_test_value(seed + i)[0].value);
        }
        [Scenario::unnamed(bounded_vec)]
    }
}

/// Generates serialization roundtrip tests for every `#[oracle(...)]` declaration in a module. See the module docs for
/// the full scheme. Use [`generate_oracle_tests_excluding`] when some of the module's oracles must be left out.
///
/// ## Usage
///
/// ```noir
/// #[generate_oracle_tests]
/// pub mod nullifiers;
/// ```
pub comptime fn generate_oracle_tests(m: Module) -> Quoted {
    let none: [Quoted] = @[];
    generate_oracle_tests_excluding(m, none)
}

/// Like [`generate_oracle_tests`], but leaves out the oracles named in `skip` (by Noir function name).
///
/// Every oracle in the module must be testable or excluded: if an oracle's parameters or return type can't be
/// synthesized (no [`OracleTestValue`] impl), generating its test fails at compile time and the dev must add it to
/// `skip`. Every `skip` entry must in turn match an oracle in the module.
///
/// ## Usage
///
/// ```noir
/// #[generate_oracle_tests_excluding(@[
///     quote { transaction_fee_opcode },
/// ])]
/// pub mod avm;
/// ```
pub comptime fn generate_oracle_tests_excluding(m: Module, skip: [Quoted]) -> Quoted {
    let oracles = m.functions().filter(|f: FunctionDefinition| f.has_named_attribute("oracle"));

    // Guard against stale skip-list entries: every name must match an oracle in this module.
    for s in skip {
        assert(
            oracles.any(|f: FunctionDefinition| f.name() == s),
            f"oracle test skip-list entry {s} matched no oracle in {m}",
        );
    }

    let tests = oracles
        .filter(|f: FunctionDefinition| !skip.any(|s: Quoted| s == f.name()))
        .map(|f: FunctionDefinition| oracle_test_for(f));
    tests.join(quote {})
}

/// Generates the roundtrip test(s) for a single oracle: one `#[test]` per scenario (see the module docs).
comptime fn oracle_test_for(f: FunctionDefinition) -> Quoted {
    let oracle = f.name();
    let scenarios = prepare_scenarios(f);
    let multi = scenarios.len() > 1;

    let mut tests: [Quoted] = @[];
    for i in 0..scenarios.len() {
        let (setup, assertion) = scenarios[i];
        tests = tests.push_back(build_test(oracle, setup, assertion, multi, i));
    }
    tests.join(quote {})
}

/// Builds each generated test's `(setup, assertion)`, one per scenario.
///
/// For `fn get(slot: Field) -> Field` the single scenario's pair is:
///   setup     = `let __arg_0 = ...; let __ret = ...;` (the `OracleTestValue` bindings, plus any announcements)
///   assertion = `assert_eq(get(__arg_0.value), __ret.value, "...");`
comptime fn prepare_scenarios(f: FunctionDefinition) -> [(Quoted, Quoted)] {
    let oracle = f.name();
    let params = f.parameters();
    let return_type = f.return_type();
    let count = total_scenarios(params, return_type);
    let mut result: [(Quoted, Quoted)] = @[];

    for scenario in 0..count {
        let mut setup: [Quoted] = @[];
        let mut call_args: [Quoted] = @[];

        for i in 0..params.len() {
            let (_name, param_type) = params[i];
            let arg = f"__arg_{i}".quoted_contents();
            let (binding, value) = bind_scenario(param_type, arg, i, scenario);
            setup = setup.push_back(binding);
            call_args = call_args.push_back(value);
        }

        let args = call_args.join(quote {,});
        // The return's position is the slot right after the last parameter (params take 0..len-1), so its value is
        // distinct.
        let return_position = params.len();
        let (return_binding, assertion) = build_assertion(oracle, args, return_type, return_position, scenario);
        setup = setup.push_back(return_binding);

        result = result.push_back((setup.join(quote {}), assertion));
    }
    result
}

/// Wraps one scenario's `setup` and `assertion` in a named `#[test]`. A multi-scenario oracle gets an index-suffixed
/// test name so its per-scenario tests don't collide.
comptime fn build_test(oracle: Quoted, setup: Quoted, assertion: Quoted, multi: bool, index: u32) -> Quoted {
    let test_name = if multi {
        f"__oracle_test__{oracle}__{index}".quoted_contents()
    } else {
        f"__oracle_test__{oracle}".quoted_contents()
    };

    quote {
        #[test]
        unconstrained fn $test_name() {
            $setup
            $assertion
        }
    }
}

/// The number of scenarios an oracle's tests must cover: the largest scenario count across its parameters and return
/// type (usually 1; a multi-scenario type such as `Option`, which has 2, raises it).
///
/// Example: `fn get(slot: Field) -> Option<Field>` yields `max(1, 2) = 2` (the `Field` param has one scenario, the
/// `Option` return has two), so the macro emits two tests.
comptime fn total_scenarios(params: [(Quoted, Type)], return_type: Type) -> u32 {
    let mut count = num_scenarios(return_type);
    for i in 0..params.len() {
        let (_name, param_type) = params[i];
        count = std::cmp::max(count, num_scenarios(param_type));
    }
    count
}

/// For one value (a parameter or the return) in one scenario, returns `(setup, value)`: the `let $binding = …;`
/// statement that selects this scenario's [`Scenario`], and the expression that reads its value (`$binding.value`).
comptime fn bind_scenario(typ: Type, binding: Quoted, position: u32, scenario: u32) -> (Quoted, Quoted) {
    let idx_val = scenario % num_scenarios(typ);
    let idx = f"{idx_val}".quoted_contents();
    let list = scenarios_expr(typ, position);
    let announce = set_scenario(typ, binding);
    (quote { let $binding = $list[$idx]; $announce }, quote { $binding.value })
}

/// The `assertion` for one scenario, plus the extra `setup` it needs. A unit-returning oracle just calls it
/// (`let _ = oracle(args)`) and needs no setup; otherwise this binds the expected return value (`__ret`) in
/// `return_binding` and asserts the oracle's result equals it.
comptime fn build_assertion(
    oracle: Quoted,
    args: Quoted,
    return_type: Type,
    return_position: u32,
    scenario: u32,
) -> (Quoted, Quoted) {
    if return_type.is_unit() {
        (quote {}, quote { let _ = $oracle($args); })
    } else {
        let why = f"return serialization mismatch for {oracle}. Consider bumping the oracle version after fixing the mismatch";
        let (return_binding, ret_value) = bind_scenario(return_type, quote { __ret }, return_position, scenario);
        (return_binding, quote { assert_eq($oracle($args), $ret_value, $why); })
    }
}

/// The number of scenarios a type exposes. The unit type (an oracle with no return value) counts as a single scenario;
/// every other type declares its count as the `N` in its `OracleTestValue<N>` impl.
comptime fn num_scenarios(typ: Type) -> u32 {
    if typ.is_unit() {
        1
    } else {
        let count = std::meta::typ::fresh_type_variable();
        let constraint = quote { crate::macros::oracle_testing::OracleTestValue<$count> }.as_trait_constraint();
        assert(
            typ.implements(constraint),
            f"cannot build an oracle test value for {typ}: it does not implement OracleTestValue. Implement it, or exclude this oracle via generate_oracle_tests_excluding",
        );
        count.as_constant().unwrap()
    }
}

/// Builds the quoted expression that produces `typ`'s scenarios (a `[Scenario<T>; N]`).
comptime fn scenarios_expr(typ: Type, position: u32) -> Quoted {
    let seed = SEED_BASE + position;
    let seed = f"{seed}".quoted_contents();
    let n = num_scenarios(typ);
    let count = f"{n}".quoted_contents();
    let pinned = pinned_type(typ);
    quote {
        <$pinned as crate::macros::oracle_testing::OracleTestValue<$count>>::oracle_test_value($seed)
    }
}

/// For a multi-scenario type, emits an `add_scenario_to_oracle_test(...)` call passing the selected scenario's name
/// so the resolver knows which shape to expect. Single-scenario types emit nothing.
comptime fn set_scenario(typ: Type, binding: Quoted) -> Quoted {
    if num_scenarios(typ) > 1 {
        quote { crate::macros::oracle_testing::add_scenario_to_oracle_test($binding.name); }
    } else {
        quote {}
    }
}

/// Sends a scenario name to the resolver for the session's next oracle call. Only the test resolver implements this
/// oracle (PXE and TXE do not); the tests `#[generate_oracle_tests]` generates call it once per multi-scenario
/// position before the oracle call, passing the selected [`Scenario`]'s name, and the resolver joins the names with
/// `+`.
#[oracle(aztec_oracle_test_set_scenario)]
pub(crate) unconstrained fn add_scenario_to_oracle_test(_name: BoundedVec<u8, MAX_SCENARIO_NAME_LEN>) {}

/// The number of elements the test puts in every array and bounded-vec value, and the capacity it pins bounded vecs
/// to. These must match `DEFAULT_ARRAY_LENGTH` and `BOUNDED_VEC_MAX_LENGTH` in the TS synthesizer
/// (`default_fixtures.ts`): each side builds the same values independently, so the lengths have to agree. The capacity
/// is deliberately larger than the element count so the unused tail exercises bounded-vec zero-padding on the wire.
global TEST_COLLECTION_LEN: u32 = 3;
global TEST_BOUNDED_VEC_CAP: u32 = 5;

/// Rewrites `typ`, replacing every array length with [`TEST_COLLECTION_LEN`] and every bounded-vec capacity with
/// [`TEST_BOUNDED_VEC_CAP`] (recursing through `Option` inners). Returns it as a `Quoted` type to splice into the test.
///
/// This exists because the annotated oracles are *generic* over their lengths (e.g.
/// `get_hash_preimage_oracle<let N: u32>(...) -> [Field; N]`), but the generated test is not generic, so it has no `N`
/// to instantiate. Pinning gives a concrete type to build the value from; the oracle's own `N` is then inferred from
/// that concretely-typed expected value at the call site. The pinned lengths match [`TEST_COLLECTION_LEN`] /
/// [`TEST_BOUNDED_VEC_CAP`] and the TS synthesizer, so both sides build the same wire bytes.
comptime fn pinned_type(typ: Type) -> Quoted {
    let array = typ.as_array();
    if array.is_some() {
        let (element_type, _generic_length) = array.unwrap();
        let pinned_element = pinned_type(element_type);
        let len = f"{TEST_COLLECTION_LEN}".quoted_contents();
        quote { [$pinned_element; $len] }
    } else if is_data_type_named(typ, quote { BoundedVec }) {
        let element_type = typ.as_data_type().unwrap().1[0];
        let pinned_element = pinned_type(element_type);
        let cap = f"{TEST_BOUNDED_VEC_CAP}".quoted_contents();
        quote { BoundedVec<$pinned_element, $cap> }
    } else if is_data_type_named(typ, quote { Option }) {
        let inner = typ.as_data_type().unwrap().1[0];
        let pinned_inner = pinned_type(inner);
        quote { Option<$pinned_inner> }
    } else {
        // Scalars carry no length to pin.
        quote { $typ }
    }
}

/// Whether `typ` is a named data type (struct) whose name is `name`, e.g. `is_data_type_named(typ, quote { Option })`.
comptime fn is_data_type_named(typ: Type, name: Quoted) -> bool {
    typ.as_data_type().map(|(s, _generics): (TypeDefinition, [Type])| s.name() == name).unwrap_or(false)
}
