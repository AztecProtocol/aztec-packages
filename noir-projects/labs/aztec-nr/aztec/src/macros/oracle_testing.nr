//! # Oracle serialization roundtrip tests
//!
//! Both sides of an oracle must agree on how each argument and return value is serialized to field elements. If they
//! drift (one side reorders fields, changes a type's wire layout, adds a value) calls silently corrupt, so we want a
//! test that exercises the *real* serialization on both sides and checks they still match.
//!
//! `#[generate_oracle_tests]`, applied to a module, generates that test from each oracle's signature. The generated
//! test:
//!   1. builds a canonical value for every parameter and the return type,
//!   2. calls the real oracle, which serializes the arguments and sends them to a dedicated TS resolver,
//!   3. the resolver deserializes the arguments, checks them against the same canonical values (which it rebuilds
//!      independently from the oracle's registered type), and serializes a canonical return value back,
//!   4. Noir deserializes that return value and asserts it equals the expected one.
//!
//! So if the two serializers agree the test passes, and if they drift it fails.
//!
//! Canonical values come from the synthesizer table ([`synthesizers`]) and the scalar registrations ([`scalars`]),
//! which mirror the TS synthesizer (`yarn-project/txe/src/oracle/test-resolver/default_fixtures.ts`) entry for
//! entry.
//!
//! ## The scenario convention
//!
//! Most types serialize in a single shape and have one test scenario; a type whose cases serialize differently has
//! several, each with a name its entry declares (`Option` has `some` and `none`). The macro emits one test per
//! scenario, and each test sends the selected names to the resolver (see [`add_scenario_to_oracle_test`]).
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
//! the macro produces a test asserting that the oracle, called with the `Field` entry's value at seed 10, returns
//! the `bool` entry's value at seed 11 (see [`SEED_BASE`] for the seeding convention).
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

use crate::messages::delivery::OnchainDeliveryMode;
use crate::protocol::{abis::function_selector::FunctionSelector, address::{AztecAddress, EthAddress}};

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

/// One serialization shape of a type's canonical value. Mirrors the TS `Scenario`.
comptime struct Scenario {
    /// The name sent to the resolver, for kinds with more than one shape. Kinds with a single shape leave it
    /// unset and send nothing.
    name: Option<Quoted>,
    /// The expression building the value to put on the wire (or expect back from it).
    value: Quoted,
}

comptime fn unnamed(value: Quoted) -> Scenario {
    Scenario { name: Option::none(), value }
}

comptime fn named(name: Quoted, value: Quoted) -> Scenario {
    Scenario { name: Option::some(name), value }
}

/// One type kind's synthesizer: everything the macro knows about the kind.
comptime struct TestValueSynthesizer {
    /// Whether this entry synthesizes values for the type; [`synthesizer_for`] picks the first match in
    /// [`synthesizers`] order.
    matches: fn(Type) -> bool,
    /// The value expression for each of the kind's serialization shapes at the given seed expression.
    scenarios: fn(Type, Quoted) -> [Scenario],
    /// The number of wire fields a value occupies, e.g. `1` for a scalar and `1 + width(inner)` for an `Option`.
    width: fn(Type) -> u32,
    /// The type quoted for annotation positions, with generic lengths pinned to the test constants (see
    /// [`pinned_type`]).
    pinned: fn(Type) -> Quoted,
}

/// The scalar registrations.
comptime fn scalars() -> [(Type, Quoted)] {
    @[
        scalar::<Field>(quote { |seed: u32| seed as Field }),
        scalar::<bool>(quote { |seed: u32| (seed % 2) != 0 }),
        scalar::<u8>(quote { |seed: u32| seed as u8 }),
        scalar::<u32>(quote { |seed: u32| seed }),
        scalar::<u64>(quote { |seed: u32| seed as u64 }),
        scalar::<u128>(quote { |seed: u32| seed as u128 }),
        scalar::<AztecAddress>(
            quote {
            |seed: u32| <crate::protocol::address::AztecAddress as crate::protocol::traits::FromField>::from_field(
                seed as Field,
            )
        },
        ),
        scalar::<EthAddress>(
            quote {
                |seed: u32| crate::protocol::address::EthAddress::from_field(seed as Field)
            },
        ),
        scalar::<FunctionSelector>(
            quote {
            |seed: u32| <crate::protocol::abis::function_selector::FunctionSelector as crate::protocol::traits::FromField>::from_field(
                seed as Field,
            )
        },
        ),
        onchain_delivery_mode_scalar(),
    ]
}

