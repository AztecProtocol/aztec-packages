use acvm::acir::circuit::brillig::Brillig;
use acvm::acir::circuit::Opcode;

use crate::instructions::AvmInstruction;

/// Extract the Brillig program from its ACIR wrapper instruction.
/// An Noir unconstrained function compiles to one ACIR instruction
/// wrapping a Brillig program. This function just extracts that Brillig
/// assuming the 0th ACIR opcode is the wrapper.
pub fn acir_to_brillig(opcodes: &Vec<Opcode>) -> &Brillig {
    if opcodes.len() != 1 {
        panic!("There should only be one brillig opcode");
    }
    let opcode = &opcodes[0];
    let brillig = match opcode {
        Opcode::Brillig(brillig) => brillig,
        _ => panic!("Tried to extract a Brillig program from its ACIR wrapper opcode, but the opcode doesn't contain Brillig!"),
    };
    brillig
}

/// Print inputs, outputs, and instructions in a Brillig program
pub fn print_brillig_program(brillig: &Brillig) {
    println!("Printing Brillig program...");
    println!("\tInputs: {:?}", brillig.inputs);
    for i in 0..brillig.bytecode.len() {
        let instr = &brillig.bytecode[i];
        println!("\tPC:{0} {1:?}", i, instr);
    }
    println!("\tOutputs: {:?}", brillig.outputs);
}

/// Print each instruction in an AVM program
pub fn print_avm_program(avm_program: &Vec<AvmInstruction>) {
    println!("Printing AVM program...");
    for i in 0..avm_program.len() {
        println!("\tPC:{0}: {1}", i, &avm_program[i].to_string());
    }
}
