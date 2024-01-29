use acvm::acir::brillig::Opcode as BrilligOpcode;
use acvm::acir::circuit::brillig::Brillig;

use acvm::brillig_vm::brillig::{BinaryFieldOp, BinaryIntOp};

use crate::opcodes::{
    AvmOpcode,
    AvmOperand,
    AvmInstruction,
    AvmTypeTag,
    FIRST_OPERAND_INDIRECT,
    ZEROTH_OPERAND_INDIRECT,
};

// Map Brillig register indices directly to AVM memory offsets
// Map Brillig memory to AVM memory, but offset by a constant
const MEMORY_START: u32 = 1024;
const POINTER_TO_MEMORY: u32 = 2048;
const SCRATCH_START: u32 = 2049;

// Compute an array that maps each Brillig pc to an AVM pc.
// This must be done before transpiling to properly transpile jump destinations.
// This is necessary for two reasons:
// 1. The transpiler injects `initial_offset` instructions at the beginning of the program.
// 2. Some brillig instructions (_e.g._ Stop, or certain ForeignCalls) map to multiple AVM instructions
// args:
//     initial_offset: how many AVM instructions were inserted at the start of the program
//     brillig: the Brillig program
// returns: an array where each index is a Brillig pc,
//     and each value is the corresponding AVM pc.
fn map_brillig_pcs_to_avm_pcs(initial_offset: usize, brillig: &Brillig) -> Vec<usize> {
    let mut pc_map = Vec::new();
    pc_map.resize(brillig.bytecode.len(), 0);
    pc_map[0] = initial_offset;
    for i in 0..brillig.bytecode.len()-1 {
        let num_avm_instrs_for_this_brillig_instr = match &brillig.bytecode[i] {
            BrilligOpcode::Load {..} => 2,
            BrilligOpcode::Store {..} => 2,
            _ => 1,
        };
        // next Brillig pc will map to an AVM pc offset by the
        // number of AVM instructions generated for this Brillig one
        pc_map[i+1] = pc_map[i] + num_avm_instrs_for_this_brillig_instr;
    }
    pc_map
}

