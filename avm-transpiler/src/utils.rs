use fxhash::FxHashMap as HashMap;

use acvm::acir::circuit::brillig::BrilligFunctionId;
use acvm::FieldElement;
use log::{debug, info, trace};

use acvm::acir::brillig::Opcode as BrilligOpcode;
use acvm::acir::circuit::{AssertionPayload, Opcode, Program};

use crate::instructions::{AvmInstruction, AvmOperand};
use crate::opcodes::AvmOpcode;

/// Extract the Brillig program from its `Program` wrapper.
/// Noir entry point unconstrained functions are compiled to their own list contained
/// as part of a full program. Function calls are then accessed through a function
/// pointer opcode in ACIR that fetches those unconstrained functions from the main list.
/// This function just extracts Brillig bytecode, with the assumption that the
/// 0th unconstrained function in the full `Program` structure.
pub fn extract_brillig_from_acir_program(
    program: &Program<FieldElement>,
) -> &[BrilligOpcode<FieldElement>] {
    assert_eq!(
        program.functions.len(),
        1,
        "An AVM program should have only a single ACIR function with a 'BrilligCall'"
    );
    let main_function = &program.functions[0];
    let opcodes = &main_function.opcodes;
    assert_eq!(opcodes.len(), 1, "An AVM program should only have a single `BrilligCall`");
    match opcodes[0] {
        Opcode::BrilligCall { id, .. } => assert_eq!(id, BrilligFunctionId(0), "The ID of the `BrilligCall` must be 0 as we have a single `Brillig` function"),
        _ => panic!("Tried to extract a Brillig program from its ACIR wrapper opcode, but the opcode doesn't contain Brillig!"),
    }
    assert_eq!(
        program.unconstrained_functions.len(),
        1,
        "An AVM program should be contained entirely in only a single `Brillig` function"
    );
    &program.unconstrained_functions[0].bytecode
}

/// Assertion messages that are static strings are stored in the assert_messages map of the ACIR program.
pub fn extract_static_assert_messages(program: &Program<FieldElement>) -> HashMap<usize, String> {
    assert_eq!(
        program.functions.len(),
        1,
        "An AVM program should have only a single ACIR function with a 'BrilligCall'"
    );
    let main_function = &program.functions[0];
    main_function
        .assert_messages
        .iter()
        .filter_map(|(location, payload)| {
            if let AssertionPayload::StaticString(static_string) = payload {
                Some((
                    location
                        .to_brillig_location()
                        .expect("Assert message is not for the brillig function")
                        .0,
                    static_string.clone(),
                ))
            } else {
                None
            }
        })
        .collect()
}

/// Print inputs, outputs, and instructions in a Brillig program
pub fn dbg_print_brillig_program(brillig_bytecode: &[BrilligOpcode<FieldElement>]) {
    trace!("Printing Brillig program...");
    for (i, instruction) in brillig_bytecode.iter().enumerate() {
        trace!("\tPC:{0} {1:?}", i, instruction);
    }
}

/// Print each instruction in an AVM program
pub fn dbg_print_avm_program(avm_program: &[AvmInstruction]) {
    info!("Transpiled AVM program has {} instructions", avm_program.len());
    trace!("Printing AVM program...");
    let mut counts = std::collections::HashMap::<AvmOpcode, usize>::new();
    for (i, instruction) in avm_program.iter().enumerate() {
        trace!("\tPC:{0}: {1}", i, &instruction.to_string());
        *counts.entry(instruction.opcode).or_insert(0) += 1;
    }
    debug!("AVM opcode counts:");
    let mut sorted_counts: Vec<_> = counts.into_iter().collect();
    sorted_counts.sort_by_key(|(_, count)| -(*count as isize));
    for (opcode, count) in sorted_counts {
        debug!("\t{0:?}: {1}", opcode, count);
    }
}

pub fn make_operand<T: Into<u128> + Copy>(bits: usize, value: &T) -> AvmOperand {
    match bits {
        8 => AvmOperand::U8 { value: Into::<u128>::into(*value) as u8 },
        16 => AvmOperand::U16 { value: Into::<u128>::into(*value) as u16 },
        32 => AvmOperand::U32 { value: Into::<u128>::into(*value) as u32 },
        64 => AvmOperand::U64 { value: Into::<u128>::into(*value) as u64 },
        128 => AvmOperand::U128 { value: Into::<u128>::into(*value) },
        _ => panic!("Invalid operand size for bits: {}", bits),
    }
}
