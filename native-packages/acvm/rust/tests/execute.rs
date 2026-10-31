//! The executor, called directly with a resolver of the test's own.

mod common;

use acir::brillig::{ForeignCallParam, ForeignCallResult};
use acir::native_types::Witness;
use acir::{FieldElement, SerializationFormat};
use acvm::pwg::ForeignCallWaitInfo;
use acvm::AcirField;
use aztec_acvm::{execute, Execution, Solved};
use common::*;

fn no_oracles(
    call: &ForeignCallWaitInfo<FieldElement>,
) -> Result<ForeignCallResult<FieldElement>, String> {
    panic!("unexpected foreign call {}", call.function)
}

fn solved(execution: Execution) -> Solved {
    match execution {
        Execution::Solved(solved) => solved,
        Execution::Failed(failure) => panic!("expected the program to solve: {}", failure.message),
    }
}

/// The oracles the `oracles` program calls, answered correctly or (`wrong`) not.
fn oracles(
    wrong: bool,
    seen: &mut Vec<(String, Vec<ForeignCallParam<FieldElement>>)>,
) -> impl FnMut(&ForeignCallWaitInfo<FieldElement>) -> Result<ForeignCallResult<FieldElement>, String> + '_
{
    move |call| {
        seen.push((call.function.clone(), call.inputs.clone()));
        let values = match call.function.as_str() {
            "double" => {
                let x = call.inputs[0].unwrap_field();
                vec![ForeignCallParam::Single(if wrong { x } else { x + x })]
            }
            "sum_and_reverse" => {
                let xs = call.inputs[0].fields();
                let sum = xs.iter().fold(FieldElement::from(0u128), |acc, x| acc + *x);
                vec![
                    ForeignCallParam::Single(sum),
                    ForeignCallParam::Array(xs.into_iter().rev().collect()),
                ]
            }
            other => return Err(format!("no oracle {other}")),
        };
        Ok(ForeignCallResult { values })
    }
}

#[test]
fn solves_to_the_witness_nargo_does() {
    let solved = solved(execute(&bytecode("simple"), inputs(&[3, 5]), &mut no_oracles).unwrap());
    assert_eq!(solved.stack, nargo_witness_stack("simple"));
    // x * y + 1
    assert_eq!(
        solved
            .return_witness
            .into_iter()
            .map(|(_, v)| v)
            .collect::<Vec<_>>(),
        vec![field(16)]
    );
}

#[test]
fn solves_acir_calls_into_one_stack() {
    let solved =
        solved(execute(&bytecode("acir_calls"), inputs(&[2, 7]), &mut no_oracles).unwrap());
    let nargo = nargo_witness_stack("acir_calls");
    assert_eq!(solved.stack, nargo);
    assert_eq!(
        solved.stack.length(),
        3,
        "two calls of the folded function, then main"
    );
    // a = 2*2 + 7 = 11, b = 11*11 + 2 = 123, a + b = 134
    assert_eq!(
        solved
            .return_witness
            .into_iter()
            .map(|(_, v)| v)
            .collect::<Vec<_>>(),
        vec![field(134)]
    );
}

#[test]
fn writes_the_witness_stack_as_bb_reads_it() {
    let solved =
        solved(execute(&bytecode("acir_calls"), inputs(&[2, 7]), &mut no_oracles).unwrap());
    let ours = solved.witness_stack_bytes().unwrap();
    // The bytes acir writes for the same stack, before it gzips them.
    let acir = gunzip(
        &solved
            .stack
            .serialize_with_format(SerializationFormat::MsgpackCompact)
            .unwrap(),
    );
    assert_eq!(ours, acir);
}

