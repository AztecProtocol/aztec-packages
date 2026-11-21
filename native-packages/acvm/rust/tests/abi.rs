//! The ABI encoder and the witness stack (de)compression, against the fixture programs.

mod common;

use acir::native_types::Witness;
use acir::FieldElement;
use aztec_acvm::{
    abi_decode, abi_decode_error, abi_encode, compress_witness_stack, decompress_witness_stack,
    execute, Execution,
};
use common::*;
use serde_json::{json, Value};

fn abi(program: &str) -> String {
    let artifact: Value = serde_json::from_slice(
        &std::fs::read(
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures")
                .join(format!("{program}.json")),
        )
        .unwrap(),
    )
    .unwrap();
    artifact["abi"].to_string()
}

#[test]
fn encodes_inputs_solves_and_decodes_the_return_value() {
    let witness = abi_encode(
        &abi("simple"),
        &json!({ "x": "3", "y": 5 }).to_string(),
        None,
    )
    .unwrap();
    assert_eq!(witness, inputs(&[3, 5]));

    let solved = match execute(&bytecode("simple"), witness, &mut |_: &_| unreachable!()).unwrap() {
        Execution::Solved(solved) => solved,
        Execution::Failed(failure) => panic!("{}", failure.message),
    };
    let decoded: Value =
        serde_json::from_str(&abi_decode(&abi("simple"), solved.main_witness()).unwrap()).unwrap();
    assert_eq!(
        decoded,
        json!({ "inputs": { "x": "0x03", "y": "0x05" }, "return_value": "0x10" })
    );
}

#[test]
fn encodes_a_return_value_after_the_inputs() {
    let witness = abi_encode(
        &abi("simple"),
        &json!({ "x": "3", "y": "5" }).to_string(),
        Some(&json!("16").to_string()),
    )
    .unwrap();
    assert_eq!(witness.get(&Witness(2)), Some(&field(16)));
}

#[test]
fn rejects_what_the_abi_does_not_take() {
    let missing = abi_encode(&abi("simple"), &json!({ "x": "3" }).to_string(), None).unwrap_err();
    assert!(missing.contains('y'), "{missing}");
    // As noirc_abi_wasm: a number JavaScript may already have rounded must come as a string.
    let unsafe_integer = abi_encode(
        &abi("simple"),
        &json!({ "x": 1u64 << 60, "y": 1 }).to_string(),
        None,
    )
    .unwrap_err();
    assert!(
        unsafe_integer.contains("not a safe integer"),
        "{unsafe_integer}"
    );
}

#[test]
fn decodes_assertion_payloads_by_the_abi_s_error_types() {
    for (kind, expected) in [
        (0, json!("x must equal y")),
        (1, json!({ "left": "0x01", "right": "0x02" })),
    ] {
        let failure = match execute(
            &bytecode("assertions"),
            inputs(&[1, 2, kind]),
            &mut |_: &_| unreachable!(),
        )
        .unwrap()
        {
            Execution::Failed(failure) => failure,
            Execution::Solved(_) => panic!("expected the assertion to fail"),
        };
        let payload = failure.raw_assertion_payload.unwrap();
        let decoded =
            abi_decode_error(&abi("assertions"), &payload.selector, &payload.data).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&decoded).unwrap(), expected);
    }
}

#[test]
fn witness_stacks_round_trip_in_nargo_s_format() {
    let nargo = std::fs::read(
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/acir_calls.witness.gz"),
    )
    .unwrap();
    let items = decompress_witness_stack(&nargo).unwrap();
    assert!(items.len() > 1, "acir_calls solves more than one function");
    // Bottom first, as acvm_js lists it: the main function, index 0, is solved last, on top.
    assert_eq!(items.last().unwrap().index, 0);
    let recompressed = compress_witness_stack(&items).unwrap();
    assert_eq!(
        decompress_witness_stack(&recompressed).unwrap().len(),
        items.len()
    );
    assert_eq!(
        acir::native_types::WitnessStack::<FieldElement>::deserialize(&recompressed).unwrap(),
        nargo_witness_stack("acir_calls")
    );
}
