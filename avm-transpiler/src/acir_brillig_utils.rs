use acvm::acir::circuit::brillig::Brillig;
use acvm::acir::circuit::Opcode;

pub fn acir_to_brillig(opcodes: &Vec<Opcode>) -> &Brillig {
    if opcodes.len() != 1 {
        panic!("There should only be one brillig opcode");
    }
    let opcode = &opcodes[0];
    let brillig = match opcode {
        Opcode::Brillig(brillig) => brillig,
        _ => panic!("Opcode is not of type brillig"),
    };
    brillig
}

pub fn print_brillig(brillig: &Brillig) {
    println!("Inputs: {:?}", brillig.inputs);
    for i in 0..brillig.bytecode.len() {
        let instr = &brillig.bytecode[i];
        println!("PC:{0} {1:?}", i, instr);
    }
    println!("Outputs: {:?}", brillig.outputs);
}
