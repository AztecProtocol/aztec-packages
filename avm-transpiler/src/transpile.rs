use acvm::acir::brillig::{BitSize, IntegerBitSize, Opcode as BrilligOpcode};
use std::collections::BTreeMap;

use acvm::acir::circuit::BrilligOpcodeLocation;
use acvm::brillig_vm::brillig::{
    BinaryFieldOp, BinaryIntOp, BlackBoxOp, HeapArray, HeapVector, MemoryAddress, ValueOrArray,
};
use acvm::FieldElement;
use noirc_errors::debug_info::DebugInfo;

use crate::bit_traits::{bits_needed_for, BitsQueryable};
use crate::instructions::{AddressingModeBuilder, AvmInstruction, AvmOperand, AvmTypeTag};
use crate::opcodes::AvmOpcode;
use crate::utils::{dbg_print_avm_program, dbg_print_brillig_program, make_operand};

/// Transpile a Brillig program to AVM bytecode
/// Returns the bytecode and a mapping from Brillig program counter to AVM program counter.
pub fn brillig_to_avm(brillig_bytecode: &[BrilligOpcode<FieldElement>]) -> (Vec<u8>, Vec<usize>) {
    dbg_print_brillig_program(brillig_bytecode);

    let mut avm_instrs: Vec<AvmInstruction> = Vec::new();
    let mut brillig_pcs_to_avm_pcs: Vec<usize> = [0_usize].to_vec();
    let mut current_avm_pc: usize = 0;

    // Transpile a Brillig instruction to one or more AVM instructions
    for brillig_instr in brillig_bytecode {
        let current_avm_instr_index = avm_instrs.len();

        match brillig_instr {
            BrilligOpcode::BinaryFieldOp { destination, op, lhs, rhs } => {
                let bits_needed =
                    [*lhs, *rhs, *destination].iter().map(bits_needed_for).max().unwrap();

                assert!(
                    bits_needed == 8 || bits_needed == 16,
                    "BinaryFieldOp only support 8 or 16 bit encodings, got: {}",
                    bits_needed
                );

                let avm_opcode = match op {
                    BinaryFieldOp::Add => match bits_needed {
                        8 => AvmOpcode::ADD_8,
                        16 => AvmOpcode::ADD_16,
                        _ => unreachable!(),
                    },
                    BinaryFieldOp::Sub => match bits_needed {
                        8 => AvmOpcode::SUB_8,
                        16 => AvmOpcode::SUB_16,
                        _ => unreachable!(),
                    },
                    BinaryFieldOp::Mul => match bits_needed {
                        8 => AvmOpcode::MUL_8,
                        16 => AvmOpcode::MUL_16,
                        _ => unreachable!(),
                    },
                    BinaryFieldOp::Div => match bits_needed {
                        8 => AvmOpcode::FDIV_8,
                        16 => AvmOpcode::FDIV_16,
                        _ => unreachable!(),
                    },
                    BinaryFieldOp::IntegerDiv => match bits_needed {
                        8 => AvmOpcode::DIV_8,
                        16 => AvmOpcode::DIV_16,
                        _ => unreachable!(),
                    },
                    BinaryFieldOp::Equals => match bits_needed {
                        8 => AvmOpcode::EQ_8,
                        16 => AvmOpcode::EQ_16,
                        _ => unreachable!(),
                    },
                    BinaryFieldOp::LessThan => match bits_needed {
                        8 => AvmOpcode::LT_8,
                        16 => AvmOpcode::LT_16,
                        _ => unreachable!(),
                    },
                    BinaryFieldOp::LessThanEquals => match bits_needed {
                        8 => AvmOpcode::LTE_8,
                        16 => AvmOpcode::LTE_16,
                        _ => unreachable!(),
                    },
                };

                avm_instrs.push(AvmInstruction {
                    opcode: avm_opcode,
                    indirect: Some(
                        AddressingModeBuilder::default()
                            .direct_operand(lhs)
                            .direct_operand(rhs)
                            .direct_operand(destination)
                            .build(),
                    ),
                    operands: vec![
                        make_operand(bits_needed, &lhs.to_usize()),
                        make_operand(bits_needed, &rhs.to_usize()),
                        make_operand(bits_needed, &destination.to_usize()),
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::BinaryIntOp { destination, op, lhs, rhs, .. } => {
                let bits_needed =
                    [*lhs, *rhs, *destination].iter().map(bits_needed_for).max().unwrap();
                assert!(
                    bits_needed == 8 || bits_needed == 16,
                    "BinaryIntOp only support 8 or 16 bit encodings, got: {}",
                    bits_needed
                );

                let avm_opcode = match op {
                    BinaryIntOp::Add => match bits_needed {
                        8 => AvmOpcode::ADD_8,
                        16 => AvmOpcode::ADD_16,
                        _ => unreachable!(),
                    },
                    BinaryIntOp::Sub => match bits_needed {
                        8 => AvmOpcode::SUB_8,
                        16 => AvmOpcode::SUB_16,
                        _ => unreachable!(),
                    },
                    BinaryIntOp::Mul => match bits_needed {
                        8 => AvmOpcode::MUL_8,
                        16 => AvmOpcode::MUL_16,
                        _ => unreachable!(),
                    },
                    BinaryIntOp::Div => match bits_needed {
                        8 => AvmOpcode::DIV_8,
                        16 => AvmOpcode::DIV_16,
                        _ => unreachable!(),
                    },
                    BinaryIntOp::And => match bits_needed {
                        8 => AvmOpcode::AND_8,
                        16 => AvmOpcode::AND_16,
                        _ => unreachable!(),
                    },
                    BinaryIntOp::Or => match bits_needed {
                        8 => AvmOpcode::OR_8,
                        16 => AvmOpcode::OR_16,
                        _ => unreachable!(),
                    },
                    BinaryIntOp::Xor => match bits_needed {
                        8 => AvmOpcode::XOR_8,
                        16 => AvmOpcode::XOR_16,
                        _ => unreachable!(),
                    },
                    BinaryIntOp::Shl => match bits_needed {
                        8 => AvmOpcode::SHL_8,
                        16 => AvmOpcode::SHL_16,
                        _ => unreachable!(),
                    },
                    BinaryIntOp::Shr => match bits_needed {
                        8 => AvmOpcode::SHR_8,
                        16 => AvmOpcode::SHR_16,
                        _ => unreachable!(),
                    },
                    BinaryIntOp::Equals => match bits_needed {
                        8 => AvmOpcode::EQ_8,
                        16 => AvmOpcode::EQ_16,
                        _ => unreachable!(),
                    },
                    BinaryIntOp::LessThan => match bits_needed {
                        8 => AvmOpcode::LT_8,
                        16 => AvmOpcode::LT_16,
                        _ => unreachable!(),
                    },
                    BinaryIntOp::LessThanEquals => match bits_needed {
                        8 => AvmOpcode::LTE_8,
                        16 => AvmOpcode::LTE_16,
                        _ => unreachable!(),
                    },
                };
                avm_instrs.push(AvmInstruction {
                    opcode: avm_opcode,
                    indirect: Some(
                        AddressingModeBuilder::default()
                            .direct_operand(lhs)
                            .direct_operand(rhs)
                            .direct_operand(destination)
                            .build(),
                    ),
                    operands: vec![
                        make_operand(bits_needed, &lhs.to_usize()),
                        make_operand(bits_needed, &rhs.to_usize()),
                        make_operand(bits_needed, &destination.to_usize()),
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::Not { destination, source, .. } => {
                let bits_needed =
                    [*source, *destination].iter().map(bits_needed_for).max().unwrap();
                assert!(
                    bits_needed == 8 || bits_needed == 16,
                    "Not only support 8 or 16 bit encodings, got: {}",
                    bits_needed
                );

                avm_instrs.push(AvmInstruction {
                    opcode: if bits_needed == 8 { AvmOpcode::NOT_8 } else { AvmOpcode::NOT_16 },
                    indirect: Some(
                        AddressingModeBuilder::default()
                            .direct_operand(source)
                            .direct_operand(destination)
                            .build(),
                    ),
                    operands: vec![
                        make_operand(bits_needed, &source.to_usize()),
                        make_operand(bits_needed, &destination.to_usize()),
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::CalldataCopy { destination_address, size_address, offset_address } => {
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::CALLDATACOPY,
                    indirect: Some(
                        AddressingModeBuilder::default()
                            .direct_operand(offset_address)
                            .direct_operand(size_address)
                            .direct_operand(destination_address)
                            .build(),
                    ),
                    operands: vec![
                        AvmOperand::U16 {
                            value: offset_address.to_usize() as u16, // cdOffset (calldata offset)
                        },
                        AvmOperand::U16 { value: size_address.to_usize() as u16 }, // sizeOffset
                        AvmOperand::U16 {
                            value: destination_address.to_usize() as u16, // dstOffset
                        },
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::Jump { location } => {
                assert!(location.num_bits() <= 32);
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::JUMP_32,
                    immediates: vec![AvmOperand::BRILLIG_LOCATION { brillig_pc: *location as u32 }],
                    ..Default::default()
                });
            }
            BrilligOpcode::JumpIf { condition, location } => {
                assert!(location.num_bits() <= 32);
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::JUMPI_32,
                    indirect: Some(
                        AddressingModeBuilder::default().direct_operand(condition).build(),
                    ),
                    operands: vec![make_operand(16, &condition.to_usize())],
                    immediates: vec![AvmOperand::BRILLIG_LOCATION { brillig_pc: *location as u32 }],
                    ..Default::default()
                });
            }
            BrilligOpcode::Const { destination, value, bit_size } => {
                handle_const(&mut avm_instrs, destination, value, bit_size, false);
            }
            BrilligOpcode::IndirectConst { destination_pointer, value, bit_size } => {
                handle_const(&mut avm_instrs, destination_pointer, value, bit_size, true);
            }
            BrilligOpcode::Mov { destination, source } => {
                avm_instrs.push(generate_mov_instruction(
                    Some(
                        AddressingModeBuilder::default()
                            .direct_operand(source)
                            .direct_operand(destination)
                            .build(),
                    ),
                    source.to_usize() as u32,
                    destination.to_usize() as u32,
                ));
            }
            BrilligOpcode::Load { destination, source_pointer } => {
                avm_instrs.push(generate_mov_instruction(
                    Some(
                        AddressingModeBuilder::default()
                            .indirect_operand(source_pointer)
                            .direct_operand(destination)
                            .build(),
                    ),
                    source_pointer.to_usize() as u32,
                    destination.to_usize() as u32,
                ));
            }
            BrilligOpcode::Store { destination_pointer, source } => {
                avm_instrs.push(generate_mov_instruction(
                    Some(
                        AddressingModeBuilder::default()
                            .direct_operand(source)
                            .indirect_operand(destination_pointer)
                            .build(),
                    ),
                    source.to_usize() as u32,
                    destination_pointer.to_usize() as u32,
                ));
            }
            BrilligOpcode::Call { location } => {
                assert!(location.num_bits() <= 32);
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::INTERNALCALL,
                    immediates: vec![AvmOperand::BRILLIG_LOCATION { brillig_pc: *location as u32 }],
                    ..Default::default()
                });
            }
            BrilligOpcode::Return {} => avm_instrs
                .push(AvmInstruction { opcode: AvmOpcode::INTERNALRETURN, ..Default::default() }),
            BrilligOpcode::Stop { return_data } => {
                generate_return_instruction(
                    &mut avm_instrs,
                    &return_data.pointer,
                    &return_data.size,
                );
            }
            BrilligOpcode::Trap { revert_data } => {
                generate_revert_instruction(
                    &mut avm_instrs,
                    &revert_data.pointer,
                    &revert_data.size,
                );
            }
            BrilligOpcode::Cast { destination, source, bit_size } => {
                handle_cast(&mut avm_instrs, source, destination, *bit_size);
            }
            BrilligOpcode::ForeignCall {
                function,
                destinations,
                inputs,
                destination_value_types: _,
                input_value_types: _,
            } => {
                handle_foreign_call(&mut avm_instrs, function, destinations, inputs);
            }
            BrilligOpcode::BlackBox(operation) => {
                handle_black_box_function(&mut avm_instrs, operation);
            }
            _ => panic!(
                "Transpiler doesn't know how to process {:?} brillig instruction",
                brillig_instr
            ),
        }

        // Increment the AVM program counter.
        current_avm_pc +=
            avm_instrs.iter().skip(current_avm_instr_index).map(|i| i.size()).sum::<usize>();
        brillig_pcs_to_avm_pcs.push(current_avm_pc);
    }

    // Now that we have the general structure of the AVM program, we need to resolve the
    // Brillig jump locations.
    let mut avm_instrs = avm_instrs
        .into_iter()
        .map(|i| match i.opcode {
            AvmOpcode::JUMP_32 | AvmOpcode::JUMPI_32 | AvmOpcode::INTERNALCALL => {
                let new_immediates = i
                    .immediates
                    .into_iter()
                    .map(|o| match o {
                        AvmOperand::BRILLIG_LOCATION { brillig_pc } => {
                            let avm_pc = brillig_pcs_to_avm_pcs[brillig_pc as usize];
                            assert!(avm_pc.num_bits() <= 32, "Oops! AVM PC is too large!");
                            AvmOperand::U32 { value: avm_pc as u32 }
                        }
                        _ => o,
                    })
                    .collect::<Vec<AvmOperand>>();
                AvmInstruction { immediates: new_immediates, ..i }
            }
            _ => i,
        })
        .collect::<Vec<AvmInstruction>>();

    // TEMPORARY: Add a "magic number" instruction to the end of the program.
    // This makes it possible to know that the bytecode corresponds to the AVM.
    // We are adding a MOV instruction that moves a value to itself.
    // This should therefore not affect the program's execution.
    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::MOV_16,
        indirect: Some(AddressingModeBuilder::default().build()),
        operands: vec![AvmOperand::U16 { value: 0x18ca }, AvmOperand::U16 { value: 0x18ca }],
        ..Default::default()
    });

    dbg_print_avm_program(&avm_instrs);

    // Constructing bytecode from instructions
    let mut bytecode = Vec::new();
    for instruction in avm_instrs {
        bytecode.extend_from_slice(&instruction.to_bytes());
    }

    (bytecode, brillig_pcs_to_avm_pcs)
}

/// Handle brillig foreign calls
/// Examples:
/// - Tree access opcodes
/// - Hashing/gadget opcodes
/// - Environment getter opcodes
/// - TODO: support for avm external calls through this function
fn handle_foreign_call(
    avm_instrs: &mut Vec<AvmInstruction>,
    function: &str,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    match function {
        "avmOpcodeCall" => handle_external_call(avm_instrs, destinations, inputs, AvmOpcode::CALL),
        "avmOpcodeStaticCall" => {
            handle_external_call(avm_instrs, destinations, inputs, AvmOpcode::STATICCALL);
        }
        "avmOpcodeEmitUnencryptedLog" => {
            handle_emit_unencrypted_log(avm_instrs, destinations, inputs);
        }
        "avmOpcodeNoteHashExists" => handle_note_hash_exists(avm_instrs, destinations, inputs),
        "avmOpcodeEmitNoteHash" | "avmOpcodeEmitNullifier" => handle_emit_note_hash_or_nullifier(
            function == "avmOpcodeEmitNullifier",
            avm_instrs,
            destinations,
            inputs,
        ),
        "avmOpcodeNullifierExists" => handle_nullifier_exists(avm_instrs, destinations, inputs),
        "avmOpcodeL1ToL2MsgExists" => handle_l1_to_l2_msg_exists(avm_instrs, destinations, inputs),
        "avmOpcodeSendL2ToL1Msg" => handle_send_l2_to_l1_msg(avm_instrs, destinations, inputs),
        "avmOpcodeCalldataCopy" => handle_calldata_copy(avm_instrs, destinations, inputs),
        "avmOpcodeReturndataSize" => handle_returndata_size(avm_instrs, destinations, inputs),
        "avmOpcodeReturndataCopy" => handle_returndata_copy(avm_instrs, destinations, inputs),
        "avmOpcodeReturn" => handle_return(avm_instrs, destinations, inputs),
        "avmOpcodeRevert" => handle_revert(avm_instrs, destinations, inputs),
        "avmOpcodeStorageRead" => handle_storage_read(avm_instrs, destinations, inputs),
        "avmOpcodeStorageWrite" => handle_storage_write(avm_instrs, destinations, inputs),
        "debugLog" => handle_debug_log(avm_instrs, destinations, inputs),
        // Getters.
        _ if inputs.is_empty() && destinations.len() == 1 => {
            handle_getter_instruction(avm_instrs, function, destinations, inputs);
        }
        // Get contract instance variations.
        _ if function.starts_with("avmOpcodeGetContractInstance") => {
            handle_get_contract_instance(avm_instrs, function, destinations, inputs);
        }
        // Anything else.
        _ => panic!("Transpiler doesn't know how to process ForeignCall function {}", function),
    }
}

/// Handle an AVM CALL
/// (an external 'call' brillig foreign call was encountered)
/// Adds the new instruction to the avm instructions list.
// #[oracle(avmOpcodeCall)]
// unconstrained fn call_opcode(
//     gas: [Field; 2], // gas allocation: [l2_gas, da_gas]
//     address: AztecAddress,
//     args: [Field],
// ) -> bool {}
fn handle_external_call(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
    opcode: AvmOpcode,
) {
    if destinations.len() != 1 || inputs.len() != 4 {
        panic!(
            "Transpiler expects ForeignCall (Static)Call to have 1 destinations and 4 inputs, got {} and {}.",
            destinations.len(),
            inputs.len()
        );
    }

    let gas_offset_ptr = match &inputs[0] {
        ValueOrArray::HeapArray(HeapArray { pointer, size }) => {
            assert!(
                *size == 2,
                "Call instruction's gas input should be a HeapArray of size 2 (`[l2Gas, daGas]`)"
            );
            pointer
        }
        _ => panic!("Call instruction's gas input should be a HeapArray"),
    };
    let address_offset = match &inputs[1] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!("Call instruction's target address input should be a basic MemoryAddress",),
    };
    // The args are a slice, and this is represented as a (Field, HeapVector).
    // The field is the length (memory address) and the HeapVector has the data and length again.
    // This is an ACIR internal representation detail that leaks to the SSA.
    // Observe that below, we use `inputs[3]` and therefore skip the length field.
    let args = &inputs[3];
    let (args_offset_ptr, args_size_offset) = match args {
        ValueOrArray::HeapVector(HeapVector { pointer, size }) => (pointer, size),
        _ => panic!("Call instruction's args input should be a HeapVector input"),
    };

    let success_offset = match &destinations[0] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!("Call instruction's success destination should be a basic MemoryAddress",),
    };
    avm_instrs.push(AvmInstruction {
        opcode,
        indirect: Some(
            AddressingModeBuilder::default()
                .indirect_operand(gas_offset_ptr)
                .direct_operand(address_offset)
                .indirect_operand(args_offset_ptr)
                .direct_operand(args_size_offset)
                .direct_operand(success_offset)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: gas_offset_ptr.to_usize() as u16 },
            AvmOperand::U16 { value: address_offset.to_usize() as u16 },
            AvmOperand::U16 { value: args_offset_ptr.to_usize() as u16 },
            AvmOperand::U16 { value: args_size_offset.to_usize() as u16 },
            AvmOperand::U16 { value: success_offset.to_usize() as u16 },
        ],
        ..Default::default()
    });
}

fn handle_cast(
    avm_instrs: &mut Vec<AvmInstruction>,
    source: &MemoryAddress,
    destination: &MemoryAddress,
    bit_size: BitSize,
) {
    let tag = tag_from_bit_size(bit_size);
    avm_instrs.push(generate_cast_instruction(source, false, destination, false, tag));
}

/// Handle an AVM NOTEHASHEXISTS instruction
/// Adds the new instruction to the avm instructions list.
fn handle_note_hash_exists(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    let (note_hash_offset_operand, leaf_index_offset_operand) = match inputs {
        [
            ValueOrArray::MemoryAddress(nh_offset),
            ValueOrArray::MemoryAddress(li_offset)
        ] => (nh_offset, li_offset),
        _ => panic!(
            "Transpiler expects ForeignCall::NOTEHASHEXISTS to have 2 inputs of type MemoryAddress, got {:?}", inputs
        ),
    };
    let exists_offset_operand = match destinations {
        [ValueOrArray::MemoryAddress(offset)] => offset,
        _ => panic!(
            "Transpiler expects ForeignCall::NOTEHASHEXISTS to have 1 output of type MemoryAddress, got {:?}", destinations
        ),
    };
    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::NOTEHASHEXISTS,
        indirect: Some(
            AddressingModeBuilder::default()
                .direct_operand(note_hash_offset_operand)
                .direct_operand(leaf_index_offset_operand)
                .direct_operand(exists_offset_operand)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: note_hash_offset_operand.to_usize() as u16 },
            AvmOperand::U16 { value: leaf_index_offset_operand.to_usize() as u16 },
            AvmOperand::U16 { value: exists_offset_operand.to_usize() as u16 },
        ],
        ..Default::default()
    });
}