pub fn brillig_to_avm(brillig: &Brillig) -> Vec<u8> {
    let mut avm_instrs: Vec<AvmInstruction> = Vec::new();

    // Copy args to "memory"
    // M[0:args.len] = CALLDATA[0:args.len]
    avm_instrs.push(AvmInstruction { opcode: AvmOpcode::CALLDATACOPY,
        operands: vec![
            AvmOperand::U32 { value: 0 },
            AvmOperand::U32 { value: brillig.inputs.len() as u32 },
            AvmOperand::U32 { value: 0 },
        ], ..Default::default() });
    // Set a pointer to the AVM memory offset that represents Brillig memory offset 0
    avm_instrs.push(AvmInstruction { opcode: AvmOpcode::SET,
        dst_tag: Some(AvmTypeTag::UINT32),
        operands: vec![
            AvmOperand::U32 { value: POINTER_TO_MEMORY },
            AvmOperand::U32 { value: MEMORY_START },
        ], ..Default::default() });

    // Map Brillig pcs to AVM pcs considering these initial instructions
    // and any other Brilling instructions that map to >1 AVM instruction
    let brillig_pcs_to_avm_pcs = map_brillig_pcs_to_avm_pcs(avm_instrs.len(), brillig);

    for brillig_instr in &brillig.bytecode {
        match brillig_instr {
            BrilligOpcode::BinaryFieldOp { destination, op, lhs, rhs } => {
                let avm_opcode = match op {
                    BinaryFieldOp::Add => AvmOpcode::ADD,
                    BinaryFieldOp::Sub => AvmOpcode::SUB,
                    BinaryFieldOp::Mul => AvmOpcode::MUL,
                    BinaryFieldOp::Div => AvmOpcode::DIV,
                    BinaryFieldOp::Equals => AvmOpcode::EQ,
                    _ => panic!("Transpiler doesn't know how to process BinaryFieldOp {:?}", brillig_instr),
                };
                avm_instrs.push(AvmInstruction { opcode: avm_opcode,
                    operands: vec![
                        AvmOperand::U32 { value: lhs.to_usize() as u32 },
                        AvmOperand::U32 { value: rhs.to_usize() as u32 },
                        AvmOperand::U32 { value: destination.to_usize() as u32 },
                    ], ..Default::default() });
            }
            BrilligOpcode::BinaryIntOp { destination, op, bit_size, lhs, rhs } => {
                let avm_opcode = match op {
                    BinaryIntOp::Add => AvmOpcode::ADD,
                    BinaryIntOp::Sub => AvmOpcode::SUB,
                    BinaryIntOp::Mul => AvmOpcode::MUL,
                    BinaryIntOp::UnsignedDiv => AvmOpcode::DIV,
                    BinaryIntOp::Equals => AvmOpcode::EQ,
                    BinaryIntOp::LessThan => AvmOpcode::LT,
                    BinaryIntOp::LessThanEquals => AvmOpcode::LTE,
                    BinaryIntOp::And => AvmOpcode::AND,
                    BinaryIntOp::Or => AvmOpcode::OR,
                    BinaryIntOp::Xor => AvmOpcode::XOR,
                    BinaryIntOp::Shl => AvmOpcode::SHL,
                    BinaryIntOp::Shr => AvmOpcode::SHR,
                    _ => panic!("Transpiler doesn't know how to process BinaryIntOp {:?}", brillig_instr),
                };
                // TODO: bit-size -> type tag
                avm_instrs.push(AvmInstruction {opcode: avm_opcode,
                    operands: vec![
                        AvmOperand::U32 { value: lhs.to_usize() as u32 },
                        AvmOperand::U32 { value: rhs.to_usize() as u32 },
                        AvmOperand::U32 { value: destination.to_usize() as u32 },
                    ], ..Default::default() });
            },
            BrilligOpcode::Jump { location } => {
                let avm_loc = brillig_pcs_to_avm_pcs[*location];
                avm_instrs.push(AvmInstruction { opcode: AvmOpcode::JUMP,
                    operands: vec![
                        AvmOperand::U32 { value: avm_loc as u32 },
                    ], ..Default::default() });
            },
            BrilligOpcode::JumpIf { condition, location } => {
                let avm_loc = brillig_pcs_to_avm_pcs[*location];
                avm_instrs.push(AvmInstruction { opcode: AvmOpcode::JUMPI,
                    operands: vec![
                        AvmOperand::U32 { value: avm_loc as u32 },
                        AvmOperand::U32 { value: condition.to_usize() as u32 },
                    ], ..Default::default() });
            },
            BrilligOpcode::Const { destination, value } => {
                avm_instrs.push(AvmInstruction { opcode: AvmOpcode::SET,
                    dst_tag: Some(AvmTypeTag::UINT32),
                    operands: vec![
                        // TODO: support u8..u128 and use dst_tag
                        // (value can actually be u8, u16, u32, u64, u128)
                        AvmOperand::U32 { value: value.to_usize() as u32 },
                        AvmOperand::U32 { value: destination.to_usize() as u32 },
                    ], ..Default::default() });
            },
            BrilligOpcode::Mov { destination, source } => {
                avm_instrs.push(AvmInstruction { opcode: AvmOpcode::MOV,
                    operands: vec![
                        AvmOperand::U32 { value: source.to_usize() as u32 },
                        AvmOperand::U32 { value: destination.to_usize() as u32 },
                    ], ..Default::default() });
            },
            BrilligOpcode::Load { destination, source_pointer } => {
                // Brillig Load does R[dst] = M[R[src]]
                // So, we transpile to a MOV with indirect addressing for src (s0)
                // But we offset all Brillig "memory" to avoid collisions with registers since in the AVM everything is memory
                // (via ADD and a scratchpad memory word)
                let src_ptr_after_mem_offset = SCRATCH_START;
                avm_instrs.push(AvmInstruction {opcode: AvmOpcode::ADD,
                    operands: vec![
                        AvmOperand::U32 { value: POINTER_TO_MEMORY},
                        AvmOperand::U32 { value: source_pointer.to_usize() as u32 },
                        AvmOperand::U32 { value: src_ptr_after_mem_offset },
                    ], ..Default::default() });

                avm_instrs.push(AvmInstruction { opcode: AvmOpcode::MOV,
                    indirect: Some(ZEROTH_OPERAND_INDIRECT), // indirect srcOffset operand
                    operands: vec![
                        AvmOperand::U32 { value: src_ptr_after_mem_offset },
                        AvmOperand::U32 { value: destination.to_usize() as u32 },
                    ], ..Default::default() });
            }
            BrilligOpcode::Store { destination_pointer, source } => {
                // Brillig Store does M[R[dst]] = R[src]
                // So, we transpile to a MOV with indirect addressing for dst (d0)
                // But we offset all Brillig "memory" to avoid collisions with registers since in the AVM everything is memory
                // (via ADD and a scratchpad memory word)
                let dst_ptr_after_mem_offset = SCRATCH_START;
                avm_instrs.push(AvmInstruction {opcode: AvmOpcode::ADD,
                    operands: vec![
                        AvmOperand::U32 { value: POINTER_TO_MEMORY},
                        AvmOperand::U32 { value: destination_pointer.to_usize() as u32 },
                        AvmOperand::U32 { value: dst_ptr_after_mem_offset },
                    ], ..Default::default() });

                // INDIRECT dstOffset operand (bit 1 set high)
                avm_instrs.push(AvmInstruction { opcode: AvmOpcode::MOV,
                    indirect: Some(FIRST_OPERAND_INDIRECT), // indirect dstOffset operand
                    operands: vec![
                        AvmOperand::U32 { value: source.to_usize() as u32 },
                        AvmOperand::U32 { value: dst_ptr_after_mem_offset },
                    ], ..Default::default() });
            }
            BrilligOpcode::Call { location } => {
                let avm_loc = brillig_pcs_to_avm_pcs[*location];
                avm_instrs.push(AvmInstruction { opcode: AvmOpcode::INTERNALCALL,
                    operands: vec![
                        AvmOperand::U32 { value: avm_loc as u32 },
                    ], ..Default::default() });
            },
            BrilligOpcode::Return {} =>
                avm_instrs.push(AvmInstruction { opcode: AvmOpcode::INTERNALRETURN, ..Default::default() }),
            BrilligOpcode::Stop {} => {
                // TODO: is outputs[0] (start of returndata) always "2"? Seems so....
                let ret_offset = 2;
                let ret_size = brillig.outputs.len() as u32;
                avm_instrs.push(AvmInstruction { opcode: AvmOpcode::RETURN,
                    operands: vec![
                        AvmOperand::U32 { value: ret_offset },
                        AvmOperand::U32 { value: ret_size },
                    ], ..Default::default() });
            },
            BrilligOpcode::Trap {} => {
                // TODO: is outputs[0] (start of returndata) always "2"? Seems so....
                let ret_offset = 2;
                let ret_size = brillig.outputs.len() as u32;
                avm_instrs.push(AvmInstruction { opcode: AvmOpcode::REVERT,
                    operands: vec![
                        AvmOperand::U32 { value: ret_offset },
                        AvmOperand::U32 { value: ret_size },
                    ], ..Default::default() });
            },
            _ => panic!("Transpiler doesn't know how to process {:?} brillig instruction", brillig_instr),
        }
    }

    println!("Printing all AVM instructions!");
    let mut bytecode = Vec::new();
    for i in 0..avm_instrs.len() {
        let instr = &avm_instrs[i];
        println!("PC:{0}: {1}", i, instr.to_string());
        let mut instr_bytes = instr.to_bytes();
        bytecode.append(&mut instr_bytes);
    }
    bytecode
}

