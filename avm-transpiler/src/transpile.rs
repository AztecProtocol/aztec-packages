use acvm::acir::brillig::Opcode as BrilligOpcode;
use acvm::acir::circuit::brillig::Brillig;

use acvm::brillig_vm::brillig::{BinaryFieldOp, BinaryIntOp};

use crate::instructions::{
    AvmInstruction, AvmOperand, AvmTypeTag, FIRST_OPERAND_INDIRECT, ZEROTH_OPERAND_INDIRECT,
};
use crate::opcodes::AvmOpcode;
use crate::utils::{print_avm_program, print_brillig_program};

/// Map Brillig register indices directly to AVM memory offsets
/// Map Brillig memory to AVM memory, but offset by a constant
const MEMORY_START: u32 = 1024;
const POINTER_TO_MEMORY: u32 = 2048;
/// Some instructions require a word to use as a scratchpad
const SCRATCH_WORD: u32 = 2049;

pub fn brillig_to_avm(brillig: &Brillig) -> Vec<u8> {
    // TODO: only print if VERY verbose
    print_brillig_program(&brillig);

    let mut avm_instrs: Vec<AvmInstruction> = Vec::new();

    // Copy args from calldata to "memory"
    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::CALLDATACOPY,
        operands: vec![
            AvmOperand::U32 { value: 0 },
            AvmOperand::U32 {
                value: brillig.inputs.len() as u32,
            },
            AvmOperand::U32 { value: 0 },
        ],
        ..Default::default()
    });
    // Set a pointer to the AVM memory offset that represents Brillig memory offset 0
    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::SET,
        dst_tag: Some(AvmTypeTag::UINT32),
        operands: vec![
            AvmOperand::U32 {
                value: POINTER_TO_MEMORY,
            },
            AvmOperand::U32 {
                value: MEMORY_START,
            },
        ],
        ..Default::default()
    });

    // Map Brillig pcs to AVM pcs considering these initial instructions
    // and any other Brillig instructions that map to >1 AVM instruction
    let brillig_pcs_to_avm_pcs = map_brillig_pcs_to_avm_pcs(avm_instrs.len(), brillig);

    // Transpile a Brillig instruction to one or more AVM instructions
    for brillig_instr in &brillig.bytecode {
        match brillig_instr {
            BrilligOpcode::BinaryFieldOp {
                destination,
                op,
                lhs,
                rhs,
            } => {
                let avm_opcode = match op {
                    BinaryFieldOp::Add => AvmOpcode::ADD,
                    BinaryFieldOp::Sub => AvmOpcode::SUB,
                    BinaryFieldOp::Mul => AvmOpcode::MUL,
                    BinaryFieldOp::Div => AvmOpcode::DIV,
                    BinaryFieldOp::Equals => AvmOpcode::EQ,
                    _ => panic!(
                        "Transpiler doesn't know how to process BinaryFieldOp {:?}",
                        brillig_instr
                    ),
                };
                // TODO(4268): set in_tag to `field`
                avm_instrs.push(AvmInstruction {
                    opcode: avm_opcode,
                    operands: vec![
                        AvmOperand::U32 {
                            value: lhs.to_usize() as u32,
                        },
                        AvmOperand::U32 {
                            value: rhs.to_usize() as u32,
                        },
                        AvmOperand::U32 {
                            value: destination.to_usize() as u32,
                        },
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::BinaryIntOp {
                destination,
                op,
                bit_size,
                lhs,
                rhs,
            } => {
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
                    _ => panic!(
                        "Transpiler doesn't know how to process BinaryIntOp {:?}",
                        brillig_instr
                    ),
                };
                // TODO(4268): support u8..u128 and use in_tag
                avm_instrs.push(AvmInstruction {
                    opcode: avm_opcode,
                    operands: vec![
                        AvmOperand::U32 {
                            value: lhs.to_usize() as u32,
                        },
                        AvmOperand::U32 {
                            value: rhs.to_usize() as u32,
                        },
                        AvmOperand::U32 {
                            value: destination.to_usize() as u32,
                        },
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::Jump { location } => {
                let avm_loc = brillig_pcs_to_avm_pcs[*location];
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::JUMP,
                    operands: vec![AvmOperand::U32 {
                        value: avm_loc as u32,
                    }],
                    ..Default::default()
                });
            }
            BrilligOpcode::JumpIf {
                condition,
                location,
            } => {
                let avm_loc = brillig_pcs_to_avm_pcs[*location];
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::JUMPI,
                    operands: vec![
                        AvmOperand::U32 {
                            value: avm_loc as u32,
                        },
                        AvmOperand::U32 {
                            value: condition.to_usize() as u32,
                        },
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::Const { destination, value } => {
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::SET,
                    dst_tag: Some(AvmTypeTag::UINT32),
                    operands: vec![
                        // TODO(4267): support u8..u128 and use dst_tag
                        AvmOperand::U32 {
                            value: value.to_usize() as u32,
                        },
                        AvmOperand::U32 {
                            value: destination.to_usize() as u32,
                        },
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::Mov {
                destination,
                source,
            } => {
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::MOV,
                    operands: vec![
                        AvmOperand::U32 {
                            value: source.to_usize() as u32,
                        },
                        AvmOperand::U32 {
                            value: destination.to_usize() as u32,
                        },
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::Load {
                destination,
                source_pointer,
            } => {
                // Brillig Load does R[dst] = M[R[src]]
                // So, we transpile to a MOV with indirect addressing for src (s0)
                // But we offset all Brillig "memory" to avoid collisions with registers since in the AVM everything is memory
                // (via ADD and a scratchpad memory word)
                let src_ptr_after_mem_offset = SCRATCH_WORD;
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::ADD,
                    operands: vec![
                        AvmOperand::U32 {
                            value: POINTER_TO_MEMORY,
                        },
                        AvmOperand::U32 {
                            value: source_pointer.to_usize() as u32,
                        },
                        AvmOperand::U32 {
                            value: src_ptr_after_mem_offset,
                        },
                    ],
                    ..Default::default()
                });

                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::MOV,
                    indirect: Some(ZEROTH_OPERAND_INDIRECT), // indirect srcOffset operand
                    operands: vec![
                        AvmOperand::U32 {
                            value: src_ptr_after_mem_offset,
                        },
                        AvmOperand::U32 {
                            value: destination.to_usize() as u32,
                        },
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::Store {
                destination_pointer,
                source,
            } => {
                // Brillig Store does M[R[dst]] = R[src]
                // So, we transpile to a MOV with indirect addressing for dst (d0)
                // But we offset all Brillig "memory" to avoid collisions with registers since in the AVM everything is memory
                // (via ADD and a scratchpad memory word)
                let dst_ptr_after_mem_offset = SCRATCH_WORD;
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::ADD,
                    operands: vec![
                        AvmOperand::U32 {
                            value: POINTER_TO_MEMORY,
                        },
                        AvmOperand::U32 {
                            value: destination_pointer.to_usize() as u32,
                        },
                        AvmOperand::U32 {
                            value: dst_ptr_after_mem_offset,
                        },
                    ],
                    ..Default::default()
                });

                // INDIRECT dstOffset operand (bit 1 set high)
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::MOV,
                    indirect: Some(FIRST_OPERAND_INDIRECT), // indirect dstOffset operand
                    operands: vec![
                        AvmOperand::U32 {
                            value: source.to_usize() as u32,
                        },
                        AvmOperand::U32 {
                            value: dst_ptr_after_mem_offset,
                        },
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::Call { location } => {
                let avm_loc = brillig_pcs_to_avm_pcs[*location];
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::INTERNALCALL,
                    operands: vec![AvmOperand::U32 {
                        value: avm_loc as u32,
                    }],
                    ..Default::default()
                });
            }
            BrilligOpcode::Return {} => avm_instrs.push(AvmInstruction {
                opcode: AvmOpcode::INTERNALRETURN,
                ..Default::default()
            }),
            BrilligOpcode::Stop {} => {
                // TODO(4215): Fix once returndata is a construct in Brillig.
                // outputs[0] seems to always be 2?
                let ret_offset = 2;
                let ret_size = brillig.outputs.len() as u32;
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::RETURN,
                    operands: vec![
                        AvmOperand::U32 { value: ret_offset },
                        AvmOperand::U32 { value: ret_size },
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::Trap {} => {
                // TODO(4215): Fix once returndata is a construct in Brillig.
                // outputs[0] seems to always be 2?
                let ret_offset = 2;
                let ret_size = brillig.outputs.len() as u32;
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::REVERT,
                    operands: vec![
                        AvmOperand::U32 { value: ret_offset },
                        AvmOperand::U32 { value: ret_size },
                    ],
                    ..Default::default()
                });
            }
            _ => panic!(
                "Transpiler doesn't know how to process {:?} brillig instruction",
                brillig_instr
            ),
        }
    }

    // TODO: only print if VERY verbose
    print_avm_program(&avm_instrs);

    // Constructing bytecode from instructions
    let mut bytecode = Vec::new();
    for i in 0..avm_instrs.len() {
        let mut instr_bytes = avm_instrs[i].to_bytes();
        bytecode.append(&mut instr_bytes);
    }
    bytecode
}

/// Compute an array that maps each Brillig pc to an AVM pc.
/// This must be done before transpiling to properly transpile jump destinations.
/// This is necessary for two reasons:
/// 1. The transpiler injects `initial_offset` instructions at the beginning of the program.
/// 2. Some brillig instructions (_e.g._ Stop, or certain ForeignCalls) map to multiple AVM instructions
/// args:
///     initial_offset: how many AVM instructions were inserted at the start of the program
///     brillig: the Brillig program
/// returns: an array where each index is a Brillig pc,
///     and each value is the corresponding AVM pc.
fn map_brillig_pcs_to_avm_pcs(initial_offset: usize, brillig: &Brillig) -> Vec<usize> {
    let mut pc_map = Vec::new();
    pc_map.resize(brillig.bytecode.len(), 0);
    pc_map[0] = initial_offset;
    for i in 0..brillig.bytecode.len() - 1 {
        let num_avm_instrs_for_this_brillig_instr = match &brillig.bytecode[i] {
            BrilligOpcode::Load { .. } => 2,
            BrilligOpcode::Store { .. } => 2,
            _ => 1,
        };
        // next Brillig pc will map to an AVM pc offset by the
        // number of AVM instructions generated for this Brillig one
        pc_map[i + 1] = pc_map[i] + num_avm_instrs_for_this_brillig_instr;
    }
    pc_map
}