fn handle_emit_unencrypted_log(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    if !destinations.is_empty() || inputs.len() != 2 {
        panic!(
            "Transpiler expects ForeignCall::EMITUNENCRYPTEDLOG to have 0 destinations and 2 inputs, got {} and {}",
            destinations.len(),
            inputs.len()
        );
    }

    // The fields are a slice, and this is represented as a (length: Field, slice: HeapVector).
    // The length field is redundant and we skipt it.
    let (message_offset, message_size_offset) = match &inputs[1] {
        ValueOrArray::HeapVector(vec) => (vec.pointer, vec.size),
        _ => panic!("Unexpected inputs for ForeignCall::EMITUNENCRYPTEDLOG: {:?}", inputs),
    };
    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::EMITUNENCRYPTEDLOG,
        // The message array from Brillig is indirect.
        indirect: Some(
            AddressingModeBuilder::default()
                .indirect_operand(&message_size_offset)
                .direct_operand(&message_size_offset)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: message_offset.to_usize() as u16 },
            AvmOperand::U16 { value: message_size_offset.to_usize() as u16 },
        ],
        ..Default::default()
    });
}

/// Handle an AVM EMITNOTEHASH or EMITNULLIFIER instruction
/// (an emitNoteHash or emitNullifier brillig foreign call was encountered)
/// Adds the new instruction to the avm instructions list.
fn handle_emit_note_hash_or_nullifier(
    is_nullifier: bool, // false for note hash, true for nullifier
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    let function_name = if is_nullifier { "EMITNULLIFIER" } else { "EMITNOTEHASH" };

    if !destinations.is_empty() || inputs.len() != 1 {
        panic!(
            "Transpiler expects ForeignCall::{} to have 0 destinations and 1 input, got {} and {}",
            function_name,
            destinations.len(),
            inputs.len()
        );
    }
    let offset_operand = match &inputs[0] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!(
            "Transpiler does not know how to handle ForeignCall::{} with HeapArray/Vector inputs",
            function_name
        ),
    };
    avm_instrs.push(AvmInstruction {
        opcode: if is_nullifier { AvmOpcode::EMITNULLIFIER } else { AvmOpcode::EMITNOTEHASH },
        indirect: Some(AddressingModeBuilder::default().direct_operand(offset_operand).build()),
        operands: vec![AvmOperand::U16 { value: offset_operand.to_usize() as u16 }],
        ..Default::default()
    });
}