/// One entry per type kind; [`synthesizer_for`] dispatches to the first match, so order matters.
comptime fn synthesizers() -> [TestValueSynthesizer] {
    @[
        scalar_synth(),
        option_synth(),
        array_synth(),
        bounded_vec_synth(),
        tuple_synth(),
        // Matches ANY named data type: must stay last (find-first).
        struct_synth(),
    ]
}

/// The seed alternates between the only two valid modes.
comptime fn onchain_delivery_mode_scalar() -> (Type, Quoted) {
    scalar::<OnchainDeliveryMode>(
        quote {
            |seed: u32| if (seed % 2) == 0 {
                crate::messages::delivery::OnchainDeliveryMode::onchain_unconstrained()
            } else {
                crate::messages::delivery::OnchainDeliveryMode::onchain_constrained()
            }
        },
    )
}

/// One [`scalars`] entry: the scalar type `T`, paired with the function that builds its canonical test value from
/// a seed.
comptime fn scalar<T>(value: Quoted) -> (Type, Quoted) {
    // Keep the builder as syntax until it is expanded at the call site. A typed closure would capture comptime
    // locals in this scope and cannot escape into the generated runtime code.
    // There is no direct way to reflect the generic `T` as a `Type`, so a zeroed value is materialized purely to
    // take its type.
    (std::meta::type_of(std::mem::zeroed::<T>()), value)
}

comptime fn scalar_synth() -> TestValueSynthesizer {
    TestValueSynthesizer {
        matches: |t: Type| maybe_scalar_builder(t).is_some(),
        scenarios: |t: Type, seed: Quoted| {
            let value_fn = maybe_scalar_builder(t).unwrap();
            @[unnamed(quote { ($value_fn)($seed) })]
        },
        // Being a single wire field with no lengths to pin is what qualifies a type for the scalars table.
        width: |_t: Type| 1,
        pinned: |t: Type| quote { $t },
    }
}

/// Looks `typ` up in [`scalars`] and returns the builder lambda registered for it, or `Option::none()` if `typ`
/// is not a scalar.
comptime fn maybe_scalar_builder(typ: Type) -> Option<Quoted> {
    let matching = scalars().filter(|entry: (Type, Quoted)| entry.0 == typ);
    if matching.len() == 0 {
        Option::none()
    } else {
        Option::some(matching[0].1)
    }
}

comptime fn option_synth() -> TestValueSynthesizer {
    TestValueSynthesizer {
        matches: |t: Type| is_data_type_named(t, quote { Option }),
        scenarios: |t: Type, seed: Quoted| {
            @[named(quote { "some" }, some_value_expr(t, seed)), named(quote { "none" }, none_value_expr(t, seed))]
        },
        width: |t: Type| 1 + flat_width(t.as_data_type().unwrap().1[0]),
        pinned: |t: Type| {
            let inner = t.as_data_type().unwrap().1[0];
            let pinned_inner = pinned_type(inner);
            quote { Option<$pinned_inner> }
        },
    }
}

/// `Option::some` around the inner type's value.
comptime fn some_value_expr(typ: Type, seed: Quoted) -> Quoted {
    let inner = typ.as_data_type().unwrap().1[0];
    let inner_value = value_expr(inner, seed, 0);
    quote { Option::some($inner_value) }
}

/// `Option::none`, with the inner type pinned in the turbofish so generic lengths resolve even though no inner
/// value is built.
comptime fn none_value_expr(typ: Type, _seed: Quoted) -> Quoted {
    let inner = typ.as_data_type().unwrap().1[0];
    let pinned_inner = pinned_type(inner);
    quote { Option::<$pinned_inner>::none() }
}

