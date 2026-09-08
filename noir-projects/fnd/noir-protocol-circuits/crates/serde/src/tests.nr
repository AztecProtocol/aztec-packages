use crate::serialization::{Deserialize, Serialize};
use std::test::OracleMock;

#[derive(Deserialize, Eq, Serialize)]
pub struct Empty {}

#[derive(Deserialize, Eq, Serialize)]
pub struct Smol {
    a: Field,
    b: Field,
}

#[derive(Deserialize, Eq, Serialize)]
pub struct HasArray {
    a: [Field; 2],
    b: bool,
}

#[derive(Deserialize, Eq, Serialize)]
pub struct Fancier {
    a: Smol,
    b: [Field; 2],
    c: [u8; 3],
    d: str<16>,
}

#[derive(Deserialize, Eq, Serialize)]
pub struct HasArrayWithGenerics<T, let N: u32> {
    pub fields: [T; N],
    pub length: u32,
}

#[test]
fn serde_on_empty() {
    let original = Empty {};
    let serialized = original.serialize();
    assert_eq(serialized, [], "Serialized does not match empty array");
    let deserialized = Empty::deserialize(serialized);
    assert_eq(deserialized, original, "Deserialized does not match original");
}

#[test]
fn serde_on_smol() {
    let smol = Smol { a: 1, b: 2 };
    let serialized = smol.serialize();
    assert(serialized == [1, 2], serialized);
    let deserialized = Smol::deserialize(serialized);
    assert(deserialized == smol);
}

#[test]
fn serde_on_has_array() {
    let has_array = HasArray { a: [1, 2], b: true };
    let serialized = has_array.serialize();
    assert(serialized == [1, 2, 1], serialized);
    let deserialized = HasArray::deserialize(serialized);
    assert(deserialized == has_array);
}

#[test]
fn serde_on_fancier() {
    let fancier =
        Fancier { a: Smol { a: 1, b: 2 }, b: [0, 1], c: [1, 2, 3], d: "metaprogramming!" };
    let serialized = fancier.serialize();
    assert(
        serialized
            == [
                1, 2, 0, 1, 1, 2, 3, 0x6d, 0x65, 0x74, 0x61, 0x70, 0x72, 0x6f, 0x67, 0x72, 0x61,
                0x6d, 0x6d, 0x69, 0x6e, 0x67, 0x21,
            ],
        serialized,
    );
    let deserialized = Fancier::deserialize(serialized);
    assert(deserialized == fancier);
}

#[test]
fn serde_on_contains_array_with_generics() {
    let struct_with_array_of_generics = HasArrayWithGenerics { fields: [1, 2, 3], length: 3 };
    let serialized = struct_with_array_of_generics.serialize();
    assert(serialized == [1, 2, 3, 3], serialized);
    let deserialized = HasArrayWithGenerics::deserialize(serialized);
    assert(deserialized == struct_with_array_of_generics);
}

#[test]
fn u16_serialization() {
    let a: u16 = 10;
    assert_eq(a, u16::deserialize(a.serialize()));
}

#[test]
fn i8_serialization() {
    let a: i8 = -10;
    assert_eq(a, i8::deserialize(a.serialize()));
}

#[test]
fn i16_serialization() {
    let a: i16 = -10;
    assert_eq(a, i16::deserialize(a.serialize()));
}

#[test]
fn i32_serialization() {
    let a: i32 = -10;
    assert_eq(a, i32::deserialize(a.serialize()));
}

#[test]
fn i64_serialization() {
    let a: i64 = -10;
    assert_eq(a, i64::deserialize(a.serialize()));
}

#[test]
fn option_field_serialization() {
    let opt_some = Option::some(5);
    assert_eq(Option::<_>::deserialize(opt_some.serialize()), opt_some);

    let opt_none = Option::none();
    assert_eq(Option::<Field>::deserialize(opt_none.serialize()), opt_none);
}

#[test]
fn array_serialization() {
    let array = [1, 2, 3, 4];

    let serialized: [Field; 4] = array.serialize();
    let deserialized: [Field; 4] = Deserialize::deserialize(serialized);
    assert_eq(deserialized, array);
}

#[test]
fn nested_array_serialization() {
    let nested_array = [[1, 2, 3, 4], [5, 6, 7, 8]];

    let serialized: [Field; 8] = nested_array.serialize();
    let deserialized: [[Field; 4]; 2] = Deserialize::deserialize(serialized);

    assert_eq(deserialized, nested_array);
}