/// Handle an AVM NULLIFIEREXISTS instruction
/// (a nullifierExists brillig foreign call was encountered)
/// Adds the new instruction to the avm instructions list.
fn handle_nullifier_exists(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    if destinations.len() != 1 || inputs.len() != 2 {
        panic!("Transpiler expects ForeignCall::CHECKNULLIFIEREXISTS to have 1 destinations and 2 inputs, got {} and {}", destinations.len(), inputs.len());
    }
    let nullifier_offset_operand = match &inputs[0] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!("Transpiler does not know how to handle ForeignCall::EMITNOTEHASH with HeapArray/Vector inputs"),
    };
    let address_offset_operand = match &inputs[1] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!("Transpiler does not know how to handle ForeignCall::EMITNOTEHASH with HeapArray/Vector inputs"),
    };
    let exists_offset_operand = match &destinations[0] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!("Transpiler does not know how to handle ForeignCall::EMITNOTEHASH with HeapArray/Vector inputs"),
    };
    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::NULLIFIEREXISTS,
        indirect: Some(
            AddressingModeBuilder::default()
                .direct_operand(nullifier_offset_operand)
                .direct_operand(address_offset_operand)
                .direct_operand(exists_offset_operand)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: nullifier_offset_operand.to_usize() as u16 },
            AvmOperand::U16 { value: address_offset_operand.to_usize() as u16 },
            AvmOperand::U16 { value: exists_offset_operand.to_usize() as u16 },
        ],
        ..Default::default()
    });
}