#[test]
fn answers_foreign_calls_through_the_resolver() {
    let mut seen = Vec::new();
    let solved = solved(
        execute(
            &bytecode("oracles"),
            inputs(&[4, 1, 2, 3]),
            &mut oracles(false, &mut seen),
        )
        .unwrap(),
    );
    // doubled + sum = 8 + 6
    assert_eq!(
        solved
            .return_witness
            .into_iter()
            .map(|(_, v)| v)
            .collect::<Vec<_>>(),
        vec![field(14)]
    );
    let calls: Vec<_> = seen
        .iter()
        .map(|(name, inputs)| (name.as_str(), inputs.clone()))
        .collect();
    assert_eq!(
        calls,
        vec![
            ("double", vec![ForeignCallParam::Single(field(4))]),
            (
                "sum_and_reverse",
                vec![ForeignCallParam::Array(vec![field(1), field(2), field(3)])]
            ),
        ]
    );
}

#[test]
fn a_wrong_oracle_answer_fails_the_program() {
    let mut seen = Vec::new();
    let mut resolver = oracles(true, &mut seen);
    let execution = execute(&bytecode("oracles"), inputs(&[4, 1, 2, 3]), &mut resolver).unwrap();
    match execution {
        Execution::Failed(failure) => {
            assert!(
                failure.message.contains("Cannot satisfy constraint"),
                "{}",
                failure.message
            );
            assert_eq!(failure.acir_function_id, Some(0));
        }
        Execution::Solved(_) => panic!("a wrong oracle answer must fail the program"),
    }
}

#[test]
fn an_unanswered_foreign_call_is_a_service_error() {
    let mut refuse =
        |call: &ForeignCallWaitInfo<FieldElement>| Err(format!("{} is not bound", call.function));
    let error = execute(&bytecode("oracles"), inputs(&[4, 1, 2, 3]), &mut refuse)
        .err()
        .expect("an unanswered call is not the program failing");
    assert_eq!(error, "double is not bound");
}

#[test]
fn reports_a_string_assertion_as_a_payload_selecting_its_message() {
    // The selector is the ABI's error type for "x must equal y", which the caller decodes.
    match execute(&bytecode("assertions"), inputs(&[1, 2, 0]), &mut no_oracles).unwrap() {
        Execution::Failed(failure) => {
            assert_eq!(failure.message, "Assertion failed");
            let payload = failure
                .raw_assertion_payload
                .expect("the message comes back as a payload");
            assert_eq!(payload.selector, "1753510300745965149");
            assert!(payload.data.is_empty());
            assert!(failure.call_stack.is_some_and(|stack| !stack.is_empty()));
        }
        Execution::Solved(_) => panic!("1 != 2"),
    }
}

#[test]
fn reports_a_raw_assertion_payload_for_the_caller_to_decode() {
    match execute(&bytecode("assertions"), inputs(&[1, 2, 1]), &mut no_oracles).unwrap() {
        Execution::Failed(failure) => {
            assert_eq!(failure.message, "Assertion failed");
            let payload = failure
                .raw_assertion_payload
                .expect("a struct payload comes back raw");
            assert_eq!(
                payload.selector, "11740580735536159235",
                "the ABI's NotEqual error type"
            );
            let data: Vec<FieldElement> = payload
                .data
                .iter()
                .map(|hex| FieldElement::from_hex(hex).unwrap())
                .collect();
            assert_eq!(
                data,
                vec![field(1), field(2)],
                "the payload's fields: left, right"
            );
        }
        Execution::Solved(_) => panic!("1 != 2"),
    }
}

#[test]
fn rejects_bytes_that_are_not_a_program() {
    let error = execute(&[1, 2, 3], inputs(&[]), &mut no_oracles)
        .err()
        .expect("not a program");
    assert!(error.starts_with("could not read the program"), "{error}");
}

#[test]
fn main_witness_is_the_main_functions() {
    let solved = solved(execute(&bytecode("simple"), inputs(&[3, 5]), &mut no_oracles).unwrap());
    assert_eq!(solved.main_witness().get(&Witness(0)), Some(&field(3)));
    assert_eq!(solved.main_witness().get(&Witness(1)), Some(&field(5)));
}