comptime fn array_synth() -> TestValueSynthesizer {
    TestValueSynthesizer {
        matches: |t: Type| t.as_array().is_some(),
        scenarios: |t: Type, seed: Quoted| @[unnamed(array_value_expr(t, seed))],
        width: |t: Type| {
            let (element_type, length_type) = t.as_array().unwrap();
            let length = length_type.as_constant().unwrap_or(TEST_COLLECTION_LEN);
            length * flat_width(element_type)
        },
        pinned: |t: Type| {
            let (element_type, length_type) = t.as_array().unwrap();
            let pinned_element = pinned_type(element_type);
            // A concrete length (e.g. `[T; 1]`) is part of the oracle's signature and must be kept; only a generic
            // length has no value to instantiate and gets pinned.
            let len = length_type
                .as_constant()
                .map(|concrete_length: u32| f"{concrete_length}".quoted_contents())
                .unwrap_or_else(|| f"{TEST_COLLECTION_LEN}".quoted_contents());
            quote { [$pinned_element; $len] }
        },
    }
}

/// A call to [`oracle_test_array`], with the element's builder and the pinned element type and length.
comptime fn array_value_expr(typ: Type, seed: Quoted) -> Quoted {
    let (element_type, length_type) = typ.as_array().unwrap();
    let length = length_type.as_constant().unwrap_or(TEST_COLLECTION_LEN);
    let len_expr = f"{length}".quoted_contents();
    let pinned_element = pinned_type(element_type);
    let build_element = builder_expr(element_type);
    quote {
        crate::macros::oracle_testing::oracle_test_array::<$pinned_element, $len_expr>($build_element, $seed)
    }
}

/// Each element is seeded distinctly so element ordering is covered too.
pub(crate) fn oracle_test_array<T, let N: u32>(build_element: fn(u32) -> T, seed: u32) -> [T; N] {
    let mut array: [T; N] = std::mem::zeroed();
    for i in 0..N {
        array[i] = build_element(seed + i);
    }
    array
}

comptime fn bounded_vec_synth() -> TestValueSynthesizer {
    TestValueSynthesizer {
        matches: |t: Type| is_data_type_named(t, quote { BoundedVec }),
        scenarios: |t: Type, seed: Quoted| @[unnamed(bounded_vec_value_expr(t, seed))],
        width: |t: Type| {
            let generics = t.as_data_type().unwrap().1;
            let max_length = generics[1].as_constant().unwrap_or(TEST_BOUNDED_VEC_CAP);
            max_length * flat_width(generics[0]) + 1
        },
        pinned: |t: Type| {
            let generics = t.as_data_type().unwrap().1;
            let pinned_element = pinned_type(generics[0]);
            let capacity = generics[1].as_constant().unwrap_or(TEST_BOUNDED_VEC_CAP);
            let cap = f"{capacity}".quoted_contents();
            quote { BoundedVec<$pinned_element, $cap> }
        },
    }
}

/// A call to [`oracle_test_bounded_vec`], with the element's builder and the pinned element type and capacity.
comptime fn bounded_vec_value_expr(typ: Type, seed: Quoted) -> Quoted {
    let generics = typ.as_data_type().unwrap().1;
    let element_type = generics[0];
    // A concrete capacity is part of the oracle's signature and is kept (the TS side must map it as
    // FIXED_BOUNDED_VEC); only a generic capacity gets pinned.
    let capacity = generics[1].as_constant().unwrap_or(TEST_BOUNDED_VEC_CAP);
    let cap = f"{capacity}".quoted_contents();
    let pinned_element = pinned_type(element_type);
    let build_element = builder_expr(element_type);
    quote {
        crate::macros::oracle_testing::oracle_test_bounded_vec::<$pinned_element, $cap>($build_element, $seed)
    }
}