/// Handle an AVM L1TOL2MSGEXISTS instruction
/// (a l1ToL2MsgExists brillig foreign call was encountered)
/// Adds the new instruction to the avm instructions list.
fn handle_l1_to_l2_msg_exists(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    if destinations.len() != 1 || inputs.len() != 2 {
        panic!(
            "Transpiler expects ForeignCall::L1TOL2MSGEXISTS to have 1 destinations and 2 input, got {} and {}",
            destinations.len(),
            inputs.len()
        );
    }
    let msg_hash_offset_operand = match &inputs[0] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!(
            "Transpiler does not know how to handle ForeignCall::L1TOL2MSGEXISTS with HeapArray/Vector inputs",
        ),
    };
    let msg_leaf_index_offset_operand = match &inputs[1] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!(
            "Transpiler does not know how to handle ForeignCall::L1TOL2MSGEXISTS with HeapArray/Vector inputs",
        ),
    };
    let exists_offset_operand = match &destinations[0] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!(
            "Transpiler does not know how to handle ForeignCall::L1TOL2MSGEXISTS with HeapArray/Vector inputs",
        ),
    };
    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::L1TOL2MSGEXISTS,
        indirect: Some(
            AddressingModeBuilder::default()
                .direct_operand(msg_hash_offset_operand)
                .direct_operand(msg_leaf_index_offset_operand)
                .direct_operand(exists_offset_operand)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: msg_hash_offset_operand.to_usize() as u16 },
            AvmOperand::U16 { value: msg_leaf_index_offset_operand.to_usize() as u16 },
            AvmOperand::U16 { value: exists_offset_operand.to_usize() as u16 },
        ],
        ..Default::default()
    });
}

/// Handle an AVM SENDL2TOL1MSG
/// (a sendL2ToL1Msg brillig foreign call was encountered)
/// Adds the new instruction to the avm instructions list.
fn handle_send_l2_to_l1_msg(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    if !destinations.is_empty() || inputs.len() != 2 {
        panic!(
            "Transpiler expects ForeignCall::SENDL2TOL1MSG to have 0 destinations and 2 inputs, got {} and {}",
            destinations.len(),
            inputs.len()
        );
    }
    let recipient_offset_operand = match &inputs[0] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!(
            "Transpiler does not know how to handle ForeignCall::SENDL2TOL1MSG with HeapArray/Vector inputs",
        ),
    };
    let content_offset_operand = match &inputs[1] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!(
            "Transpiler does not know how to handle ForeignCall::SENDL2TOL1MSG with HeapArray/Vector inputs",
        ),
    };
    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::SENDL2TOL1MSG,
        indirect: Some(
            AddressingModeBuilder::default()
                .direct_operand(recipient_offset_operand)
                .direct_operand(content_offset_operand)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: recipient_offset_operand.to_usize() as u16 },
            AvmOperand::U16 { value: content_offset_operand.to_usize() as u16 },
        ],
        ..Default::default()
    });
}