#[test]
fn option_array_serialization() {
    let opt_some = Option::some([2, 5]);
    assert_eq(Option::<_>::deserialize(opt_some.serialize()), opt_some);

    let opt_none = Option::none();
    assert_eq(Option::<Field>::deserialize(opt_none.serialize()), opt_none);
}

#[test]
fn bounded_vec_serialization() {
    // Test empty BoundedVec
    let empty_vec: BoundedVec<Field, 3> = BoundedVec::from_array([]);
    let serialized = empty_vec.serialize();
    let deserialized = BoundedVec::<Field, 3>::deserialize(serialized);
    assert_eq(empty_vec, deserialized);
    assert_eq(deserialized.len(), 0);

    // Test partially filled BoundedVec
    let partial_vec: BoundedVec<[u32; 2], 3> = BoundedVec::from_array([[1, 2]]);
    let serialized = partial_vec.serialize();
    let deserialized = BoundedVec::<[u32; 2], 3>::deserialize(serialized);
    assert_eq(partial_vec, deserialized);
    assert_eq(deserialized.len(), 1);
    assert_eq(deserialized.get(0), [1, 2]);

    // Test full BoundedVec
    let full_vec: BoundedVec<[u32; 2], 3> = BoundedVec::from_array([[1, 2], [3, 4], [5, 6]]);
    let serialized = full_vec.serialize();
    let deserialized = BoundedVec::<[u32; 2], 3>::deserialize(serialized);
    assert_eq(full_vec, deserialized);
    assert_eq(deserialized.len(), 3);
    assert_eq(deserialized.get(0), [1, 2]);
    assert_eq(deserialized.get(1), [3, 4]);
    assert_eq(deserialized.get(2), [5, 6]);
}

#[test(should_fail_with = "BoundedVec length exceeds max")]
fn bounded_vec_deserialization_rejects_len_above_max() {
    let _ = BoundedVec::<Field, 2>::deserialize([11, 22, 3]);
}

#[test(should_fail_with = "BoundedVec length is not u32")]
fn bounded_vec_deserialization_rejects_non_u32_len() {
    let _ = BoundedVec::<Field, 2>::deserialize([11, 22, 4294967298]);
}

// Test-only oracle used to obtain a `BoundedVec` that violates its own invariant (`len > MaxLen`).
//
// Such a value cannot be written in Noir source:
// - A struct literal `BoundedVec { storage: [11, 22], len: 3 }` does not compile here. Both fields are declared
//   without `pub` in the stdlib, so the compiler rejects the literal with "storage is private and not visible
//   from the current module".
// - Every public way of producing or mutating a `BoundedVec` (`new`, `push`, `set_len`, `from_parts`,
//   `from_parts_unchecked`, `extend_*`) asserts `len <= MaxLen` first.
// - `Deserialize for BoundedVec` asserts the same bound, so decoding a hand-written field array is closed too.
//
// In production the value can still appear, because two boundaries build structs directly from raw fields without
// running any Noir constructor: program (ABI) inputs, and values returned by oracles. This oracle reproduces the
// second boundary inside a unit test. `OracleMock` supplies the return value as raw fields, which the runtime
// decodes positionally into `storage` and then `len`, exactly as a forged witness would arrive.
#[oracle(forged_bounded_vec)]
unconstrained fn forged_bounded_vec_oracle() -> BoundedVec<Field, 2> {}

// Exercises the `len <= MaxLen` assertion in `Serialize for BoundedVec`. That assertion is what stops a forged
// private-function argument from being hashed into `args_hash`, so it must be hit on an actual `BoundedVec` value
// rather than on a field array. The value comes from `forged_bounded_vec_oracle` (see its comment for why there is
// no other way to build one). `OracleMock` only works in unconstrained code, which is why this test is
// `unconstrained` while the deserialize tests above are constrained.
#[test(should_fail_with = "BoundedVec length exceeds max")]
unconstrained fn bounded_vec_serialization_rejects_len_above_max() {
    // Mocked return is decoded as `storage = [11, 22]`, `len = 3`.
    OracleMock::mock("forged_bounded_vec").returns(([11, 22], 3));
    let invalid_vec = forged_bounded_vec_oracle();
    let _ = invalid_vec.serialize();
}