/// Builds a bounded vec holding fewer elements than its capacity, so the unused tail exercises zero-padding on the
/// wire. A capacity smaller than TEST_COLLECTION_LEN clamps the element count instead.
pub(crate) fn oracle_test_bounded_vec<T, let MaxLen: u32>(
    build_element: fn(u32) -> T,
    seed: u32,
) -> BoundedVec<T, MaxLen> {
    let mut bounded_vec: BoundedVec<T, MaxLen> = BoundedVec::new();
    for i in 0..std::cmp::min(TEST_COLLECTION_LEN, MaxLen) {
        bounded_vec.push(build_element(seed + i));
    }
    bounded_vec
}

comptime fn tuple_synth() -> TestValueSynthesizer {
    TestValueSynthesizer {
        matches: |t: Type| t.as_tuple().is_some(),
        scenarios: |t: Type, seed: Quoted| @[unnamed(tuple_value_expr(t, seed))],
        width: |t: Type| {
            let mut width: u32 = 0;
            for member_type in t.as_tuple().unwrap() {
                width += flat_width(member_type);
            }
            width
        },
        pinned: |t: Type| quote { $t },
    }
}

/// A call to [`oracle_test_tuple2`], with each member's builder and flat wire offset.
comptime fn tuple_value_expr(typ: Type, seed: Quoted) -> Quoted {
    let members = typ.as_tuple().unwrap();
    let mut member_builders: [Quoted] = @[];
    let mut offsets: [u32] = @[];
    let mut offset: u32 = 0;
    for member_type in members {
        member_builders = member_builders.push_back(builder_expr(member_type));
        offsets = offsets.push_back(offset);
        offset += flat_width(member_type);
    }
    if members.len() == 2 {
        let (a, b) = (member_builders[0], member_builders[1]);
        let b_offset_value = offsets[1];
        let b_offset = f"{b_offset_value}".quoted_contents();
        quote { crate::macros::oracle_testing::oracle_test_tuple2($a, $b, $b_offset, $seed) }
    } else {
        panic(
            f"cannot build an oracle test value for {typ}: add an oracle_test_tuple helper for this arity",
        )
    }
}

pub(crate) fn oracle_test_tuple2<A, B>(
    build_a: fn(u32) -> A,
    build_b: fn(u32) -> B,
    b_offset: u32,
    seed: u32,
) -> (A, B) {
    (build_a(seed), build_b(seed + b_offset))
}

comptime fn struct_synth() -> TestValueSynthesizer {
    TestValueSynthesizer {
        matches: |t: Type| t.as_data_type().is_some(),
        scenarios: |t: Type, seed: Quoted| @[unnamed(struct_value_expr(t, seed))],
        width: |t: Type| {
            let (definition, generics) = t.as_data_type().unwrap();
            let mut width: u32 = 0;
            for field in definition.fields(generics) {
                let (_name, field_type, _visibility) = field;
                width += flat_width(field_type);
            }
            width
        },
        pinned: |t: Type| quote { $t },
    }
}

/// The struct literal building `typ`'s canonical value inline: ordinary typed code whose fields recurse through
/// leaf builders, nested literals and composites, each seeded at its flat wire offset.
comptime fn struct_value_expr(typ: Type, seed: Quoted) -> Quoted {
    let (definition, generics) = typ.as_data_type().unwrap();
    let mut initializers: [Quoted] = @[];
    let mut offset: u32 = 0;
    for field in definition.fields(generics) {
        let (field_name, field_type, visibility) = field;
        // A private field cannot be initialized from the generated test's module, and would fail with a bare
        // privacy error deep inside the generated code.
        assert(
            visibility != quote {},
            f"cannot build an oracle test value for {typ}: its field {field_name} is private. Register the type in scalars(), or exclude this oracle via generate_oracle_tests_excluding",
        );
        let field_value = value_expr(field_type, offset_seed(seed, offset), 0);
        initializers = initializers.push_back(quote { $field_name: $field_value });
        offset += flat_width(field_type);
    }
    let initializers = initializers.join(quote {,});
    quote { $typ { $initializers } }
}