/// Getter Instructions are instructions that take NO inputs, and return information
/// from the current execution context.
///
/// This includes:
/// - Global variables
/// - Caller
/// - storage address
/// - ...
fn handle_getter_instruction(
    avm_instrs: &mut Vec<AvmInstruction>,
    function: &str,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    #[allow(clippy::upper_case_acronyms)]
    enum EnvironmentVariable {
        ADDRESS,
        SENDER,
        TRANSACTIONFEE,
        CHAINID,
        VERSION,
        BLOCKNUMBER,
        TIMESTAMP,
        FEEPERL2GAS,
        FEEPERDAGAS,
        ISSTATICCALL,
        L2GASLEFT,
        DAGASLEFT,
    }

    // For the foreign calls we want to handle, we do not want inputs, as they are getters
    assert!(inputs.is_empty());
    assert!(destinations.len() == 1);

    let dest_offset_maybe = destinations[0];
    let dest_offset = match dest_offset_maybe {
        ValueOrArray::MemoryAddress(dest_offset) => dest_offset,
        _ => panic!("ForeignCall address destination should be a single value"),
    };

    let var_idx = match function {
        "avmOpcodeAddress" => EnvironmentVariable::ADDRESS,
        "avmOpcodeSender" => EnvironmentVariable::SENDER,
        "avmOpcodeFeePerL2Gas" => EnvironmentVariable::FEEPERL2GAS,
        "avmOpcodeFeePerDaGas" => EnvironmentVariable::FEEPERDAGAS,
        "avmOpcodeTransactionFee" => EnvironmentVariable::TRANSACTIONFEE,
        "avmOpcodeChainId" => EnvironmentVariable::CHAINID,
        "avmOpcodeVersion" => EnvironmentVariable::VERSION,
        "avmOpcodeBlockNumber" => EnvironmentVariable::BLOCKNUMBER,
        "avmOpcodeTimestamp" => EnvironmentVariable::TIMESTAMP,
        "avmOpcodeL2GasLeft" => EnvironmentVariable::L2GASLEFT,
        "avmOpcodeDaGasLeft" => EnvironmentVariable::DAGASLEFT,
        "avmOpcodeIsStaticCall" => EnvironmentVariable::ISSTATICCALL,
        _ => panic!("Transpiler doesn't know how to process getter {:?}", function),
    };

    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::GETENVVAR_16,
        indirect: Some(AddressingModeBuilder::default().direct_operand(&dest_offset).build()),
        operands: vec![AvmOperand::U16 { value: dest_offset.to_usize() as u16 }],
        immediates: vec![AvmOperand::U8 { value: var_idx as u8 }],
        ..Default::default()
    });
}

/// Handles Brillig's CONST opcode.
fn handle_const(
    avm_instrs: &mut Vec<AvmInstruction>,
    destination: &MemoryAddress,
    value: &FieldElement,
    bit_size: &BitSize,
    indirect: bool,
) {
    let tag = tag_from_bit_size(*bit_size);
    avm_instrs.push(generate_set_instruction(tag, destination, value, indirect));
}

/// Generates an AVM SET instruction.
fn generate_set_instruction(
    tag: AvmTypeTag,
    dest: &MemoryAddress,
    value: &FieldElement,
    indirect: bool,
) -> AvmInstruction {
    let bits_needed_val = bits_needed_for(value);
    let bits_needed_mem = if bits_needed_val >= 16 { 16 } else { bits_needed_for(dest) };
    assert!(bits_needed_mem <= 16);
    let bits_needed_opcode = bits_needed_val.max(bits_needed_mem);

    let set_opcode = match bits_needed_opcode {
        8 => AvmOpcode::SET_8,
        16 => AvmOpcode::SET_16,
        32 => AvmOpcode::SET_32,
        64 => AvmOpcode::SET_64,
        128 => AvmOpcode::SET_128,
        254 => AvmOpcode::SET_FF,
        _ => panic!("Invalid bits needed for opcode: {}", bits_needed_opcode),
    };

    AvmInstruction {
        opcode: set_opcode,
        indirect: if indirect {
            Some(AddressingModeBuilder::default().indirect_operand(dest).build())
        } else {
            Some(AddressingModeBuilder::default().direct_operand(dest).build())
        },
        tag: Some(tag),
        operands: vec![make_operand(bits_needed_mem, &(dest.to_usize()))],
        immediates: vec![make_operand(bits_needed_opcode, value)],
    }
}

/// Generates an AVM CAST instruction.
fn generate_cast_instruction(
    source: &MemoryAddress,
    source_indirect: bool,
    destination: &MemoryAddress,
    destination_indirect: bool,
    dst_tag: AvmTypeTag,
) -> AvmInstruction {
    let bits_needed = bits_needed_for(source).max(bits_needed_for(destination));
    let avm_opcode = match bits_needed {
        8 => AvmOpcode::CAST_8,
        16 => AvmOpcode::CAST_16,
        _ => panic!("CAST only supports 8 and 16 bit encodings, needed {}", bits_needed),
    };
    let mut indirect_flags = AddressingModeBuilder::default();
    indirect_flags = if source_indirect {
        indirect_flags.indirect_operand(source)
    } else {
        indirect_flags.direct_operand(source)
    };

    indirect_flags = if destination_indirect {
        indirect_flags.indirect_operand(destination)
    } else {
        indirect_flags.direct_operand(destination)
    };

    AvmInstruction {
        opcode: avm_opcode,
        indirect: Some(indirect_flags.build()),
        tag: Some(dst_tag),
        operands: vec![
            make_operand(bits_needed, &(source.to_usize())),
            make_operand(bits_needed, &(destination.to_usize())),
        ],
        ..Default::default()
    }
}

/// Generates an AVM REVERT instruction.
fn generate_revert_instruction(
    avm_instrs: &mut Vec<AvmInstruction>,
    revert_data_pointer: &MemoryAddress,
    revert_data_size_offset: &MemoryAddress,
) {
    let bits_needed =
        *[revert_data_pointer, revert_data_size_offset].map(bits_needed_for).iter().max().unwrap();
    let avm_opcode = match bits_needed {
        8 => AvmOpcode::REVERT_8,
        16 => AvmOpcode::REVERT_16,
        _ => panic!("REVERT only support 8 or 16 bit encodings, got: {}", bits_needed),
    };
    avm_instrs.push(AvmInstruction {
        opcode: avm_opcode,
        indirect: Some(
            AddressingModeBuilder::default()
                .indirect_operand(revert_data_pointer)
                .direct_operand(revert_data_size_offset)
                .build(),
        ),
        operands: vec![
            make_operand(bits_needed, &revert_data_pointer.to_usize()),
            make_operand(bits_needed, &revert_data_size_offset.to_usize()),
        ],
        ..Default::default()
    });
}

