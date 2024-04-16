use acvm::acir::brillig::Opcode as BrilligOpcode;
use log::debug;

use acvm::acir::circuit::brillig::{Brillig, BrilligBytecode};
use acvm::acir::circuit::{Opcode, Program};

use crate::instructions::AvmInstruction;

/// Extract the Brillig program from its ACIR wrapper instruction.
/// An Noir unconstrained function compiles to one ACIR instruction
/// wrapping a Brillig program. This function just extracts that Brillig
/// assuming the 0th ACIR opcode is the wrapper.
pub fn extract_brillig_from_acir(opcodes: &Vec<Opcode>) -> &Brillig {
    if opcodes.len() != 1 {
        panic!("An AVM program should be contained entirely in only a single ACIR opcode flagged as 'Brillig'");
    }
    let opcode = &opcodes[0];
    match opcode {
        Opcode::Brillig(brillig) => brillig,
        _ => panic!("Tried to extract a Brillig program from its ACIR wrapper opcode, but the opcode doesn't contain Brillig!"),
    }
}

pub fn extract_brillig_from_acir_program(program: &Program) -> &[BrilligOpcode] {
    assert_eq!(program.functions.len(), 1, "An AVM program should have only a single ACIR function flagged as 'BrilligCall'");
    let opcodes = &program.functions[0].opcodes;
    assert_eq!(opcodes.len(), 1, "An AVM program should have only a single ACIR function flagged as 'BrilligCall'");
    match opcodes[0] {
        Opcode::BrilligCall { id, .. } => {}
        _ => panic!("Tried to extract a Brillig program from its ACIR wrapper opcode, but the opcode doesn't contain Brillig!"),
    }
    assert_eq!(program.unconstrained_functions.len(), 1, "An AVM program should be contained entirely in only a single `Brillig` function");
    &program.unconstrained_functions[0].bytecode
}

/// Print inputs, outputs, and instructions in a Brillig program
pub fn dbg_print_brillig_program(brillig_bytecode: &[BrilligOpcode]) {
    debug!("Printing Brillig program...");
    for (i, instruction) in brillig_bytecode.iter().enumerate() {
        debug!("\tPC:{0} {1:?}", i, instruction);
    }
}

/// Print each instruction in an AVM program
pub fn dbg_print_avm_program(avm_program: &[AvmInstruction]) {
    debug!("Printing AVM program...");
    for (i, instruction) in avm_program.iter().enumerate() {
        debug!("\tPC:{0}: {1}", i, &instruction.to_string());
    }
}