/// The seed expression for a member at flat wire `offset` past `seed`.
comptime fn offset_seed(seed: Quoted, offset: u32) -> Quoted {
    if offset == 0 {
        seed
    } else {
        let offset_expr = f"{offset}".quoted_contents();
        quote { ($seed + $offset_expr) }
    }
}

comptime fn synthesizer_for(typ: Type) -> TestValueSynthesizer {
    let matching = synthesizers().filter(|e: TestValueSynthesizer| (e.matches)(typ));
    assert(
        matching.len() >= 1,
        f"cannot build an oracle test value for {typ}: no synthesizer entry matches. Add one, or exclude this oracle via generate_oracle_tests_excluding",
    );
    matching[0]
}

/// All serialization shapes of `typ`'s canonical value at `seed`, one [`Scenario`] per shape.
comptime fn scenarios_for(typ: Type, seed: Quoted) -> [Scenario] {
    (synthesizer_for(typ).scenarios)(typ, seed)
}

/// `typ`'s canonical value expression at `seed` for the given test `scenario` (wrapping around the type's own
/// scenario count).
comptime fn value_expr(typ: Type, seed: Quoted, scenario: u32) -> Quoted {
    let scenarios = scenarios_for(typ, seed);
    scenarios[scenario % scenarios.len()].value
}

/// `typ`'s builder as an `fn(u32) -> T` expression, for passing into the typed composite helpers: a scalar's own
/// lambda, or a lambda wrapping the type's value expression (first scenario).
comptime fn builder_expr(typ: Type) -> Quoted {
    let maybe_scalar = maybe_scalar_builder(typ);
    if maybe_scalar.is_some() {
        maybe_scalar.unwrap()
    } else {
        let value = value_expr(typ, quote { seed }, 0);
        quote { |seed: u32| $value }
    }
}