/// Generates an AVM RETURN instruction.
fn generate_return_instruction(
    avm_instrs: &mut Vec<AvmInstruction>,
    return_data_pointer: &MemoryAddress,
    return_data_size_offset: &MemoryAddress,
) {
    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::RETURN,
        indirect: Some(
            AddressingModeBuilder::default()
                .indirect_operand(return_data_pointer)
                .direct_operand(return_data_size_offset)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: return_data_pointer.to_usize() as u16 },
            AvmOperand::U16 { value: return_data_size_offset.to_usize() as u16 },
        ],
        ..Default::default()
    });
}

/// Generates an AVM MOV instruction.
fn generate_mov_instruction(
    indirect: Option<AvmOperand>,
    source: u32,
    dest: u32,
) -> AvmInstruction {
    let bits_needed = [source, dest].iter().map(bits_needed_for).max().unwrap();

    let mov_opcode = match bits_needed {
        8 => AvmOpcode::MOV_8,
        16 => AvmOpcode::MOV_16,
        _ => panic!("MOV operands must fit in 16 bits but needed {}", bits_needed),
    };

    AvmInstruction {
        opcode: mov_opcode,
        indirect,
        operands: vec![make_operand(bits_needed, &source), make_operand(bits_needed, &dest)],
        ..Default::default()
    }
}

/// Black box functions
/// (array goes in -> field element comes out)
fn handle_black_box_function(avm_instrs: &mut Vec<AvmInstruction>, operation: &BlackBoxOp) {
    match operation {
        BlackBoxOp::Sha256Compression { input, hash_values, output } => {
            let inputs_offset = input.pointer.to_usize();
            let state_offset = hash_values.pointer.to_usize();
            let output_offset = output.pointer.to_usize();

            avm_instrs.push(AvmInstruction {
                opcode: AvmOpcode::SHA256COMPRESSION,
                indirect: Some(
                    AddressingModeBuilder::default()
                        .indirect_operand(&output.pointer)
                        .indirect_operand(&hash_values.pointer)
                        .indirect_operand(&input.pointer)
                        .build(),
                ),
                operands: vec![
                    AvmOperand::U16 { value: output_offset as u16 },
                    AvmOperand::U16 { value: state_offset as u16 },
                    AvmOperand::U16 { value: inputs_offset as u16 },
                ],
                ..Default::default()
            });
        }
        BlackBoxOp::Poseidon2Permutation {
            message,
            output,
            len: _, // we don't use this.
        } => {
            // We'd love to validate the input size, but it's not known at compile time.
            assert_eq!(output.size, 4, "Poseidon2Permutation output size must be 4!");
            let input_state_offset = message.pointer.to_usize();
            let output_state_offset = output.pointer.to_usize();

            avm_instrs.push(AvmInstruction {
                opcode: AvmOpcode::POSEIDON2,
                indirect: Some(
                    AddressingModeBuilder::default()
                        .indirect_operand(&message.pointer)
                        .indirect_operand(&output.pointer)
                        .build(),
                ),
                operands: vec![
                    AvmOperand::U16 { value: input_state_offset as u16 },
                    AvmOperand::U16 { value: output_state_offset as u16 },
                ],
                ..Default::default()
            });
        }
        BlackBoxOp::Keccakf1600 { input, output } => {
            let input_offset = input.pointer.to_usize();
            assert_eq!(input.size, 25, "Keccakf1600 input size must be 25!");
            let dest_offset = output.pointer.to_usize();
            assert_eq!(output.size, 25, "Keccakf1600 output size must be 25!");

            avm_instrs.push(AvmInstruction {
                opcode: AvmOpcode::KECCAKF1600,
                indirect: Some(
                    AddressingModeBuilder::default()
                        .indirect_operand(&output.pointer)
                        .indirect_operand(&input.pointer)
                        .build(),
                ),
                operands: vec![
                    AvmOperand::U16 { value: dest_offset as u16 },
                    AvmOperand::U16 { value: input_offset as u16 },
                ],
                ..Default::default()
            });
        }
        BlackBoxOp::ToRadix { input, radix, output_pointer, num_limbs, output_bits } => {
            let input_offset = input.to_usize() as u32;
            let radix_offset = radix.to_usize() as u32;
            let output_offset = output_pointer.to_usize() as u32;
            let num_limbs_offset = num_limbs.to_usize() as u32;
            let output_bits_offset = output_bits.to_usize() as u32;

            avm_instrs.push(AvmInstruction {
                opcode: AvmOpcode::TORADIXBE,
                indirect: Some(
                    AddressingModeBuilder::default()
                        .direct_operand(input)
                        .direct_operand(radix)
                        .direct_operand(num_limbs)
                        .direct_operand(output_bits)
                        .indirect_operand(output_pointer)
                        .build(),
                ),
                operands: vec![
                    AvmOperand::U16 { value: input_offset as u16 },
                    AvmOperand::U16 { value: radix_offset as u16 },
                    AvmOperand::U16 { value: num_limbs_offset as u16 },
                    AvmOperand::U16 { value: output_bits_offset as u16 },
                    AvmOperand::U16 { value: output_offset as u16 },
                ],
                ..Default::default()
            });
        }
        // This will be changed to utilise relative memory offsets
        BlackBoxOp::EmbeddedCurveAdd {
            input1_x: p1_x_offset,
            input1_y: p1_y_offset,
            input1_infinite: p1_infinite_offset,
            input2_x: p2_x_offset,
            input2_y: p2_y_offset,
            input2_infinite: p2_infinite_offset,
            result,
        } => avm_instrs.push(AvmInstruction {
            opcode: AvmOpcode::ECADD,
            // The result (SIXTH operand) is indirect.
            indirect: Some(
                AddressingModeBuilder::default()
                    .direct_operand(p1_x_offset)
                    .direct_operand(p1_y_offset)
                    .direct_operand(p1_infinite_offset)
                    .direct_operand(p2_x_offset)
                    .direct_operand(p2_y_offset)
                    .direct_operand(p2_infinite_offset)
                    .indirect_operand(&result.pointer)
                    .build(),
            ),
            operands: vec![
                AvmOperand::U16 { value: p1_x_offset.to_usize() as u16 },
                AvmOperand::U16 { value: p1_y_offset.to_usize() as u16 },
                AvmOperand::U16 { value: p1_infinite_offset.to_usize() as u16 },
                AvmOperand::U16 { value: p2_x_offset.to_usize() as u16 },
                AvmOperand::U16 { value: p2_y_offset.to_usize() as u16 },
                AvmOperand::U16 { value: p2_infinite_offset.to_usize() as u16 },
                AvmOperand::U16 { value: result.pointer.to_usize() as u16 },
            ],
            ..Default::default()
        }),
        // Temporary while we dont have efficient noir implementations
        BlackBoxOp::MultiScalarMul { points, scalars, outputs } => {
            // The length of the scalars vector is 2x the length of the points vector due to limb
            // decomposition
            let points_offset = points.pointer.to_usize();
            let num_points = points.size.to_usize();
            let scalars_offset = scalars.pointer.to_usize();
            // Output array is fixed to 3
            assert_eq!(outputs.size, 3, "Output array size must be equal to 3");
            let outputs_offset = outputs.pointer.to_usize();
            avm_instrs.push(AvmInstruction {
                opcode: AvmOpcode::MSM,
                indirect: Some(
                    AddressingModeBuilder::default()
                        .indirect_operand(&points.pointer)
                        .indirect_operand(&scalars.pointer)
                        .indirect_operand(&outputs.pointer)
                        .direct_operand(&points.size)
                        .build(),
                ),
                operands: vec![
                    AvmOperand::U16 { value: points_offset as u16 },
                    AvmOperand::U16 { value: scalars_offset as u16 },
                    AvmOperand::U16 { value: outputs_offset as u16 },
                    AvmOperand::U16 { value: num_points as u16 },
                ],
                ..Default::default()
            });
        }
        _ => panic!("Transpiler doesn't know how to process {:?}", operation),
    }
}