// 
//use acvm::acir::brillig::Opcode as BrilligOpcode;
//use acvm::acir::circuit::brillig::Brillig;
//
//use acvm::brillig_vm::brillig::BlackBoxOp;
//use acvm::brillig_vm::brillig::RegisterOrMemory;
//use acvm::brillig_vm::brillig::{BinaryFieldOp, BinaryIntOp};
//
//const MEMORY_START: usize = 1024;
//const POINTER_TO_MEMORY: usize = 2048;
//const SCRATCH_START: usize = 2049;
//
//fn brillig_pc_offsets(initial_offset: usize, brillig: &Brillig) -> Vec<usize> {
//    // For each instruction that expands to >1 AVM instruction,
//    // Construct an array, where each index corresponds to a PC in the original Brillig bytecode.
//    // Iterate over the original bytecode, and each time an instruction is encountered that
//    // expands to >1 AVM instruction, increase the following(?) entry by the number of added instructions.
//    let mut pc_offsets = Vec::new();
//    pc_offsets.resize(brillig.bytecode.len(), 0);
//    pc_offsets[0] = initial_offset;
//
//    for i in 0..brillig.bytecode.len()-1 {//  instr in &brillig.bytecode {
//        let instr = &brillig.bytecode[i];
//        let offset = match instr {
//            BrilligOpcode::Load {..} => 1,
//            BrilligOpcode::Store {..} => 1,
//            BrilligOpcode::Stop => 1,
//            BrilligOpcode::Trap => 1,
//            BrilligOpcode::ForeignCall { function, .. } =>
//                match &function[..] {
//                    "avm_call" => 5,
//                    _ => 0,
//                },
//            BrilligOpcode::BlackBox(bb_op) =>
//                match &bb_op {
//                    BlackBoxOp::PedersenCommitment {..} => 2,
//                    _ => 0,
//                },
//            _ => 0,
//        };
//        pc_offsets[i+1] = pc_offsets[i] + offset;
//    }
//    pc_offsets
//}
//
//
//pub fn brillig_to_avm(brillig: &Brillig) -> Vec<u8> {
//    // brillig starts by storing in each calldata entry
//    // into a register starting at register 0 and ending at N-1 where N is inputs.len
//    let mut avm_opcodes: Vec<AvmInstruction> = Vec::new();
//    // Put calldatasize (which generally is brillig.inputs.len()) to M[0]
//    //avm_opcodes.push(AvmInstruction { opcode: AVMOpcode::CALLDATASIZE, d0: 0, ..Default::default() });
//    // Put calldata into M[0:calldatasize]
//    avm_opcodes.push(AvmInstruction { opcode: AVMOpcode::CALLDATACOPY, d0: 0, s1: 0, ..Default::default() });
//
//    // Put the memory offset into M[MEMORY_START]
//    avm_opcodes.push(AvmInstruction { opcode: AVMOpcode::SET, d0: POINTER_TO_MEMORY, s0: MEMORY_START, ..Default::default() });
//    // Put the scratch offset into M[SCRATCH_START]
//    //avm_opcodes.push(AvmInstruction { opcode: AVMOpcode::SET, fields: AVMFields { d0: SCRATCH_START, s0: SCRATCH_START, ..Default::default()}})
//    let mut next_unused_scratch = SCRATCH_START + 1; // skip 1 because 0th entry is pointer to memory start
//
//    // NOTE: must update this if number of initial instructions ^ pushed above changes
//    let pc_offset_for_above_instrs = 2;
//    let pc_offsets = brillig_pc_offsets(pc_offset_for_above_instrs, brillig);
//    //let pc_offset = 2;
//
//    //let mut next_unused_memory = SCRATCH_MEMORY + 1;
//
//    //for i in 0..brillig.bytecode.len() {//  instr in &brillig.bytecode {
//    for instr in &brillig.bytecode {
//        //let instr = &brillig.bytecode[i];
//        match instr {
//            BrilligOpcode::BinaryFieldOp { destination, op, lhs, rhs } => {
//                    let op_type = match op {
//                        BinaryFieldOp::Add => AVMOpcode::ADD,
//                        BinaryFieldOp::Sub => AVMOpcode::SUB,
//                        BinaryFieldOp::Mul => AVMOpcode::MUL,
//                        BinaryFieldOp::Div => AVMOpcode::DIV,
//                        BinaryFieldOp::Equals => AVMOpcode::EQ,
//                        // FIXME missing
//                        _ => panic!("Transpiler doesn't know how to process BinaryFieldOp {:?}", instr),
//                    };
//                    avm_opcodes.push(AvmInstruction {
//                        opcode: op_type,
//                        d0: destination.to_usize(),
//                        s0: lhs.to_usize(),
//                        s1: rhs.to_usize(),
//                        ..Default::default()
//                    });
//                },
//            BrilligOpcode::BinaryIntOp { destination, op, bit_size, lhs, rhs } => {
//                // FIXME hacked together
//                    let op_type = match op {
//                        BinaryIntOp::Add => AVMOpcode::ADD,
//                        BinaryIntOp::Sub => AVMOpcode::SUB,
//                        BinaryIntOp::Mul => AVMOpcode::MUL,
//                        BinaryIntOp::UnsignedDiv => AVMOpcode::DIV,
//                        BinaryIntOp::Equals => AVMOpcode::EQ,
//                        BinaryIntOp::LessThan => AVMOpcode::LT,
//                        BinaryIntOp::LessThanEquals => AVMOpcode::LTE,
//                        BinaryIntOp::And => AVMOpcode::AND,
//                        BinaryIntOp::Or => AVMOpcode::OR,
//                        BinaryIntOp::Xor => AVMOpcode::XOR,
//                        BinaryIntOp::Shl => AVMOpcode::SHL,
//                        BinaryIntOp::Shr => AVMOpcode::SHR,
//                        _ => panic!("Transpiler doesn't know how to process BinaryIntOp {:?}", instr),
//                    };
//                    avm_opcodes.push(AvmInstruction {
//                        opcode: op_type,
//                        d0: destination.to_usize(), s0: lhs.to_usize(), s1: rhs.to_usize(), ..Default::default() 
//                    });
//                },
//            BrilligOpcode::Jump { location } => {
//                let loc_offset = pc_offsets[*location];
//                let fixed_loc = *location + loc_offset;
//                avm_opcodes.push(AvmInstruction {
//                    opcode: AVMOpcode::JUMP,
//                    s0: fixed_loc, ..Default::default()
//                });
//            },
//            BrilligOpcode::JumpIf { condition, location } => {
//                let loc_offset = pc_offsets[*location];
//                let fixed_loc = *location + loc_offset;
//                avm_opcodes.push(AvmInstruction {
//                    opcode: AVMOpcode::JUMPI,
//                    sd: condition.to_usize(), s0: fixed_loc, ..Default::default() 
//                });
//            },
//            BrilligOpcode::Const { destination, value } =>
//                avm_opcodes.push(AvmInstruction {
//                    opcode: AVMOpcode::SET,
//                    d0: destination.to_usize(), s0: value.to_usize(), ..Default::default() 
//                }),
//            BrilligOpcode::Mov { destination, source } =>
//                avm_opcodes.push(AvmInstruction {
//                    opcode: AVMOpcode::MOV,
//                    d0: destination.to_usize(), s0: source.to_usize(), ..Default::default()
//                }),
//            BrilligOpcode::Load { destination, source_pointer } => {
//                // Brillig Load does R[dst] = M[R[src]]
//                // So, we transpile to a MOV with indirect addressing for src (s0)
//                // But we offset all Brillig "memory" to avoid collisions with registers since in the AVM everything is memory
//                // (via ADD and a scratchpad memory word)
//                let src_ptr_after_mem_offset = SCRATCH_START;
//                avm_opcodes.push(AvmInstruction {
//                    opcode: AVMOpcode::ADD,
//                    d0: src_ptr_after_mem_offset, s0: POINTER_TO_MEMORY, s1: source_pointer.to_usize(), ..Default::default()
//                });
//                //next_unused_scratch = next_unused_scratch+1;
//                avm_opcodes.push(AvmInstruction {
//                    opcode: AVMOpcode::MOV,
//                    d0: destination.to_usize(),
//                    s0_options: OperandOptions { mode: OperandMode::INDIRECT, ..Default::default() },
//                    s0: src_ptr_after_mem_offset,
//                    ..Default::default()
//                });
//            },
//            BrilligOpcode::Store { destination_pointer, source } => {
//                // Brillig Store does M[R[dst]] = R[src]
//                // So, we transpile to a MOV with indirect addressing for dst (d0)
//                // But we offset all Brillig "memory" to avoid collisions with registers since in the AVM everything is memory
//                // (via ADD and a scratchpad memory word)
//                let dst_ptr_after_mem_offset = SCRATCH_START;
//                avm_opcodes.push(AvmInstruction {
//                    opcode: AVMOpcode::ADD,
//                    d0: dst_ptr_after_mem_offset, s0: POINTER_TO_MEMORY, s1: destination_pointer.to_usize(), ..Default::default()
//                });
//                //next_unused_scratch = next_unused_scratch+1;
//                avm_opcodes.push(AvmInstruction {
//                    opcode: AVMOpcode::MOV,
//                    d0_options: OperandOptions { mode: OperandMode::INDIRECT, ..Default::default() },
//                    d0: dst_ptr_after_mem_offset,
//                    s0: source.to_usize(),
//                    ..Default::default()
//                });
//            },
//            BrilligOpcode::Call { location } => {
//                let loc_offset = pc_offsets[*location];
//                let fixed_loc = *location + loc_offset;
//                avm_opcodes.push(AvmInstruction {
//                    opcode: AVMOpcode::INTERNALCALL,
//                    s0: fixed_loc, ..Default::default()
//                });
//            },
//            BrilligOpcode::ForeignCall { function, destinations, inputs } => {
//                println!("Transpiling ForeignCall::{} with {} destinations and {} inputs", function, destinations.len(), inputs.len());
//                match &function[..] {
//                    "avm_sload" => {
//                        if destinations.len() != 1 || inputs.len() != 1 {
//                            panic!("Transpiler expects ForeignCall::{} to have 1 destination and 1 input, got {} and {}", function, destinations.len(), inputs.len());
//                        }
//                        let slot_operand = match &inputs[0] {
//                            RegisterOrMemory::RegisterIndex(index) => index,
//                            _ => panic!("Transpiler does not know how to handle ForeignCall::{} with HeapArray/Vector inputs", function),
//                        };
//                        let dst_operand = match &destinations[0] {
//                            RegisterOrMemory::RegisterIndex(index) => index,
//                            _ => panic!("Transpiler does not know how to handle ForeignCall::{} with HeapArray/Vector inputs", function),
//                        };
//                        avm_opcodes.push(AvmInstruction {
//                            opcode: AVMOpcode::SLOAD,
//                            d0: dst_operand.to_usize(), s0: slot_operand.to_usize(), ..Default::default()
//                        });
//                    },
//                    "avm_sstore" => {
//                        if destinations.len() != 0 || inputs.len() != 2 {
//                            panic!("Transpiler expects ForeignCall::{} to have 0 destinations and 2 inputs, got {} and {}", function, destinations.len(), inputs.len());
//                        }
//                        let slot_operand = match &inputs[0] {
//                            RegisterOrMemory::RegisterIndex(index) => index,
//                            _ => panic!("Transpiler does not know how to handle ForeignCall::{} with HeapArray/Vector inputs", function),
//                        };
//                        let value_operand = match &inputs[1] {
//                            RegisterOrMemory::RegisterIndex(index) => index,
//                            _ => panic!("Transpiler does not know how to handle ForeignCall::{} with HeapArray/Vector inputs", function),
//                        };
//                        avm_opcodes.push(AvmInstruction {
//                            opcode: AVMOpcode::SSTORE,
//                            d0: slot_operand.to_usize(), s0: value_operand.to_usize(), ..Default::default()
//                        });
//                    },
//                    "avm_call" => {
//                        if destinations.len() != 1 || inputs.len() != 3 {
//                            panic!("Transpiler expects ForeignCall::{} to have 1 destinations and 3 inputs, got {} and {}", function, destinations.len(), inputs.len());
//                        }
//                        let gas_operand = match &inputs[0] {
//                            RegisterOrMemory::RegisterIndex(index) => index,
//                            _ => panic!("Transpiler does not know how to handle ForeignCall::{} with HeapArray/Vector for gas operand", function),
//                        };
//                        let target_address_operand = match &inputs[1] {
//                            RegisterOrMemory::RegisterIndex(index) => index,
//                            _ => panic!("Transpiler does not know how to handle ForeignCall::{} with HeapArray/Vector for target_address operand", function),
//                        };
//                        let args_heap_array = match &inputs[2] {
//                            RegisterOrMemory::HeapArray(heap_array) => heap_array,
//                            _ => panic!("Transpiler expects ForeignCall::{}'s inputs[2] to be a HeapArray for a call's args", function),
//                        };
//                        let return_heap_array= match &destinations[0] {
//                            RegisterOrMemory::HeapArray(heap_array) => heap_array,
//                            // TODO: if heap array, need to generate RETURNDATASIZE and RETURNDATACOPY instructions as size isn't know ahead of time!
//                            // Note that when return data is in a HeapVector, it lives in dest1, and dest0 is a register.... Not sure what for.
//                            //RegisterOrMemory::HeapVector(heap_vec) => heap_vec,
//                            _ => panic!("Transpiler expects ForeignCall::{}'s destination[0] to be a HeapArray for a call's return data", function),
//                        };
//                        // Construct a block of memory in the scratchpad that will be pointed to by argsAndRetOffset:
//                        // 0th entry: argsOffset (address of args_heap_array in memory)
//                        // 1st entry: argsSize (size of args_heap_array)
//                        // 2nd entry: retOffset (address of return_heap_array in memory)
//                        // 3nd entry: retSize (size of return_heap_array)
//                        let mem_containing_args_offset = SCRATCH_START;
//                        let mem_containing_args_size = SCRATCH_START+1;
//                        let mem_containing_ret_offset = SCRATCH_START+2;
//                        let mem_containing_ret_size = SCRATCH_START+3;
//                        // Pointer to the above block ^
//                        let mem_containing_args_and_ret_offset = SCRATCH_START+4;
//
//                        // offset inputs into region dedicated to brillig "memory"
//                        avm_opcodes.push(AvmInstruction {
//                            opcode: AVMOpcode::ADD,
//                            d0: mem_containing_args_offset, s0: POINTER_TO_MEMORY, s1: args_heap_array.pointer.to_usize(), ..Default::default()
//                        });
//                        avm_opcodes.push(AvmInstruction {
//                            opcode: AVMOpcode::SET,
//                            d0: mem_containing_args_size, s0: args_heap_array.size, ..Default::default()
//                        });
//                        avm_opcodes.push(AvmInstruction {
//                            opcode: AVMOpcode::ADD,
//                            d0: mem_containing_ret_offset, s0: POINTER_TO_MEMORY, s1: return_heap_array.pointer.to_usize(), ..Default::default()
//                        });
//                        avm_opcodes.push(AvmInstruction {
//                            opcode: AVMOpcode::SET,
//                            d0: mem_containing_ret_size, s0: return_heap_array.size, ..Default::default()
//                        });
//
//                        //if destinations.len() > 1 {
//                        //    match &destinations[1] {
//                        //        RegisterOrMemory::HeapVector(return_heap_vec) => {
//                        //            avm_opcodes.push(AvmInstruction {
//                        //                opcode: AVMOpcode::ADD,
//                        //                d0: mem_containing_ret_offset, s0: POINTER_TO_MEMORY, s1: return_heap_vec.pointer.to_usize(), ..Default::default()
//                        //            });
//                        //            avm_opcodes.push(AvmInstruction {
//                        //                opcode: AVMOpcode::MOV,
//                        //                d0: mem_containing_ret_size, s0: return_heap_vec.size.to_usize(), ..Default::default()
//                        //            });
//                        //        },
//                        //        _ => panic!("Transpiler expects ForeignCall::{}'s destination[1] to be a HeapVector for return data", function),
//                        //    };
//                        //}
//
//                        avm_opcodes.push(AvmInstruction {
//                            opcode: AVMOpcode::SET,
//                            d0: mem_containing_args_and_ret_offset, s0: SCRATCH_START, ..Default::default()
//                        });
//
//                        avm_opcodes.push(AvmInstruction {
//                            opcode: AVMOpcode::CALL,
//                            s0: gas_operand.to_usize(), s1: target_address_operand.to_usize(), sd: mem_containing_args_and_ret_offset, ..Default::default()
//                        });
//                    },
//                    "avm_sender" | "avm_address" | "avm_selector" | "avm_argshash" => {
//                        if destinations.len() != 1 || inputs.len() != 0 {
//                            panic!("Transpiler expects ForeignCall::{} to have 1 destination and 0 inputs, got {} and {}", function, destinations.len(), inputs.len());
//                        }
//                        let dest_operand = match &destinations[0] {
//                            RegisterOrMemory::RegisterIndex(index) => index,
//                            _ => panic!("Transpiler does not know how to handle ForeignCall::{} with HeapArray/Vector for dest/return operand", function),
//                        };
//                        let opcode = match &function[..] {
//                            "avm_sender" => AVMOpcode::SENDER,
//                            "avm_address" => AVMOpcode::ADDRESS,
//                            "avm_selector" => AVMOpcode::SELECTOR,
//                            "avm_argshash" => AVMOpcode::ARGSHASH,
//                            _ => panic!("ForeignCall::{} not recognized by transpiler", function),
//                        };
//                        avm_opcodes.push(AvmInstruction {
//                            opcode,
//                            d0: dest_operand.to_usize(), ..Default::default()
//                        });
//                    },
//                    _ => panic!("Transpiler does not recognize ForeignCall function {0}", function),
//                }
//            },
//            BrilligOpcode::Stop {} => {
//                let return_size = brillig.outputs.len();
//                //// Use the register right after inputs and outputs as a scratch register for return size
//                //let return_size_addr = brillig.inputs.len() + brillig.outputs.len();
//                let mem_for_return_size = SCRATCH_START;
//                avm_opcodes.push(AvmInstruction {
//                    opcode: AVMOpcode::SET,
//                    d0: mem_for_return_size, s0: return_size, ..Default::default() 
//                });
//                avm_opcodes.push(AvmInstruction {
//                    opcode: AVMOpcode::RETURN,
//                    // TODO: is outputs[0] (start of returndata) always "2"? Seems so....
//                    s0: 2, s1: mem_for_return_size, ..Default::default() 
//                });
//            },
//            BrilligOpcode::Trap {} => {
//                // Trap is a revert, but for now it does not support a return value
//                let return_size = brillig.outputs.len();
//                //// Use the register right after inputs and outputs as a scratch register for return size
//                //let return_size_addr = brillig.inputs.len() + brillig.outputs.len();
//                let mem_for_return_size = SCRATCH_START;
//                avm_opcodes.push(AvmInstruction {
//                    opcode: AVMOpcode::SET,
//                    d0: mem_for_return_size, s0: return_size, ..Default::default() 
//                });
//                avm_opcodes.push(AvmInstruction {
//                    opcode: AVMOpcode::REVERT,
//                    // TODO: is outputs[0] (start of returndata) always "2"? Seems so....
//                    s0: 2, s1: mem_for_return_size, ..Default::default() 
//                });
//            },
//            BrilligOpcode::Return {} =>
//                avm_opcodes.push(AvmInstruction {
//                    opcode: AVMOpcode::INTERNALRETURN,
//                    ..Default::default()
//                }),
//            BrilligOpcode::BlackBox(bb_op) =>
//                match &bb_op {
//                    BlackBoxOp::PedersenCommitment { inputs, domain_separator, output } => {
//                        let mem_containing_args_offset = SCRATCH_START;
//                        let mem_containing_ret_offset = SCRATCH_START+1;
//
//                        // offset inputs into region dedicated to brillig "memory"
//                        avm_opcodes.push(AvmInstruction {
//                            opcode: AVMOpcode::ADD,
//                            d0: mem_containing_args_offset, s0: POINTER_TO_MEMORY, s1: inputs.pointer.to_usize(), ..Default::default()
//                        });
//                        // offset output into region dedicated to brillig "memory"
//                        avm_opcodes.push(AvmInstruction {
//                            opcode: AVMOpcode::ADD,
//                            d0: mem_containing_ret_offset, s0: POINTER_TO_MEMORY, s1: output.pointer.to_usize(), ..Default::default()
//                        });
//
//                        avm_opcodes.push(AvmInstruction {
//                            opcode: AVMOpcode::PEDERSEN,
//                            d0: mem_containing_ret_offset, sd: inputs.size.to_usize(), s0: domain_separator.to_usize(), s1: mem_containing_args_offset, ..Default::default() 
//                        });
//                        // pedersen commit has output size 2, so that can be hardcoded in simulator
//                        // TODO this true still?
//                    },
//                    BlackBoxOp::PedersenHash { inputs, domain_separator, output } => {
//                        let mem_containing_args_offset = SCRATCH_START;
//
//                        // offset inputs into region dedicated to brillig "memory"
//                        avm_opcodes.push(AvmInstruction {
//                            opcode: AVMOpcode::ADD,
//                            d0: mem_containing_args_offset, s0: POINTER_TO_MEMORY, s1: inputs.pointer.to_usize(), ..Default::default()
//                        });
//
//                        avm_opcodes.push(AvmInstruction {
//                            opcode: AVMOpcode::PEDERSEN,
//                            d0: output.to_usize(), sd: inputs.size.to_usize(), s0: domain_separator.to_usize(), s1: mem_containing_args_offset, ..Default::default() 
//                        });
//                    },
//                    //BlackBoxOp::Keccak256 { message, output } => {
//                    //    let mem_containing_args_offset = SCRATCH_START;
//                    //    let mem_containing_ret_offset = SCRATCH_START+1;
//
//                    //    // offset inputs into region dedicated to brillig "memory"
//                    //    avm_opcodes.push(AvmInstruction {
//                    //        opcode: AVMOpcode::ADD,
//                    //        d0: mem_containing_args_offset, s0: POINTER_TO_MEMORY, s1: message.pointer.to_usize(), ..Default::default()
//                    //    });
//                    //    // offset output into region dedicated to brillig "memory"
//                    //    avm_opcodes.push(AvmInstruction {
//                    //        opcode: AVMOpcode::ADD,
//                    //        d0: mem_containing_ret_offset, s0: POINTER_TO_MEMORY, s1: output.pointer.to_usize(), ..Default::default()
//                    //    });
//
//                    //    avm_opcodes.push(AvmInstruction {
//                    //        opcode: AVMOpcode::KECCAK256,
//                    //        d0: mem_containing_ret_offset, sd: message.size.to_usize(), /*s0: domain_separator.to_usize(),*/ s1: mem_containing_args_offset, ..Default::default() 
//                    //    });
//                    //    // pedersen always has output size 2, so that can be hardcoded in simulator
//                    //},
//                    _ => panic!("Transpiler doesn't know how to process BlackBoxOp::{:?} instruction", bb_op),
//                },
//            _ => panic!("Transpiler doesn't know how to process {:?} instruction", instr),
//
//        };
//    }
//    // TODO: separate function for printing avm instructions
//    // TODO: separate function for converting avm instruction vec to bytecode
//    println!("Printing all AVM instructions!");
//    let mut bytecode = Vec::new();
//    for i in 0..avm_opcodes.len() {
//        let avm_instr = &avm_opcodes[i];
//        println!("PC:{0}: {1}", i, avm_instr.to_string());
//        let mut instr_bytes = avm_instr.to_bytes();
//        bytecode.append(&mut instr_bytes);
//    }
//    bytecode
//}
//
//
//#[derive(Copy, Clone)]
//pub enum OperandMode {
//    DIRECT,
//    INDIRECT,
//    IMMEDIATE,
//}
//impl OperandMode {
//    pub fn name(&self) -> &'static str {
//        match self {
//            OperandMode::DIRECT => "DIRECT",
//            OperandMode::INDIRECT => "INDIRECT",
//            OperandMode::IMMEDIATE => "IMMEDIATE",
//        }
//    }
//}
//
//#[derive(Copy, Clone)]
//pub enum OperandType {
//    FIELD,
//    U8,
//    U16,
//    U32,
//    U64,
//    //U128,
//}
//impl OperandType {
//    pub fn name(&self) -> &'static str {
//        match self {
//            OperandType::FIELD => "FIELD",
//            OperandType::U8 => "U8",
//            OperandType::U16 => "U16",
//            OperandType::U32 => "U32",
//            OperandType::U64 => "U64",
//            //OperandType::U128 => "U128",
//        }
//    }
//}
//
//
////pub struct Operand {
////    mode: OperandMode,
////    typ: OperandType,
////    value: usize,
////}
////impl Operand {
////    fn basic(value: usize) -> Self {
////        Operand { value: value, ..Default::default()}
////    }
////    fn to_string(&self) -> String {
////        format!("mode: {}, typ: {}, value: {}", self.mode.name(), self.typ.name(), self.value)
////    }
////    fn to_bytes(&self) -> Vec<u8> {
////        let mut bytes = Vec::new();
////        bytes.push(self.mode as u8);
////        bytes.push(self.typ as u8);
////        bytes.extend_from_slice(&(self.value as u32).to_be_bytes());
////        bytes
////    }
////}
////impl Default for Operand {
////    fn default() -> Self {
////        Operand {
////            mode: OperandMode::DIRECT,
////            typ: OperandType::FIELD,
////            value: 0,
////        }
////    }
////}
//
////pub struct AVMFields {
////    d0: usize,
////    sd: usize,
////    s0: usize,
////    s1: usize,
////    d0_indirect: bool,
////    s0_indirect: bool,
////}
////impl AVMFields {
////    fn to_string(&self) -> String {
////        format!("d0: {}, sd: {}, s0: {}, s1: {}, d0_indirect: {}, s0_indirect: {}", self.d0, self.sd, self.s0, self.s1, self.d0_indirect, self.s0_indirect)
////    }
////    fn to_bytes(&self) -> Vec<u8> {
////        let mut bytes = [
////            (self.d0 as u32).to_be_bytes(),
////            (self.sd as u32).to_be_bytes(),
////            (self.s0 as u32).to_be_bytes(),
////            (self.s1 as u32).to_be_bytes(),
////        ].concat();
////        bytes.push(self.d0_indirect as u8);
////        bytes.push(self.s0_indirect as u8);
////        bytes
////    }
////}
////impl Default for AVMFields {
////    fn default() -> Self {
////        AVMFields {
////            d0: 0,
////            sd: 0,
////            s0: 0,
////            s1: 0,
////            d0_indirect: false,
////            s0_indirect: false,
////        }
////    }
////}
//
////pub struct AVMSimpleInstruction {
////    opcode: AVMOpcode,
////    d0: usize,
////    sd: usize,
////    s0: usize,
////    s1: usize,
////}
////impl AVMSimpleInstruction {
////    fn to_full_instruction(&self) -> AvmInstruction {
////        let mut instr = AvmInstruction { opcode: self.opcode, ..Default::default() };
////        instr.d0.value = self.d0;
////        instr.sd.value = self.sd;
////        instr.s0.value = self.s0;
////        instr.s1.value = self.s1;
////        instr
////    }
////    fn to_string(&self) -> String {
////        format!("opcode: {}, d0: {}, sd: {}, s0: {}, s1: {}",
////            self.opcode.name(),
////            self.d0,
////            self.sd,
////            self.s0,
////            self.s1)
////    }
////    fn to_bytes(&self) -> Vec<u8> {
////        let instr = self.to_full_instruction();
////        let mut bytes = Vec::new();
////        bytes.push(instr.opcode as u8);
////        bytes.extend_from_slice(&(instr.d0 as u32).to_be_bytes());
////        bytes.extend_from_slice(&(instr.sd as u32).to_be_bytes());
////        bytes.extend_from_slice(&(instr.s0 as u32).to_be_bytes());
////        bytes.extend_from_slice(&(instr.s1 as u32).to_be_bytes());
////        bytes
////    }
////}
////impl Default for AVMSimpleInstruction {
////    fn default() -> Self {
////        AVMSimpleInstruction {
////            opcode: AVMOpcode::ADD,
////            d0: 0,
////            sd: 0,
////            s0: 0,
////            s1: 0,
////        }
////    }
////}
//
//pub struct OperandOptions {
//    mode: OperandMode,
//    typ: OperandType,
//}
//impl OperandOptions {
//    fn to_string(&self) -> String {
//        format!("mode:{},type:{}", self.mode.name(), self.typ.name())
//    }
//    fn to_u8(&self) -> u8 {
//        //let mut bytes = Vec::new();
//        let shiftedTyp = (self.typ as u8) << 4;
//        shiftedTyp | (self.mode as u8)
//        //bytes.push(self.mode as u8);
//        //bytes.push(self.typ as u8);
//        //bytes
//    }
//}
//impl Default for OperandOptions {
//    fn default() -> Self {
//        OperandOptions {
//            mode: OperandMode::DIRECT,
//            typ: OperandType::FIELD,
//        }
//    }
//}
//
//pub struct AvmInstruction {
//    opcode: AVMOpcode,
//    d0_options: OperandOptions,
//    d0: usize,
//    sd_options: OperandOptions,
//    sd: usize,
//    s0_options: OperandOptions,
//    s0: usize,
//    s1_options: OperandOptions,
//    s1: usize,
//}
//impl AvmInstruction {
//    fn to_string(&self) -> String {
//        format!("opcode: {}, d0({}):{}, sd({}):{}, s0({}):{}, s1({}):{}",
//            self.opcode.name(),
//            self.d0_options.to_string(),
//            self.d0.to_string(),
//            self.sd_options.to_string(),
//            self.sd.to_string(),
//            self.s0_options.to_string(),
//            self.s0.to_string(),
//            self.s1_options.to_string(),
//            self.s1.to_string())
//    }
//    fn to_bytes(&self) -> Vec<u8> {
//        let mut bytes = Vec::new();
//        bytes.push(self.opcode as u8);
//        bytes.push(self.d0_options.to_u8());
//        bytes.extend_from_slice(&(self.d0 as u32).to_be_bytes());
//        bytes.push(self.sd_options.to_u8());
//        bytes.extend_from_slice(&(self.sd as u32).to_be_bytes());
//        bytes.push(self.s0_options.to_u8());
//        bytes.extend_from_slice(&(self.s0 as u32).to_be_bytes());
//        bytes.push(self.s1_options.to_u8());
//        bytes.extend_from_slice(&(self.s1 as u32).to_be_bytes());
//        bytes
//    }
//}
//impl Default for AvmInstruction {
//    fn default() -> Self {
//        AvmInstruction {
//            opcode: AVMOpcode::ADD,
//            d0_options: OperandOptions::default(),
//            d0: 0,
//            sd_options: OperandOptions::default(),
//            sd: 0,
//            s0_options: OperandOptions::default(),
//            s0: 0,
//            s1_options: OperandOptions::default(),
//            s1: 0,
//        }
//    }
//}
//
//#[derive(Copy, Clone)]
//pub enum AVMOpcode {
//  // Arithmetic
//  ADD,
//  SUB,
//  MUL,
//  DIV,
//  EQ,
//  LT,
//  LTE,
//  AND,
//  OR,
//  XOR,
//  NOT,
//  SHL,
//  SHR,
//  // Memory
//  SET,
//  MOV,
//  CALLDATASIZE,
//  CALLDATACOPY,
//  // Control flow
//  JUMP,
//  JUMPI,
//  INTERNALCALL,
//  INTERNALRETURN,
//  // Storage
//  SLOAD,
//  SSTORE,
//  // Contract call control flow
//  RETURN,
//  REVERT,
//  CALL,
//  // Call context
//  SENDER,
//  ADDRESS,
//  SELECTOR,
//  ARGSHASH,
//  // Blackbox ops
//  PEDERSEN,
//  KECCAK256,
//}
//impl AVMOpcode {
//    pub fn name(&self) -> &'static str {
//        match self {
//            AVMOpcode::ADD => "ADD",
//            AVMOpcode::SUB => "SUB",
//            AVMOpcode::MUL => "MUL",
//            AVMOpcode::DIV => "DIV",
//            AVMOpcode::EQ => "EQ",
//            AVMOpcode::LT => "LT",
//            AVMOpcode::LTE => "LTE",
//            AVMOpcode::AND => "AND",
//            AVMOpcode::OR => "OR",
//            AVMOpcode::XOR => "XOR",
//            AVMOpcode::NOT => "NOT",
//            AVMOpcode::SHL => "SHL",
//            AVMOpcode::SHR => "SHR",
//
//            AVMOpcode::SET => "SET",
//            AVMOpcode::MOV => "MOV",
//            AVMOpcode::CALLDATASIZE => "CALLDATASIZE",
//            AVMOpcode::CALLDATACOPY => "CALLDATACOPY",
//            AVMOpcode::JUMP => "JUMP",
//            AVMOpcode::JUMPI => "JUMPI",
//            AVMOpcode::INTERNALCALL => "INTERNALCALL",
//            AVMOpcode::INTERNALRETURN => "INTERNALRETURN",
//            AVMOpcode::SLOAD => "SLOAD",
//            AVMOpcode::SSTORE => "SSTORE",
//            AVMOpcode::RETURN => "RETURN",
//            AVMOpcode::REVERT => "REVERT",
//            AVMOpcode::CALL => "CALL",
//
//            AVMOpcode::SENDER => "SENDER",
//            AVMOpcode::ADDRESS => "ADDRESS",
//            AVMOpcode::SELECTOR => "SELECTOR",
//            AVMOpcode::ARGSHASH => "ARGSHASH",
//
//            AVMOpcode::PEDERSEN => "PEDERSEN",
//            AVMOpcode::KECCAK256 => "KECCAK256",
//        }
//    }
//}
//