/// `typ`'s wire width, from its entry.
comptime fn flat_width(typ: Type) -> u32 {
    (synthesizer_for(typ).width)(typ)
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
pub(crate) comptime fn generate_oracle_tests(m: Module) -> Quoted {
    let none: [Quoted] = @[];
    generate_oracle_tests_excluding(m, none)
}

/// Like [`generate_oracle_tests`], but leaves out the oracles named in `skip` (by Noir function name).
///
/// Every oracle in the module must be testable or excluded: if an oracle's parameters or return type can't be
/// synthesized (no [`synthesizers`] entry matches), generating its test fails at compile time and the dev must add it
/// to `skip`. Every `skip` entry must in turn match an oracle in the module.
///
/// ## Usage
///
/// ```noir
/// #[generate_oracle_tests_excluding(@[
///     quote { transaction_fee_opcode },
/// ])]
/// pub mod avm;
/// ```
pub(crate) comptime fn generate_oracle_tests_excluding(m: Module, skip: [Quoted]) -> Quoted {
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
/// For `fn get_witness_oracle(key: Field) -> Option<Field>`, the `some` scenario's pair is:
///   setup     = `set_scenario("some");` (the return is the only multi-scenario position)
///   assertion = `assert_eq(get_witness_oracle(…), Option::some(…), "…");`
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
            let seed = SEED_BASE + i;
            let seed_expr = f"{seed}".quoted_contents();
            setup = setup.push_back(set_scenario_expr(param_type, scenario));
            call_args = call_args.push_back(value_expr(param_type, seed_expr, scenario));
        }

        let args = call_args.join(quote {,});
        // The return's seed is the slot right after the last parameter (params take 0..len-1), so its value is
        // distinct.
        let return_seed = SEED_BASE + params.len();
        let (return_setup, assertion) = build_assertion(oracle, args, return_type, return_seed, scenario);
        setup = setup.push_back(return_setup);

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

/// The `assertion` for one scenario, plus the extra `setup` it needs. A unit-returning oracle just calls it
/// (`let _ = oracle(args)`) and needs no setup; otherwise the assertion checks the oracle's result against the
/// expected canonical return value.
comptime fn build_assertion(
    oracle: Quoted,
    args: Quoted,
    return_type: Type,
    return_seed: u32,
    scenario: u32,
) -> (Quoted, Quoted) {
    if return_type.is_unit() {
        (quote {}, quote { let _ = $oracle($args); })
    } else {
        let why = f"return serialization mismatch for {oracle}. Consider bumping the oracle version after fixing the mismatch";
        let setup = set_scenario_expr(return_type, scenario);
        let return_seed_expr = f"{return_seed}".quoted_contents();
        let expected = value_expr(return_type, return_seed_expr, scenario);
        (setup, quote { assert_eq($oracle($args), $expected, $why); })
    }
}

/// The number of scenarios a type exposes. The unit type (an oracle with no return value) counts as a single
/// scenario; every other type reports the length of its entry's scenario list.
comptime fn num_scenarios(typ: Type) -> u32 {
    if typ.is_unit() {
        1
    } else {
        scenarios_for(typ, quote { 0 }).len()
    }
}

/// For a multi-scenario position, the statement setting the selected scenario's name on the resolver.
/// Single-scenario positions have unnamed scenarios and set nothing.
comptime fn set_scenario_expr(typ: Type, scenario: u32) -> Quoted {
    let scenarios = scenarios_for(typ, quote { 0 });
    let maybe_name = scenarios[scenario % scenarios.len()].name;
    if maybe_name.is_some() {
        let name = maybe_name.unwrap();
        quote { crate::macros::oracle_testing::set_scenario($name); }
    } else {
        quote {}
    }
}

/// Sets the scenario `name` for the session's next oracle call (see [`add_scenario_to_oracle_test`]).
pub(crate) unconstrained fn set_scenario<let N: u32>(name: str<N>) {
    add_scenario_to_oracle_test(BoundedVec::from_array(name.as_bytes()));
}

/// Sends a scenario name to the resolver for the session's next oracle call. Only the test resolver implements this
/// oracle (PXE and TXE do not); the tests `#[generate_oracle_tests]` generates call it once per multi-scenario
/// position before the oracle call, passing the selected [`Scenario`]'s name, and the resolver joins the names with
/// `+`.
#[oracle(aztec_oracle_test_set_scenario)]
unconstrained fn add_scenario_to_oracle_test(_name: BoundedVec<u8, MAX_SCENARIO_NAME_LEN>) {}

/// The number of elements the test puts in every array and bounded-vec value, and the capacity it pins bounded vecs
/// to. These must match `DEFAULT_ARRAY_LENGTH` and `BOUNDED_VEC_MAX_LENGTH` in the TS synthesizer
/// (`default_fixtures.ts`): each side builds the same values independently, so the lengths have to agree. The capacity
/// is deliberately larger than the element count so the unused tail exercises bounded-vec zero-padding on the wire.
global TEST_COLLECTION_LEN: u32 = 3;
global TEST_BOUNDED_VEC_CAP: u32 = 5;

/// Rewrites `typ`, replacing every generic array length with [`TEST_COLLECTION_LEN`] and every bounded-vec capacity
/// with [`TEST_BOUNDED_VEC_CAP`] (recursing through `Option` inners). Returns it as a `Quoted` type to splice into the
/// test.
///
/// This exists because the annotated oracles are *generic* over their lengths (e.g.
/// `get_hash_preimage_oracle<let N: u32>(...) -> [Field; N]`), but the generated test is not generic, so it has no `N`
/// to instantiate. Pinning gives a concrete type to build the value from; the oracle's own `N` is then inferred from
/// that concretely-typed expected value at the call site. The pinned lengths match [`TEST_COLLECTION_LEN`] /
/// [`TEST_BOUNDED_VEC_CAP`] and the TS synthesizer, so both sides build the same wire bytes.
comptime fn pinned_type(typ: Type) -> Quoted {
    (synthesizer_for(typ).pinned)(typ)
}

/// Whether `typ` is a named data type (struct) whose name is `name`, e.g. `is_data_type_named(typ, quote { Option })`.
comptime fn is_data_type_named(typ: Type, name: Quoted) -> bool {
    typ.as_data_type().map(|(s, _generics): (TypeDefinition, [Type])| s.name() == name).unwrap_or(false)
}