fn handle_debug_log(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    if !destinations.is_empty() || inputs.len() != 3 {
        panic!(
            "Transpiler expects ForeignCall::DEBUGLOG to have 0 destinations and 3 inputs, got {} and {}",
            destinations.len(),
            inputs.len()
        );
    }
    let (message_offset, message_size) = match &inputs[0] {
        ValueOrArray::HeapArray(HeapArray { pointer, size }) => (pointer, *size as u32),
        _ => panic!("Message for ForeignCall::DEBUGLOG should be a HeapArray."),
    };
    // The fields are a slice, and this is represented as a (length: Field, slice: HeapVector).
    // The length field is redundant and we skipt it.
    let (fields_offset_ptr, fields_size_ptr) = match &inputs[2] {
        ValueOrArray::HeapVector(HeapVector { pointer, size }) => (pointer, size),
        _ => panic!("List of fields for ForeignCall::DEBUGLOG should be a HeapVector (slice)."),
    };
    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::DEBUGLOG,
        // (left to right)
        //  * message_offset INDIRECT
        //  * (N/A) message_size is an immediate
        //  * fields_offset_ptr INDIRECT
        //  * fields_size_ptr direct
        indirect: Some(
            AddressingModeBuilder::default()
                .indirect_operand(message_offset)
                .indirect_operand(fields_offset_ptr)
                .direct_operand(fields_size_ptr)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: message_offset.to_usize() as u16 },
            AvmOperand::U16 { value: fields_offset_ptr.to_usize() as u16 },
            AvmOperand::U16 { value: fields_size_ptr.to_usize() as u16 },
        ],
        immediates: vec![AvmOperand::U16 { value: message_size as u16 }],
        ..Default::default()
    });
}

// #[oracle(avmOpcodeCalldataCopy)]
// unconstrained fn calldata_copy_opcode<let N: u32>(cdoffset: Field) -> [Field; N] {}
fn handle_calldata_copy(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    assert!(inputs.len() == 2);
    assert!(destinations.len() == 1);

    let cd_offset = match inputs[0] {
        ValueOrArray::MemoryAddress(address) => address,
        _ => panic!("CalldataCopy offset should be a memory address"),
    };

    let copy_size_offset = match inputs[1] {
        ValueOrArray::MemoryAddress(address) => address,
        _ => panic!("CalldataCopy size should be a memory address"),
    };

    let (dest_offset, ..) = match destinations[0] {
        ValueOrArray::HeapArray(HeapArray { pointer, size }) => (pointer, size),
        _ => panic!("CalldataCopy destination should be an array"),
    };

    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::CALLDATACOPY,
        indirect: Some(
            AddressingModeBuilder::default()
                .direct_operand(&cd_offset)
                .direct_operand(&copy_size_offset)
                .indirect_operand(&dest_offset)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: cd_offset.to_usize() as u16 },
            AvmOperand::U16 { value: copy_size_offset.to_usize() as u16 },
            AvmOperand::U16 { value: dest_offset.to_usize() as u16 },
        ],
        ..Default::default()
    });
}

// #[oracle(avmOpcodeReturndataSize)]
// unconstrained fn returndata_size_opcode() -> u32 {}
fn handle_returndata_size(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    assert!(inputs.is_empty());
    assert!(destinations.len() == 1);

    let dest_offset = match destinations[0] {
        ValueOrArray::MemoryAddress(address) => address,
        _ => panic!("ReturndataSize destination should be a memory location"),
    };

    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::RETURNDATASIZE,
        indirect: Some(AddressingModeBuilder::default().direct_operand(&dest_offset).build()),
        operands: vec![AvmOperand::U16 { value: dest_offset.to_usize() as u16 }],
        ..Default::default()
    });
}

// #[oracle(avmOpcodeReturndataCopy)]
// unconstrained fn returndata_copy_opcode(rdoffset: u32, copy_size: u32) -> [Field] {}
fn handle_returndata_copy(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    assert!(inputs.len() == 2);
    assert!(destinations.len() == 2);

    let cd_offset = match inputs[0] {
        ValueOrArray::MemoryAddress(address) => address,
        _ => panic!("ReturndataCopy offset should be a memory address"),
    };

    let copy_size_offset = match inputs[1] {
        ValueOrArray::MemoryAddress(address) => address,
        _ => panic!("ReturndataCopy size should be a memory address"),
    };

    // We skip the first destination, which is the size of the slice.
    let (dest_offset, write_size_here_offset) = match destinations[1] {
        ValueOrArray::HeapVector(HeapVector { pointer, size }) => (pointer, size),
        _ => panic!("ReturndataCopy destination should be a vector (slice)"),
    };

    avm_instrs.extend([
        // First we write the return data.
        AvmInstruction {
            opcode: AvmOpcode::RETURNDATACOPY,
            indirect: Some(
                AddressingModeBuilder::default()
                    .direct_operand(&cd_offset)
                    .direct_operand(&copy_size_offset)
                    .indirect_operand(&dest_offset)
                    .build(),
            ),
            operands: vec![
                AvmOperand::U16 { value: cd_offset.to_usize() as u16 },
                AvmOperand::U16 { value: copy_size_offset.to_usize() as u16 },
                AvmOperand::U16 { value: dest_offset.to_usize() as u16 },
            ],
            ..Default::default()
        },
        // Then we set the size of the slice, using the input size.
        generate_mov_instruction(
            Some(
                AddressingModeBuilder::default()
                    .direct_operand(&copy_size_offset)
                    .direct_operand(&write_size_here_offset)
                    .build(),
            ),
            copy_size_offset.to_usize() as u32,
            write_size_here_offset.to_usize() as u32,
        ),
    ]);
}

