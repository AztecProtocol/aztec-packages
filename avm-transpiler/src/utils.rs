use log::debug;

use acvm::acir::brillig::Opcode as BrilligOpcode;
use acvm::acir::circuit::{Opcode, Program};

use crate::instructions::AvmInstruction;

/// Extract the Brillig program from its `Program` wrapper.
/// Noir entry point unconstrained functions are compiled to their own list contained
/// as part of a full program. Function calls are then accessed through a function
/// pointer opcode in ACIR that fetches those unconstrained functions from the main list.
/// This function just extracts Brillig bytecode, with the assumption that the
/// 0th unconstrained function in the full `Program` structure.
pub fn extract_brillig_from_acir_program(program: &Program) -> &[BrilligOpcode] {
    assert_eq!(
        program.functions.len(),
        1,
        "An AVM program should have only a single ACIR function with a 'BrilligCall'"
    );
    let main_function = &program.functions[0];
    let opcodes = &main_function.opcodes;
    match opcodes[0] {
        Opcode::BrilligCall { id, .. } => assert_eq!(id, 0, "The ID of the `BrilligCall` must be 0 as we have a single `Brillig` function"),
        _ => panic!("Tried to extract a Brillig program from its ACIR wrapper opcode, but the opcode doesn't contain Brillig!"),
    }
    // Noir currently defaults to making a witness for each return witness in order
    // to match the return types serialization. The current way the compiler does this is by
    // generating a constraint for each return witness, which is what is checked below.
    // We should not expect any other opcodes for transpilation.
    if opcodes.len() > 1 {
        let remaining_opcodes = &opcodes[1..];
        assert_eq!(remaining_opcodes.len(), main_function.return_values.0.len());
        for (opcode, witness) in opcodes[1..]
            .iter()
            .zip(main_function.return_values.0.iter())
        {
            match opcode {
                Opcode::AssertZero(expr) => {
                    assert_eq!(expr.linear_combinations[1].1, *witness, "Expected the witness being set by the expression to match the return values");
                }
                // Reference this issue (https://github.com/noir-lang/noir/issues/4914) to understand what the Noir compiler is doing
                _ => panic!("We only expect a simple arithmetic expressions to generate unique return witnesses"),
            }
        }
    }
    assert_eq!(
        program.unconstrained_functions.len(),
        1,
        "An AVM program should be contained entirely in only a single `Brillig` function"
    );
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