// #[oracle(avmOpcodeReturn)]
// unconstrained fn return_opcode<let N: u32>(returndata: [Field; N]) {}
fn handle_return(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    assert!(inputs.len() == 2);
    assert!(destinations.is_empty());

    // First arg is the size, which is ignored because it's redundant.
    let (return_data_offset, return_data_size) = match inputs[1] {
        ValueOrArray::HeapVector(HeapVector { pointer, size }) => (pointer, size),
        _ => panic!("Revert instruction's args input should be a HeapVector"),
    };

    generate_return_instruction(avm_instrs, &return_data_offset, &return_data_size);
}

// #[oracle(avmOpcodeRevert)]
// unconstrained fn revert_opcode(revertdata: [Field]) {}
fn handle_revert(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    assert!(inputs.len() == 2);
    assert!(destinations.is_empty());

    // First arg is the size, which is ignored because it's redundant.
    let (revert_data_offset, revert_data_size_offset) = match inputs[1] {
        ValueOrArray::HeapVector(HeapVector { pointer, size }) => (pointer, size),
        _ => panic!("Revert instruction's args input should be a HeapVector"),
    };

    generate_revert_instruction(avm_instrs, &revert_data_offset, &revert_data_size_offset);
}

/// Emit a storage write opcode
/// The current implementation writes an array of values into storage ( contiguous slots in memory )
fn handle_storage_write(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    assert!(inputs.len() == 2);
    assert!(destinations.is_empty());

    let slot_offset_maybe = inputs[0];
    let slot_offset = match slot_offset_maybe {
        ValueOrArray::MemoryAddress(slot_offset) => slot_offset,
        _ => panic!("ForeignCall address destination should be a single value"),
    };

    let src_offset_maybe = inputs[1];
    let src_offset = match src_offset_maybe {
        ValueOrArray::MemoryAddress(src_offset) => src_offset,
        _ => panic!("ForeignCall address source should be a single value"),
    };

    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::SSTORE,
        indirect: Some(
            AddressingModeBuilder::default()
                .direct_operand(&src_offset)
                .direct_operand(&slot_offset)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: src_offset.to_usize() as u16 },
            AvmOperand::U16 { value: slot_offset.to_usize() as u16 },
        ],
        ..Default::default()
    });
}

/// Emit a GETCONTRACTINSTANCE opcode
fn handle_get_contract_instance(
    avm_instrs: &mut Vec<AvmInstruction>,
    function: &str,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    #[allow(non_camel_case_types, clippy::upper_case_acronyms)]
    enum ContractInstanceMember {
        DEPLOYER,
        CLASS_ID,
        INIT_HASH,
    }

    assert!(inputs.len() == 1);
    assert!(destinations.len() == 2);

    let member_idx = match function {
        "avmOpcodeGetContractInstanceDeployer" => ContractInstanceMember::DEPLOYER,
        "avmOpcodeGetContractInstanceClassId" => ContractInstanceMember::CLASS_ID,
        "avmOpcodeGetContractInstanceInitializationHash" => ContractInstanceMember::INIT_HASH,
        _ => panic!("Transpiler doesn't know how to process function {:?}", function),
    };

    let address_offset_maybe = inputs[0];
    let address_offset = match address_offset_maybe {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!("GETCONTRACTINSTANCE address should be a single value"),
    };

    let dest_offset_maybe = destinations[0];
    let dest_offset = match dest_offset_maybe {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!("GETCONTRACTINSTANCE dst destination should be a single value"),
    };

    let exists_offset_maybe = destinations[1];
    let exists_offset = match exists_offset_maybe {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!("GETCONTRACTINSTANCE exists destination should be a single value"),
    };

    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::GETCONTRACTINSTANCE,
        indirect: Some(
            AddressingModeBuilder::default()
                .direct_operand(&address_offset)
                .direct_operand(&dest_offset)
                .direct_operand(&exists_offset)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: address_offset.to_usize() as u16 },
            AvmOperand::U16 { value: dest_offset.to_usize() as u16 },
            AvmOperand::U16 { value: exists_offset.to_usize() as u16 },
        ],
        immediates: vec![AvmOperand::U8 { value: member_idx as u8 }],
        ..Default::default()
    });
}

/// Emit a storage read opcode
/// The current implementation reads an array of values from storage ( contiguous slots in memory )
fn handle_storage_read(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) {
    assert!(inputs.len() == 1); // output
    assert!(destinations.len() == 1); // return value

    let slot_offset_maybe = inputs[0];
    let slot_offset = match slot_offset_maybe {
        ValueOrArray::MemoryAddress(slot_offset) => slot_offset,
        _ => panic!("ForeignCall address input should be a single value"),
    };

    let dest_offset_maybe = destinations[0];
    let dest_offset = match dest_offset_maybe {
        ValueOrArray::MemoryAddress(dest_offset) => dest_offset,
        _ => panic!("ForeignCall address destination should be a single value"),
    };

    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::SLOAD,
        indirect: Some(
            AddressingModeBuilder::default()
                .direct_operand(&slot_offset)
                .direct_operand(&dest_offset)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: slot_offset.to_usize() as u16 },
            AvmOperand::U16 { value: dest_offset.to_usize() as u16 },
        ],
        ..Default::default()
    });
}

/// Patch a Noir function's debug info with updated PCs since transpilation injects extra
/// instructions in some cases.
pub fn patch_debug_info_pcs(
    mut debug_infos: Vec<DebugInfo>,
    brillig_pcs_to_avm_pcs: &[usize],
) -> Vec<DebugInfo> {
    for patched_debug_info in debug_infos.iter_mut() {
        let mut patched_brillig_locations = BTreeMap::new();
        for (brillig_function_id, opcode_locations_map) in
            patched_debug_info.brillig_locations.iter()
        {
            // create a new map with all of its keys (OpcodeLocations) patched
            let mut patched_locations = BTreeMap::new();
            for (original_opcode_location, source_locations) in opcode_locations_map.iter() {
                let avm_opcode_location =
                    BrilligOpcodeLocation(brillig_pcs_to_avm_pcs[original_opcode_location.0]);
                patched_locations.insert(avm_opcode_location, source_locations.clone());
            }
            // insert the new map as a brillig locations map for the current function id
            patched_brillig_locations.insert(*brillig_function_id, patched_locations);
        }

        // patch the `DebugInfo` entry
        patched_debug_info.brillig_locations = patched_brillig_locations;
    }
    debug_infos
}

fn tag_from_bit_size(bit_size: BitSize) -> AvmTypeTag {
    match bit_size {
        BitSize::Integer(IntegerBitSize::U1) => AvmTypeTag::UINT1,
        BitSize::Integer(IntegerBitSize::U8) => AvmTypeTag::UINT8,
        BitSize::Integer(IntegerBitSize::U16) => AvmTypeTag::UINT16,
        BitSize::Integer(IntegerBitSize::U32) => AvmTypeTag::UINT32,
        BitSize::Integer(IntegerBitSize::U64) => AvmTypeTag::UINT64,
        BitSize::Integer(IntegerBitSize::U128) => AvmTypeTag::UINT128,
        BitSize::Field => AvmTypeTag::FIELD,
    }
}
