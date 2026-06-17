use acvm::acir::brillig::lengths::SemiFlattenedLength;
use acvm::acir::brillig::{BitSize, IntegerBitSize, Opcode as BrilligOpcode};
use fxhash::{FxHashMap as HashMap, FxHashSet as HashSet};
use std::collections::BTreeMap;

use acvm::FieldElement;
use acvm::acir::circuit::BrilligOpcodeLocation;
use acvm::brillig_vm::brillig::{
    BinaryFieldOp, BinaryIntOp, BlackBoxOp, HeapArray, HeapVector, MemoryAddress, ValueOrArray,
};
use noirc_artifacts::debug::DebugInfo;

use crate::bit_traits::{BitsQueryable, bits_needed_for};
use crate::instructions::{AddressingModeBuilder, AvmInstruction, AvmOperand, AvmTypeTag};
use crate::opcodes::AvmOpcode;
use crate::procedures::{
    Label as ProcedureLocalLabel, Procedure, SCRATCH_SPACE_START, compile_procedure,
};
use crate::utils::{
    UNRESOLVED_PC, UnresolvedPCLocation, dbg_print_avm_program, dbg_print_brillig_program,
    make_operand, make_unresolved_pc,
};

/// Errors returned by the scoped Brillig-to-AVM checked-narrowing path.
///
/// This intentionally models only #24115-relevant failures: fixed-width U16
/// operands that cannot faithfully encode a Brillig memory address or immediate.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TranspileError {
    U16MemoryAddressOutOfRange { address: u32 },
    U16ImmediateOutOfRange { name: &'static str, value: u32 },
    FunctionTranspilationFailed { contract: String, function: String, source: Box<TranspileError> },
}

impl std::fmt::Display for TranspileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::U16MemoryAddressOutOfRange { address } => {
                write!(f, "AVM memory address {address} does not fit in a U16 operand")
            }
            Self::U16ImmediateOutOfRange { name, value } => {
                write!(f, "{name} value {value} does not fit in a U16 immediate")
            }
            Self::FunctionTranspilationFailed { contract, function, source } => {
                write!(f, "Failed to transpile {contract}::{function}: {source}")
            }
        }
    }
}

impl std::error::Error for TranspileError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::FunctionTranspilationFailed { source, .. } => Some(source.as_ref()),
            _ => None,
        }
    }
}

enum Label {
    BrilligPC { pc: u32 },
    Procedure { label: ProcedureLabel },
}

fn u16_memory_address(address: &MemoryAddress) -> Result<u16, TranspileError> {
    let address = address.to_u32();
    u16::try_from(address).map_err(|_| TranspileError::U16MemoryAddressOutOfRange { address })
}

fn u16_address_operands<const N: usize>(
    addresses: [&MemoryAddress; N],
) -> Result<([u16; N], usize), TranspileError> {
    let mut operands = [0u16; N];
    let mut bits_needed = 8;
    for (operand, address) in operands.iter_mut().zip(addresses) {
        let checked = u16_memory_address(address)?;
        bits_needed = bits_needed.max(bits_needed_for(&checked));
        *operand = checked;
    }
    Ok((operands, bits_needed))
}

fn u16_immediate(name: &'static str, value: u32) -> Result<u16, TranspileError> {
    u16::try_from(value).map_err(|_| TranspileError::U16ImmediateOutOfRange { name, value })
}

impl ProcedureLocalLabel {
    fn prefix(self, procedure: Procedure) -> ProcedureLabel {
        ProcedureLabel::new(self, procedure)
    }
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct ProcedureLabel {
    local_label: Option<ProcedureLocalLabel>,
    procedure: Procedure,
}

impl ProcedureLabel {
    fn new(local_label: ProcedureLocalLabel, procedure: Procedure) -> Self {
        Self { local_label: Some(local_label), procedure }
    }

    fn entrypoint(procedure: Procedure) -> Self {
        Self { local_label: None, procedure }
    }
}

/// Transpile a Brillig program to AVM bytecode
/// Returns the bytecode and a mapping from Brillig program counter to AVM program counter.
/// Fallible Brillig lowering for checked U16 narrowing failures.
///
/// This is not a full malformed-Brillig validation API; legacy checks unrelated
/// to #24115 may still panic and should be hardened separately.
pub fn try_brillig_to_avm(
    brillig_bytecode: &[BrilligOpcode<FieldElement>],
) -> Result<(Vec<u8>, Vec<usize>), TranspileError> {
    dbg_print_brillig_program(brillig_bytecode);

    let mut avm_instrs: Vec<AvmInstruction> = Vec::new();
    let mut brillig_pcs_to_avm_pcs: Vec<usize> = [0_usize].to_vec();
    let mut current_avm_pc: usize = 0;

    let mut procedures_used: HashSet<Procedure> = HashSet::default();
    // Maps INSTRUCTION INDEXES to labels, not avm pcs to labels
    let mut unresolved_jumps: HashMap<UnresolvedPCLocation, Label> = HashMap::default();

    // Transpile a Brillig instruction to one or more AVM instructions
    for brillig_instr in brillig_bytecode {
        let current_avm_instr_index = avm_instrs.len();

        match brillig_instr {
            BrilligOpcode::BinaryFieldOp { destination, op, lhs, rhs } => {
                let ([lhs_operand, rhs_operand, destination_operand], bits_needed) =
                    u16_address_operands([lhs, rhs, destination])?;

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
                    addressing_mode: Some(
                        AddressingModeBuilder::default()
                            .direct_operand(lhs)
                            .direct_operand(rhs)
                            .direct_operand(destination)
                            .build(),
                    ),
                    operands: vec![
                        make_operand(bits_needed, &u32::from(lhs_operand)),
                        make_operand(bits_needed, &u32::from(rhs_operand)),
                        make_operand(bits_needed, &u32::from(destination_operand)),
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::BinaryIntOp { destination, op, lhs, rhs, .. } => {
                let ([lhs_operand, rhs_operand, destination_operand], bits_needed) =
                    u16_address_operands([lhs, rhs, destination])?;

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
                    addressing_mode: Some(
                        AddressingModeBuilder::default()
                            .direct_operand(lhs)
                            .direct_operand(rhs)
                            .direct_operand(destination)
                            .build(),
                    ),
                    operands: vec![
                        make_operand(bits_needed, &u32::from(lhs_operand)),
                        make_operand(bits_needed, &u32::from(rhs_operand)),
                        make_operand(bits_needed, &u32::from(destination_operand)),
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::Not { destination, source, .. } => {
                let ([source_operand, destination_operand], bits_needed) =
                    u16_address_operands([source, destination])?;

                avm_instrs.push(AvmInstruction {
                    opcode: if bits_needed == 8 { AvmOpcode::NOT_8 } else { AvmOpcode::NOT_16 },
                    addressing_mode: Some(
                        AddressingModeBuilder::default()
                            .direct_operand(source)
                            .direct_operand(destination)
                            .build(),
                    ),
                    operands: vec![
                        make_operand(bits_needed, &u32::from(source_operand)),
                        make_operand(bits_needed, &u32::from(destination_operand)),
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::CalldataCopy { destination_address, size_address, offset_address } => {
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::CALLDATACOPY,
                    addressing_mode: Some(
                        AddressingModeBuilder::default()
                            .direct_operand(size_address)
                            .direct_operand(offset_address)
                            .direct_operand(destination_address)
                            .build(),
                    ),
                    operands: vec![
                        AvmOperand::U16 { value: u16_memory_address(size_address)? }, // sizeOffset
                        AvmOperand::U16 {
                            value: u16_memory_address(offset_address)?, // cdOffset (calldata offset)
                        },
                        AvmOperand::U16 {
                            value: u16_memory_address(destination_address)?, // dstOffset
                        },
                    ],
                    ..Default::default()
                });
            }
            BrilligOpcode::Jump { location } => {
                assert!(location.num_bits() <= 32);
                unresolved_jumps.insert(
                    UnresolvedPCLocation {
                        instruction_index: avm_instrs.len(),
                        immediate_index: 0,
                    },
                    Label::BrilligPC { pc: *location as u32 },
                );
                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::JUMP_32,
                    immediates: vec![make_unresolved_pc()],
                    ..Default::default()
                });
            }
            BrilligOpcode::JumpIf { condition, location } => {
                assert!(location.num_bits() <= 32);
                unresolved_jumps.insert(
                    UnresolvedPCLocation {
                        instruction_index: avm_instrs.len(),
                        immediate_index: 0,
                    },
                    Label::BrilligPC { pc: *location as u32 },
                );

                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::JUMPI_32,
                    addressing_mode: Some(
                        AddressingModeBuilder::default().direct_operand(condition).build(),
                    ),
                    operands: vec![AvmOperand::U16 { value: u16_memory_address(condition)? }],
                    immediates: vec![make_unresolved_pc()],
                    ..Default::default()
                });
            }
            BrilligOpcode::Const { destination, value, bit_size } => {
                handle_const(&mut avm_instrs, destination, value, bit_size, false)?;
            }
            BrilligOpcode::IndirectConst { destination_pointer, value, bit_size } => {
                handle_const(&mut avm_instrs, destination_pointer, value, bit_size, true)?;
            }
            BrilligOpcode::Mov { destination, source } => {
                avm_instrs.push(generate_mov_instruction(
                    Some(
                        AddressingModeBuilder::default()
                            .direct_operand(source)
                            .direct_operand(destination)
                            .build(),
                    ),
                    source,
                    destination,
                )?);
            }
            BrilligOpcode::ConditionalMov { destination, source_a, source_b, condition } => {
                // Move source_a to destination, if condition is true jump to the next brillig opcode, else move source_b to destination
                avm_instrs.push(generate_mov_instruction(
                    Some(
                        AddressingModeBuilder::default()
                            .direct_operand(source_a)
                            .direct_operand(destination)
                            .build(),
                    ),
                    source_a,
                    destination,
                )?);

                unresolved_jumps.insert(
                    UnresolvedPCLocation {
                        instruction_index: avm_instrs.len(),
                        immediate_index: 0,
                    },
                    Label::BrilligPC { pc: brillig_pcs_to_avm_pcs.len() as u32 }, // We want to jump to the next brillig opcode
                );

                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::JUMPI_32,
                    addressing_mode: Some(
                        AddressingModeBuilder::default().direct_operand(condition).build(),
                    ),
                    operands: vec![AvmOperand::U16 { value: u16_memory_address(condition)? }],
                    immediates: vec![make_unresolved_pc()],
                    ..Default::default()
                });

                avm_instrs.push(generate_mov_instruction(
                    Some(
                        AddressingModeBuilder::default()
                            .direct_operand(source_b)
                            .direct_operand(destination)
                            .build(),
                    ),
                    source_b,
                    destination,
                )?);
            }
            BrilligOpcode::Load { destination, source_pointer } => {
                avm_instrs.push(generate_mov_instruction(
                    Some(
                        AddressingModeBuilder::default()
                            .indirect_operand(source_pointer)
                            .direct_operand(destination)
                            .build(),
                    ),
                    source_pointer,
                    destination,
                )?);
            }
            BrilligOpcode::Store { destination_pointer, source } => {
                avm_instrs.push(generate_mov_instruction(
                    Some(
                        AddressingModeBuilder::default()
                            .direct_operand(source)
                            .indirect_operand(destination_pointer)
                            .build(),
                    ),
                    source,
                    destination_pointer,
                )?);
            }
            BrilligOpcode::Call { location } => {
                assert!(location.num_bits() <= 32);
                unresolved_jumps.insert(
                    UnresolvedPCLocation {
                        instruction_index: avm_instrs.len(),
                        immediate_index: 0,
                    },
                    Label::BrilligPC { pc: *location as u32 },
                );

                avm_instrs.push(AvmInstruction {
                    opcode: AvmOpcode::INTERNALCALL,
                    immediates: vec![make_unresolved_pc()],
                    ..Default::default()
                });
            }
            BrilligOpcode::Return => avm_instrs
                .push(AvmInstruction { opcode: AvmOpcode::INTERNALRETURN, ..Default::default() }),
            BrilligOpcode::Stop { return_data } => {
                generate_return_instruction(
                    &mut avm_instrs,
                    &return_data.pointer,
                    &return_data.size,
                )?;
            }
            BrilligOpcode::Trap { revert_data } => {
                generate_revert_instruction(
                    &mut avm_instrs,
                    &revert_data.pointer,
                    &revert_data.size,
                )?;
            }
            BrilligOpcode::Cast { destination, source, bit_size } => {
                handle_cast(&mut avm_instrs, source, destination, *bit_size)?;
            }
            BrilligOpcode::ForeignCall {
                function,
                destinations,
                inputs,
                destination_value_types: _,
                input_value_types: _,
            } => {
                handle_foreign_call(&mut avm_instrs, function, destinations, inputs)?;
            }
            BrilligOpcode::BlackBox(operation) => {
                handle_black_box_function(
                    &mut avm_instrs,
                    operation,
                    &mut procedures_used,
                    &mut unresolved_jumps,
                )?;
            }
        }

        // Increment the AVM program counter.
        current_avm_pc +=
            avm_instrs.iter().skip(current_avm_instr_index).map(|i| i.size()).sum::<usize>();
        brillig_pcs_to_avm_pcs.push(current_avm_pc);
    }

    // Now we compile and append to the bytecode all procedures that we identified as used during compilation
    // We are going to accumulate their locations, and add their unresolved jumps to the unresolved jumps map.
    // We also prefix the labels with the procedure name to avoid collisions between labels.
    let mut procedure_locations = HashMap::default();
    for procedure in procedures_used.into_iter() {
        let compiled_procedure = compile_procedure(procedure).unwrap_or_else(|err| {
            panic!("Failed to compile procedure {:?} with error: {:?}", procedure, err)
        });
        // Insert the entry point label so the transpiled program can jump to the first opcode
        procedure_locations.insert(ProcedureLabel::entrypoint(procedure), current_avm_pc);

        procedure_locations.extend(compiled_procedure.locations.into_iter().map(
            |(label, local_location)| {
                let global_location = local_location + current_avm_pc;
                assert!(global_location.num_bits() <= 32, "Oops! AVM PC is too large!");

                (label.prefix(procedure), global_location)
            },
        ));
        unresolved_jumps.extend(compiled_procedure.unresolved_jumps.into_iter().map(
            |(mut unresolved_pc_location, target)| {
                unresolved_pc_location.instruction_index += avm_instrs.len();
                (unresolved_pc_location, Label::Procedure { label: target.prefix(procedure) })
            },
        ));
        current_avm_pc += compiled_procedure.instructions_size;
        avm_instrs.extend(compiled_procedure.instructions);
    }

    // Now that we have the general structure of the AVM program, we need to resolve the
    // now unresolved jump locations.
    // We can have two types of unresolved jumps. Either unresolved jumps that come from brillig bytecode, where the target is a brillig pc
    // or unresolved jumps that come from procedures, where the target is a procedure label (local labels are string and the we prefix them with the id of the procedure).
    for (unresolved_pc_location, label) in unresolved_jumps.into_iter() {
        let resolved_location = match label {
            Label::BrilligPC { pc: brillig_pc } => {
                let avm_pc = brillig_pcs_to_avm_pcs[brillig_pc as usize];
                assert!(avm_pc.num_bits() <= 32, "Oops! AVM PC is too large!");
                avm_pc as u32
            }
            Label::Procedure { label: procedure_label } => *procedure_locations
                .get(&procedure_label)
                .unwrap_or_else(|| panic!("Procedure label {:?} not found", procedure_label))
                as u32,
        };
        let instruction = avm_instrs
            .get_mut(unresolved_pc_location.instruction_index)
            .expect("Could not find instruction with unresolved PC");

        let immediate = instruction
            .immediates
            .get_mut(unresolved_pc_location.immediate_index)
            .expect("Could not find unresolved PC");

        // If these assertions fail either we have an incorrectly built unresolved PC or the unresolved pc location is messed up
        let value = match immediate {
            AvmOperand::U32 { value } => {
                assert_eq!(*value, UNRESOLVED_PC, "Expected unresolved PC"); // Double check
                value
            }
            _ => panic!("Expected immediate to be a U32"),
        };
        *value = resolved_location;
    }

    dbg_print_avm_program(&avm_instrs);

    // Constructing bytecode from instructions
    let mut bytecode = Vec::new();
    for instruction in avm_instrs {
        bytecode.extend_from_slice(&instruction.to_bytes());
    }

    Ok((bytecode, brillig_pcs_to_avm_pcs))
}

/// Transpile a Brillig program to AVM bytecode.
///
/// This preserves the existing infallible Rust API. New callers that need to
/// report checked-narrowing failures should use `try_brillig_to_avm` instead.
pub fn brillig_to_avm(brillig_bytecode: &[BrilligOpcode<FieldElement>]) -> (Vec<u8>, Vec<usize>) {
    try_brillig_to_avm(brillig_bytecode)
        .unwrap_or_else(|err| panic!("Unable to transpile Brillig bytecode: {err}"))
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
) -> Result<(), TranspileError> {
    match function {
        "aztec_avm_call" => {
            handle_external_call(avm_instrs, destinations, inputs, AvmOpcode::CALL)?;
        }
        "aztec_avm_staticCall" => {
            handle_external_call(avm_instrs, destinations, inputs, AvmOpcode::STATICCALL)?;
        }
        "aztec_avm_emitPublicLog" => {
            handle_emit_public_log(avm_instrs, destinations, inputs)?;
        }
        "aztec_avm_noteHashExists" => handle_note_hash_exists(avm_instrs, destinations, inputs)?,
        "aztec_avm_emitNoteHash" | "aztec_avm_emitNullifier" => handle_emit_note_hash_or_nullifier(
            function == "aztec_avm_emitNullifier",
            avm_instrs,
            destinations,
            inputs,
        )?,
        "aztec_avm_nullifierExists" => handle_nullifier_exists(avm_instrs, destinations, inputs)?,
        "aztec_avm_l1ToL2MsgExists" => {
            handle_l1_to_l2_msg_exists(avm_instrs, destinations, inputs)?;
        }
        "aztec_avm_sendL2ToL1Msg" => handle_send_l2_to_l1_msg(avm_instrs, destinations, inputs)?,
        "aztec_avm_calldataCopy" => handle_calldata_copy(avm_instrs, destinations, inputs)?,
        "aztec_avm_successCopy" => handle_success_copy(avm_instrs, destinations, inputs)?,
        "aztec_avm_returndataSize" => handle_returndata_size(avm_instrs, destinations, inputs)?,
        "aztec_avm_returndataCopy" => handle_returndata_copy(avm_instrs, destinations, inputs)?,
        "aztec_avm_return" => handle_return(avm_instrs, destinations, inputs)?,
        "aztec_avm_revert" => handle_revert(avm_instrs, destinations, inputs)?,
        "aztec_avm_storageRead" => handle_storage_read(avm_instrs, destinations, inputs)?,
        "aztec_avm_storageWrite" => handle_storage_write(avm_instrs, destinations, inputs)?,
        "aztec_misc_log" => handle_debug_log(avm_instrs, destinations, inputs)?,
        // Getters.
        _ if inputs.is_empty() && destinations.len() == 1 => {
            handle_getter_instruction(avm_instrs, function, destinations, inputs)?;
        }
        // Get contract instance variations.
        _ if function.starts_with("aztec_avm_getContractInstance") => {
            handle_get_contract_instance(avm_instrs, function, destinations, inputs)?;
        }
        // Anything else.
        _ => panic!("Transpiler doesn't know how to process ForeignCall function {}", function),
    }
    Ok(())
}

/// Handle an AVM CALL
/// (an external 'call' brillig foreign call was encountered)
/// Adds the new instruction to the avm instructions list.
// #[oracle(aztec_avm_call)]
// unconstrained fn call_opcode<let N: u32>(
//     l2_gas_allocation: u32,
//     da_gas_allocation: u32,
//     address: AztecAddress,
//     length: u32,
//     args: [Field; N],
// ) {}
fn handle_external_call(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
    opcode: AvmOpcode,
) -> Result<(), TranspileError> {
    if !destinations.is_empty() || inputs.len() != 5 {
        panic!(
            "Transpiler expects ForeignCall (Static)Call to have 0 destinations and 5 inputs, got {} and {}.",
            destinations.len(),
            inputs.len()
        );
    }

    let l2_gas_offset = match &inputs[0] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!("Call instruction's gas input should be a basic MemoryAddress"),
    };
    let da_gas_offset = match &inputs[1] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!("Call instruction's gas input should be a basic MemoryAddress"),
    };
    let address_offset = match &inputs[2] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!("Call instruction's target address input should be a basic MemoryAddress",),
    };
    let args_size_offset = match &inputs[3] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!("Call instruction's length input should be a basic MemoryAddress"),
    };
    let args = &inputs[4];
    let args_offset_ptr = match args {
        ValueOrArray::HeapArray(HeapArray { pointer, size: _ }) => pointer,
        _ => panic!("Call instruction's args input should be a HeapArray input"),
    };

    avm_instrs.push(AvmInstruction {
        opcode,
        addressing_mode: Some(
            AddressingModeBuilder::default()
                .direct_operand(l2_gas_offset)
                .direct_operand(da_gas_offset)
                .direct_operand(address_offset)
                .direct_operand(args_size_offset)
                .indirect_operand(args_offset_ptr)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: u16_memory_address(l2_gas_offset)? },
            AvmOperand::U16 { value: u16_memory_address(da_gas_offset)? },
            AvmOperand::U16 { value: u16_memory_address(address_offset)? },
            AvmOperand::U16 { value: u16_memory_address(args_size_offset)? },
            AvmOperand::U16 { value: u16_memory_address(args_offset_ptr)? },
        ],
        ..Default::default()
    });
    Ok(())
}

fn handle_cast(
    avm_instrs: &mut Vec<AvmInstruction>,
    source: &MemoryAddress,
    destination: &MemoryAddress,
    bit_size: BitSize,
) -> Result<(), TranspileError> {
    let tag = tag_from_bit_size(bit_size);
    avm_instrs.push(generate_cast_instruction(source, false, destination, false, tag)?);
    Ok(())
}

/// Handle an AVM NOTEHASHEXISTS instruction
/// Adds the new instruction to the avm instructions list.
fn handle_note_hash_exists(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
    let (note_hash_offset_operand, leaf_index_offset_operand) = match inputs {
        [ValueOrArray::MemoryAddress(nh_offset), ValueOrArray::MemoryAddress(li_offset)] => {
            (nh_offset, li_offset)
        }
        _ => panic!(
            "Transpiler expects ForeignCall::NOTEHASHEXISTS to have 2 inputs of type MemoryAddress, got {:?}",
            inputs
        ),
    };
    let exists_offset_operand = match destinations {
        [ValueOrArray::MemoryAddress(offset)] => offset,
        _ => panic!(
            "Transpiler expects ForeignCall::NOTEHASHEXISTS to have 1 output of type MemoryAddress, got {:?}",
            destinations
        ),
    };
    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::NOTEHASHEXISTS,
        addressing_mode: Some(
            AddressingModeBuilder::default()
                .direct_operand(note_hash_offset_operand)
                .direct_operand(leaf_index_offset_operand)
                .direct_operand(exists_offset_operand)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: u16_memory_address(note_hash_offset_operand)? },
            AvmOperand::U16 { value: u16_memory_address(leaf_index_offset_operand)? },
            AvmOperand::U16 { value: u16_memory_address(exists_offset_operand)? },
        ],
        ..Default::default()
    });
    Ok(())
}

fn handle_emit_public_log(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
    if !destinations.is_empty() || inputs.len() != 2 {
        panic!(
            "Transpiler expects ForeignCall::EMITPUBLICLOG to have 0 destinations and 2 inputs, got {} and {}",
            destinations.len(),
            inputs.len()
        );
    }

    // The fields are a slice, and this is represented as a (length: Field, slice: HeapVector).
    // The length field is redundant and we skipt it.
    let (message_offset, message_size_offset) = match &inputs[1] {
        ValueOrArray::HeapVector(vec) => (vec.pointer, vec.size),
        _ => panic!("Unexpected inputs for ForeignCall::EMITPUBLICLOG: {:?}", inputs),
    };
    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::EMITPUBLICLOG,
        // The message array from Brillig is indirect (addressing mode).
        addressing_mode: Some(
            AddressingModeBuilder::default()
                .direct_operand(&message_size_offset)
                .indirect_operand(&message_offset)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: u16_memory_address(&message_size_offset)? },
            AvmOperand::U16 { value: u16_memory_address(&message_offset)? },
        ],
        ..Default::default()
    });
    Ok(())
}

/// Handle an AVM EMITNOTEHASH or EMITNULLIFIER instruction
/// (an emitNoteHash or emitNullifier brillig foreign call was encountered)
/// Adds the new instruction to the avm instructions list.
fn handle_emit_note_hash_or_nullifier(
    is_nullifier: bool, // false for note hash, true for nullifier
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
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
        addressing_mode: Some(
            AddressingModeBuilder::default().direct_operand(offset_operand).build(),
        ),
        operands: vec![AvmOperand::U16 { value: u16_memory_address(offset_operand)? }],
        ..Default::default()
    });
    Ok(())
}

/// Handle an AVM NULLIFIEREXISTS instruction
/// (a nullifierExists brillig foreign call was encountered)
/// Adds the new instruction to the avm instructions list.
fn handle_nullifier_exists(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
    if destinations.len() != 1 || inputs.len() != 1 {
        panic!(
            "Transpiler expects ForeignCall::CHECKNULLIFIEREXISTS to have 1 destinations and 1 input, got {} and {}",
            destinations.len(),
            inputs.len()
        );
    }
    let siloed_nullifier_offset_operand = match &inputs[0] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!(
            "Transpiler does not know how to handle ForeignCall::NULLIFIEREXISTS with HeapArray/Vector inputs"
        ),
    };
    let exists_offset_operand = match &destinations[0] {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!(
            "Transpiler does not know how to handle ForeignCall::NULLIFIEREXISTS with HeapArray/Vector inputs"
        ),
    };
    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::NULLIFIEREXISTS,
        addressing_mode: Some(
            AddressingModeBuilder::default()
                .direct_operand(siloed_nullifier_offset_operand)
                .direct_operand(exists_offset_operand)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: u16_memory_address(siloed_nullifier_offset_operand)? },
            AvmOperand::U16 { value: u16_memory_address(exists_offset_operand)? },
        ],
        ..Default::default()
    });
    Ok(())
}

/// Handle an AVM L1TOL2MSGEXISTS instruction
/// (a l1ToL2MsgExists brillig foreign call was encountered)
/// Adds the new instruction to the avm instructions list.
fn handle_l1_to_l2_msg_exists(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
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
        addressing_mode: Some(
            AddressingModeBuilder::default()
                .direct_operand(msg_hash_offset_operand)
                .direct_operand(msg_leaf_index_offset_operand)
                .direct_operand(exists_offset_operand)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: u16_memory_address(msg_hash_offset_operand)? },
            AvmOperand::U16 { value: u16_memory_address(msg_leaf_index_offset_operand)? },
            AvmOperand::U16 { value: u16_memory_address(exists_offset_operand)? },
        ],
        ..Default::default()
    });
    Ok(())
}

/// Handle an AVM SENDL2TOL1MSG
/// (a sendL2ToL1Msg brillig foreign call was encountered)
/// Adds the new instruction to the avm instructions list.
fn handle_send_l2_to_l1_msg(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
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
        addressing_mode: Some(
            AddressingModeBuilder::default()
                .direct_operand(recipient_offset_operand)
                .direct_operand(content_offset_operand)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: u16_memory_address(recipient_offset_operand)? },
            AvmOperand::U16 { value: u16_memory_address(content_offset_operand)? },
        ],
        ..Default::default()
    });
    Ok(())
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
) -> Result<(), TranspileError> {
    #[allow(clippy::upper_case_acronyms)]
    enum EnvironmentVariable {
        ADDRESS,
        SENDER,
        TRANSACTIONFEE,
        CHAINID,
        VERSION,
        BLOCKNUMBER,
        TIMESTAMP,
        MINFEEPERL2GAS,
        MINFEEPERDAGAS,
        ISSTATICCALL,
        L2GASLEFT,
        DAGASLEFT,
    }

    // For the foreign calls we want to handle, we do not want inputs, as they are getters
    assert!(inputs.is_empty());
    assert_eq!(destinations.len(), 1);

    let dest_offset_maybe = destinations[0];
    let dest_offset = match dest_offset_maybe {
        ValueOrArray::MemoryAddress(dest_offset) => dest_offset,
        _ => panic!("ForeignCall address destination should be a single value"),
    };

    let var_idx = match function {
        "aztec_avm_address" => EnvironmentVariable::ADDRESS,
        "aztec_avm_sender" => EnvironmentVariable::SENDER,
        "aztec_avm_minFeePerL2Gas" => EnvironmentVariable::MINFEEPERL2GAS,
        "aztec_avm_minFeePerDaGas" => EnvironmentVariable::MINFEEPERDAGAS,
        "aztec_avm_transactionFee" => EnvironmentVariable::TRANSACTIONFEE,
        "aztec_avm_chainId" => EnvironmentVariable::CHAINID,
        "aztec_avm_version" => EnvironmentVariable::VERSION,
        "aztec_avm_blockNumber" => EnvironmentVariable::BLOCKNUMBER,
        "aztec_avm_timestamp" => EnvironmentVariable::TIMESTAMP,
        "aztec_avm_l2GasLeft" => EnvironmentVariable::L2GASLEFT,
        "aztec_avm_daGasLeft" => EnvironmentVariable::DAGASLEFT,
        "aztec_avm_isStaticCall" => EnvironmentVariable::ISSTATICCALL,
        _ => panic!("Transpiler doesn't know how to process getter {:?}", function),
    };

    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::GETENVVAR_16,
        addressing_mode: Some(
            AddressingModeBuilder::default().direct_operand(&dest_offset).build(),
        ),
        operands: vec![AvmOperand::U16 { value: u16_memory_address(&dest_offset)? }],
        immediates: vec![AvmOperand::U8 { value: var_idx as u8 }],
        ..Default::default()
    });
    Ok(())
}

/// Handles Brillig's CONST opcode.
fn handle_const(
    avm_instrs: &mut Vec<AvmInstruction>,
    destination: &MemoryAddress,
    value: &FieldElement,
    bit_size: &BitSize,
    indirect: bool,
) -> Result<(), TranspileError> {
    let tag = tag_from_bit_size(*bit_size);
    avm_instrs.push(generate_set_instruction(tag, destination, value, indirect)?);
    Ok(())
}

/// Generates an AVM SET instruction.
fn generate_set_instruction(
    tag: AvmTypeTag,
    dest: &MemoryAddress,
    value: &FieldElement,
    indirect: bool,
) -> Result<AvmInstruction, TranspileError> {
    let dest_operand = u16_memory_address(dest)?;
    let bits_needed_val = bits_needed_for(value);
    let bits_needed_mem = if bits_needed_val >= 16 { 16 } else { bits_needed_for(&dest_operand) };
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

    Ok(AvmInstruction {
        opcode: set_opcode,
        addressing_mode: if indirect {
            Some(AddressingModeBuilder::default().indirect_operand(dest).build())
        } else {
            Some(AddressingModeBuilder::default().direct_operand(dest).build())
        },
        tag: Some(tag),
        operands: vec![make_operand(bits_needed_mem, &u32::from(dest_operand))],
        immediates: vec![make_operand(bits_needed_opcode, value)],
    })
}

/// Generates an AVM CAST instruction.
fn generate_cast_instruction(
    source: &MemoryAddress,
    source_indirect: bool,
    destination: &MemoryAddress,
    destination_indirect: bool,
    dst_tag: AvmTypeTag,
) -> Result<AvmInstruction, TranspileError> {
    let ([source_operand, destination_operand], bits_needed) =
        u16_address_operands([source, destination])?;
    let avm_opcode = match bits_needed {
        8 => AvmOpcode::CAST_8,
        16 => AvmOpcode::CAST_16,
        _ => unreachable!("checked U16 cast operands only require 8 or 16 bit encodings"),
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

    Ok(AvmInstruction {
        opcode: avm_opcode,
        addressing_mode: Some(indirect_flags.build()),
        tag: Some(dst_tag),
        operands: vec![
            make_operand(bits_needed, &u32::from(source_operand)),
            make_operand(bits_needed, &u32::from(destination_operand)),
        ],
        ..Default::default()
    })
}

/// Generates an AVM REVERT instruction.
fn generate_revert_instruction(
    avm_instrs: &mut Vec<AvmInstruction>,
    revert_data_pointer: &MemoryAddress,
    revert_data_size_offset: &MemoryAddress,
) -> Result<(), TranspileError> {
    let revert_data_pointer_operand = u16_memory_address(revert_data_pointer)?;
    let revert_data_size_offset_operand = u16_memory_address(revert_data_size_offset)?;
    let bits_needed = [revert_data_pointer_operand, revert_data_size_offset_operand]
        .iter()
        .map(bits_needed_for)
        .max()
        .unwrap();
    let avm_opcode = match bits_needed {
        8 => AvmOpcode::REVERT_8,
        16 => AvmOpcode::REVERT_16,
        _ => unreachable!("checked U16 revert operands only require 8 or 16 bit encodings"),
    };
    avm_instrs.push(AvmInstruction {
        opcode: avm_opcode,
        addressing_mode: Some(
            AddressingModeBuilder::default()
                .direct_operand(revert_data_size_offset)
                .indirect_operand(revert_data_pointer)
                .build(),
        ),
        operands: vec![
            make_operand(bits_needed, &u32::from(revert_data_size_offset_operand)),
            make_operand(bits_needed, &u32::from(revert_data_pointer_operand)),
        ],
        ..Default::default()
    });
    Ok(())
}

/// Generates an AVM RETURN instruction.
fn generate_return_instruction(
    avm_instrs: &mut Vec<AvmInstruction>,
    return_data_pointer: &MemoryAddress,
    return_data_size_offset: &MemoryAddress,
) -> Result<(), TranspileError> {
    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::RETURN,
        addressing_mode: Some(
            AddressingModeBuilder::default()
                .direct_operand(return_data_size_offset)
                .indirect_operand(return_data_pointer)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: u16_memory_address(return_data_size_offset)? },
            AvmOperand::U16 { value: u16_memory_address(return_data_pointer)? },
        ],
        ..Default::default()
    });
    Ok(())
}

/// Generates an AVM MOV instruction.
fn generate_mov_instruction(
    addressing_mode: Option<AvmOperand>,
    source: &MemoryAddress,
    dest: &MemoryAddress,
) -> Result<AvmInstruction, TranspileError> {
    let ([source_operand, dest_operand], bits_needed) = u16_address_operands([source, dest])?;

    let mov_opcode = match bits_needed {
        8 => AvmOpcode::MOV_8,
        16 => AvmOpcode::MOV_16,
        _ => unreachable!("checked U16 mov operands only require 8 or 16 bit encodings"),
    };

    Ok(AvmInstruction {
        opcode: mov_opcode,
        addressing_mode,
        operands: vec![
            make_operand(bits_needed, &u32::from(source_operand)),
            make_operand(bits_needed, &u32::from(dest_operand)),
        ],
        ..Default::default()
    })
}

fn generate_mov_to_procedure(
    source: &MemoryAddress,
    index: usize,
) -> Result<AvmInstruction, TranspileError> {
    let target_address = SCRATCH_SPACE_START + index;
    let target_address = MemoryAddress::direct(target_address as u32);
    generate_mov_instruction(
        Some(
            AddressingModeBuilder::default()
                .direct_operand(source)
                .direct_operand(&target_address)
                .build(),
        ),
        source,
        &target_address,
    )
}

fn generate_set_to_procedure(
    tag: AvmTypeTag,
    value: &FieldElement,
    index: usize,
) -> Result<AvmInstruction, TranspileError> {
    let target_address = SCRATCH_SPACE_START + index;
    generate_set_instruction(tag, &MemoryAddress::direct(target_address as u32), value, false)
}

fn generate_procedure_call(
    procedure: Procedure,
    instruction_index: usize,
    unresolved_jumps: &mut HashMap<UnresolvedPCLocation, Label>,
) -> AvmInstruction {
    unresolved_jumps.insert(
        UnresolvedPCLocation { instruction_index, immediate_index: 0 },
        Label::Procedure { label: ProcedureLabel::entrypoint(procedure) },
    );
    AvmInstruction {
        opcode: AvmOpcode::INTERNALCALL,
        immediates: vec![make_unresolved_pc()],
        ..Default::default()
    }
}

/// Black box functions
/// (array goes in -> field element comes out)
fn handle_black_box_function(
    avm_instrs: &mut Vec<AvmInstruction>,
    operation: &BlackBoxOp,
    procedures_used: &mut HashSet<Procedure>,
    unresolved_jumps: &mut HashMap<UnresolvedPCLocation, Label>,
) -> Result<(), TranspileError> {
    match operation {
        BlackBoxOp::Sha256Compression { input, hash_values, output } => {
            avm_instrs.push(AvmInstruction {
                opcode: AvmOpcode::SHA256COMPRESSION,
                addressing_mode: Some(
                    AddressingModeBuilder::default()
                        .indirect_operand(&output.pointer)
                        .indirect_operand(&hash_values.pointer)
                        .indirect_operand(&input.pointer)
                        .build(),
                ),
                operands: vec![
                    AvmOperand::U16 { value: u16_memory_address(&output.pointer)? },
                    AvmOperand::U16 { value: u16_memory_address(&hash_values.pointer)? },
                    AvmOperand::U16 { value: u16_memory_address(&input.pointer)? },
                ],
                ..Default::default()
            });
        }
        BlackBoxOp::Poseidon2Permutation { message, output } => {
            // We'd love to validate the input size, but it's not known at compile time.
            assert_eq!(
                output.size,
                SemiFlattenedLength(4),
                "Poseidon2Permutation output size must be 4!"
            );
            avm_instrs.push(AvmInstruction {
                opcode: AvmOpcode::POSEIDON2,
                addressing_mode: Some(
                    AddressingModeBuilder::default()
                        .indirect_operand(&message.pointer)
                        .indirect_operand(&output.pointer)
                        .build(),
                ),
                operands: vec![
                    AvmOperand::U16 { value: u16_memory_address(&message.pointer)? },
                    AvmOperand::U16 { value: u16_memory_address(&output.pointer)? },
                ],
                ..Default::default()
            });
        }
        BlackBoxOp::Keccakf1600 { input, output } => {
            assert_eq!(input.size, SemiFlattenedLength(25), "Keccakf1600 input size must be 25!");
            assert_eq!(output.size, SemiFlattenedLength(25), "Keccakf1600 output size must be 25!");

            avm_instrs.push(AvmInstruction {
                opcode: AvmOpcode::KECCAKF1600,
                addressing_mode: Some(
                    AddressingModeBuilder::default()
                        .indirect_operand(&output.pointer)
                        .indirect_operand(&input.pointer)
                        .build(),
                ),
                operands: vec![
                    AvmOperand::U16 { value: u16_memory_address(&output.pointer)? },
                    AvmOperand::U16 { value: u16_memory_address(&input.pointer)? },
                ],
                ..Default::default()
            });
        }
        BlackBoxOp::ToRadix { input, radix, output_pointer, num_limbs, output_bits } => {
            avm_instrs.push(AvmInstruction {
                opcode: AvmOpcode::TORADIXBE,
                addressing_mode: Some(
                    AddressingModeBuilder::default()
                        .direct_operand(input)
                        .direct_operand(radix)
                        .direct_operand(num_limbs)
                        .direct_operand(output_bits)
                        .indirect_operand(output_pointer)
                        .build(),
                ),
                operands: vec![
                    AvmOperand::U16 { value: u16_memory_address(input)? },
                    AvmOperand::U16 { value: u16_memory_address(radix)? },
                    AvmOperand::U16 { value: u16_memory_address(num_limbs)? },
                    AvmOperand::U16 { value: u16_memory_address(output_bits)? },
                    AvmOperand::U16 { value: u16_memory_address(output_pointer)? },
                ],
                ..Default::default()
            });
        }
        // This will be changed to utilise relative memory offsets
        BlackBoxOp::EmbeddedCurveAdd {
            input1_x: p1_x_offset,
            input1_y: p1_y_offset,
            input2_x: p2_x_offset,
            input2_y: p2_y_offset,
            result,
        } => avm_instrs.push(AvmInstruction {
            opcode: AvmOpcode::ECADD,
            // The result (FOURTH operand) is indirect (addressing mode).
            addressing_mode: Some(
                AddressingModeBuilder::default()
                    .direct_operand(p1_x_offset)
                    .direct_operand(p1_y_offset)
                    .direct_operand(p2_x_offset)
                    .direct_operand(p2_y_offset)
                    .indirect_operand(&result.pointer)
                    .build(),
            ),
            operands: vec![
                AvmOperand::U16 { value: u16_memory_address(p1_x_offset)? },
                AvmOperand::U16 { value: u16_memory_address(p1_y_offset)? },
                AvmOperand::U16 { value: u16_memory_address(p2_x_offset)? },
                AvmOperand::U16 { value: u16_memory_address(p2_y_offset)? },
                AvmOperand::U16 { value: u16_memory_address(&result.pointer)? },
            ],
            ..Default::default()
        }),

        BlackBoxOp::MultiScalarMul { points, scalars, outputs } => {
            // The length of the scalars vector is 2x the length of the points vector due to limb
            // decomposition. Points are (x, y); the point at infinity is encoded as (0, 0).
            assert_eq!(
                outputs.size,
                SemiFlattenedLength(2),
                "Output array size must be equal to 2"
            );
            assert_eq!(points.size.0 % 2, 0, "Points array size must be divisible by 2");

            avm_instrs.push(generate_mov_to_procedure(&points.pointer, 0)?);
            avm_instrs.push(generate_mov_to_procedure(&scalars.pointer, 1)?);
            avm_instrs.push(generate_set_to_procedure(
                AvmTypeTag::UINT32,
                &FieldElement::from(points.size.0 / 2),
                2,
            )?);
            avm_instrs.push(generate_mov_to_procedure(&outputs.pointer, 3)?);
            avm_instrs.push(generate_procedure_call(
                Procedure::MultiScalarMul,
                avm_instrs.len(),
                unresolved_jumps,
            ));
            procedures_used.insert(Procedure::MultiScalarMul);
        }
        _ => panic!("Transpiler doesn't know how to process {:?}", operation),
    }
    Ok(())
}

fn handle_debug_log(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
    // We need to handle two flavors here:
    //
    // #[oracle(aztec_misc_log)]
    // unconstrained fn log_oracle<let M: u32, let N: u32>(
    //     log_level: u8,
    //     msg: str<M>,
    //     length: u32,
    //     args: [Field; N],
    // ) {}
    //
    // and
    //
    //#[oracle(aztec_misc_log)]
    // unconstrained fn log_slice_oracle<let M: u32>(log_level: u8, msg: str<M>, args: [Field]) {}
    //
    // Luckily, these two flavors have both 4 arguments, since noir inserts a length field for slices before the slice.
    // So we can handle both cases with mostly the same code.
    //
    if !destinations.is_empty() || inputs.len() != 4 {
        panic!(
            "Transpiler expects ForeignCall::DEBUGLOG to have 0 destinations and 4 inputs, got {} and {}",
            destinations.len(),
            inputs.len()
        );
    }
    // Level
    let level_offset = match &inputs[0] {
        ValueOrArray::MemoryAddress(level) => level,
        _ => panic!("Level for ForeignCall::DEBUGLOG should be a MemoryAddress."),
    };
    // Message
    let (message_offset, message_size) = match &inputs[1] {
        ValueOrArray::HeapArray(HeapArray { pointer, size }) => (pointer, *size),
        _ => panic!("Message for ForeignCall::DEBUGLOG should be a HeapArray."),
    };
    // Length and pointer
    let (fields_offset_ptr, fields_size_offset) = match &inputs[3] {
        ValueOrArray::HeapVector(HeapVector { pointer, size }) => (pointer, size),
        ValueOrArray::HeapArray(HeapArray { pointer, .. }) => {
            // match inputs[2] to be a regular
            match &inputs[2] {
                ValueOrArray::MemoryAddress(size) => (pointer, size),
                _ => panic!("DebugLog with an array should have a memory address for the size."),
            }
        }
        _ => panic!("List of fields for ForeignCall::DEBUGLOG should be a HeapVector (slice)."),
    };
    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::DEBUGLOG,
        // (left to right)
        //  * level direct
        //  * message_offset INDIRECT
        //  * (N/A) message_size is an immediate
        //  * fields_offset_ptr INDIRECT
        //  * fields_size_offset direct
        addressing_mode: Some(
            AddressingModeBuilder::default()
                .direct_operand(level_offset)
                .indirect_operand(message_offset)
                .indirect_operand(fields_offset_ptr)
                .direct_operand(fields_size_offset)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: u16_memory_address(level_offset)? },
            AvmOperand::U16 { value: u16_memory_address(message_offset)? },
            AvmOperand::U16 { value: u16_memory_address(fields_offset_ptr)? },
            AvmOperand::U16 { value: u16_memory_address(fields_size_offset)? },
        ],
        immediates: vec![AvmOperand::U16 {
            value: u16_immediate("debug log message size", message_size.0)?,
        }],
        ..Default::default()
    });
    Ok(())
}

// #[oracle(aztec_avm_calldataCopy)]
// unconstrained fn calldata_copy_opcode<let N: u32>(cdoffset: Field) -> [Field; N] {}
fn handle_calldata_copy(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
    assert_eq!(inputs.len(), 2);
    assert_eq!(destinations.len(), 1);

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
        addressing_mode: Some(
            AddressingModeBuilder::default()
                .direct_operand(&copy_size_offset)
                .direct_operand(&cd_offset)
                .indirect_operand(&dest_offset)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: u16_memory_address(&copy_size_offset)? },
            AvmOperand::U16 { value: u16_memory_address(&cd_offset)? },
            AvmOperand::U16 { value: u16_memory_address(&dest_offset)? },
        ],
        ..Default::default()
    });
    Ok(())
}

// #[oracle(aztec_avm_returndataSize)]
// unconstrained fn returndata_size_opcode() -> u32 {}
fn handle_returndata_size(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
    assert!(inputs.is_empty());
    assert_eq!(destinations.len(), 1);

    let dest_offset = match destinations[0] {
        ValueOrArray::MemoryAddress(address) => address,
        _ => panic!("ReturndataSize destination should be a memory location"),
    };

    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::RETURNDATASIZE,
        addressing_mode: Some(
            AddressingModeBuilder::default().direct_operand(&dest_offset).build(),
        ),
        operands: vec![AvmOperand::U16 { value: u16_memory_address(&dest_offset)? }],
        ..Default::default()
    });
    Ok(())
}

// #[oracle(aztec_avm_returndataCopy)]
// unconstrained fn returndata_copy_opcode(rdoffset: u32, copy_size: u32) -> [Field] {}
fn handle_returndata_copy(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
    assert_eq!(inputs.len(), 2);
    assert_eq!(destinations.len(), 2);

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
            addressing_mode: Some(
                AddressingModeBuilder::default()
                    .direct_operand(&copy_size_offset)
                    .direct_operand(&cd_offset)
                    .indirect_operand(&dest_offset)
                    .build(),
            ),
            operands: vec![
                AvmOperand::U16 { value: u16_memory_address(&copy_size_offset)? },
                AvmOperand::U16 { value: u16_memory_address(&cd_offset)? },
                AvmOperand::U16 { value: u16_memory_address(&dest_offset)? },
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
            &copy_size_offset,
            &write_size_here_offset,
        )?,
    ]);
    Ok(())
}

// #[oracle(aztec_avm_return)]
// unconstrained fn return_opcode<let N: u32>(returndata: [Field; N]) {}
fn handle_return(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
    assert_eq!(inputs.len(), 2);
    assert!(destinations.is_empty());

    // First arg is the size, which is ignored because it's redundant.
    let (return_data_offset, return_data_size) = match inputs[1] {
        ValueOrArray::HeapVector(HeapVector { pointer, size }) => (pointer, size),
        _ => panic!("Revert instruction's args input should be a HeapVector"),
    };

    generate_return_instruction(avm_instrs, &return_data_offset, &return_data_size)
}

// #[oracle(aztec_avm_revert)]
// unconstrained fn revert_opcode(revertdata: [Field]) {}
fn handle_revert(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
    assert_eq!(inputs.len(), 2);
    assert!(destinations.is_empty());

    // First arg is the size, which is ignored because it's redundant.
    let (revert_data_offset, revert_data_size_offset) = match inputs[1] {
        ValueOrArray::HeapVector(HeapVector { pointer, size }) => (pointer, size),
        _ => panic!("Revert instruction's args input should be a HeapVector"),
    };

    generate_revert_instruction(avm_instrs, &revert_data_offset, &revert_data_size_offset)
}

/// Emit a storage write opcode
/// The current implementation writes an array of values into storage ( contiguous slots in memory )
fn handle_storage_write(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
    assert_eq!(inputs.len(), 2);
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
        addressing_mode: Some(
            AddressingModeBuilder::default()
                .direct_operand(&src_offset)
                .direct_operand(&slot_offset)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: u16_memory_address(&src_offset)? },
            AvmOperand::U16 { value: u16_memory_address(&slot_offset)? },
        ],
        ..Default::default()
    });
    Ok(())
}

/// Emit a GETCONTRACTINSTANCE opcode
fn handle_get_contract_instance(
    avm_instrs: &mut Vec<AvmInstruction>,
    function: &str,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
    #[allow(non_camel_case_types, clippy::upper_case_acronyms)]
    enum ContractInstanceMember {
        DEPLOYER,
        CLASS_ID,
        INIT_HASH,
        IMMUTABLES_HASH,
    }

    assert_eq!(inputs.len(), 1);
    assert_eq!(destinations.len(), 1);

    let member_idx = match function {
        "aztec_avm_getContractInstanceDeployer" => ContractInstanceMember::DEPLOYER,
        "aztec_avm_getContractInstanceClassId" => ContractInstanceMember::CLASS_ID,
        "aztec_avm_getContractInstanceInitializationHash" => ContractInstanceMember::INIT_HASH,
        "aztec_avm_getContractInstanceImmutablesHash" => ContractInstanceMember::IMMUTABLES_HASH,
        _ => panic!("Transpiler doesn't know how to process function {:?}", function),
    };

    let address_offset_maybe = inputs[0];
    let address_offset = match address_offset_maybe {
        ValueOrArray::MemoryAddress(offset) => offset,
        _ => panic!("GETCONTRACTINSTANCE address should be a single value"),
    };

    let dest_offset_maybe = destinations[0];
    let (dest_offset, dest_size) = match dest_offset_maybe {
        ValueOrArray::HeapArray(HeapArray { pointer, size }) => (pointer, size),
        _ => panic!("GETCONTRACTINSTANCE dst destination should be a HeapArray"),
    };

    assert_eq!(
        dest_size,
        SemiFlattenedLength(2),
        "GETCONTRACTINSTANCE destination should have length two: (exists: bool, member: Field)"
    );

    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::GETCONTRACTINSTANCE,
        addressing_mode: Some(
            AddressingModeBuilder::default()
                .direct_operand(&address_offset)
                .indirect_operand(&dest_offset)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: u16_memory_address(&address_offset)? },
            AvmOperand::U16 { value: u16_memory_address(&dest_offset)? },
        ],
        immediates: vec![AvmOperand::U8 { value: member_idx as u8 }],
        ..Default::default()
    });
    Ok(())
}

/// Emit a storage read opcode
/// The current implementation reads an array of values from storage ( contiguous slots in memory )
fn handle_storage_read(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
    assert_eq!(inputs.len(), 2); // slot, contract_address
    assert_eq!(destinations.len(), 1); // return value

    let slot_offset_maybe = inputs[0];
    let slot_offset = match slot_offset_maybe {
        ValueOrArray::MemoryAddress(slot_offset) => slot_offset,
        _ => panic!("ForeignCall slot input should be a single value"),
    };

    let contract_address_offset_maybe = inputs[1];
    let contract_address_offset = match contract_address_offset_maybe {
        ValueOrArray::MemoryAddress(contract_address_offset) => contract_address_offset,
        _ => panic!("ForeignCall contract_address input should be a single value"),
    };

    let dest_offset_maybe = destinations[0];
    let dest_offset = match dest_offset_maybe {
        ValueOrArray::MemoryAddress(dest_offset) => dest_offset,
        _ => panic!("ForeignCall address destination should be a single value"),
    };

    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::SLOAD,
        addressing_mode: Some(
            AddressingModeBuilder::default()
                .direct_operand(&slot_offset)
                .direct_operand(&contract_address_offset)
                .direct_operand(&dest_offset)
                .build(),
        ),
        operands: vec![
            AvmOperand::U16 { value: u16_memory_address(&slot_offset)? },
            AvmOperand::U16 { value: u16_memory_address(&contract_address_offset)? },
            AvmOperand::U16 { value: u16_memory_address(&dest_offset)? },
        ],
        ..Default::default()
    });
    Ok(())
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
                patched_locations.insert(avm_opcode_location, *source_locations);
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

/// #[oracle(aztec_avm_successCopy)]
/// unconstrained fn success_copy_opcode() -> bool {}
fn handle_success_copy(
    avm_instrs: &mut Vec<AvmInstruction>,
    destinations: &[ValueOrArray],
    inputs: &[ValueOrArray],
) -> Result<(), TranspileError> {
    if destinations.len() != 1 || !inputs.is_empty() {
        panic!(
            "Transpiler expects SuccessCopy to have 1 destination and 0 inputs, got {} and {}.",
            destinations.len(),
            inputs.len()
        );
    }

    let dst_offset = match destinations[0] {
        ValueOrArray::MemoryAddress(address) => address,
        _ => panic!("SuccessCopy destination should be a memory location"),
    };

    avm_instrs.push(AvmInstruction {
        opcode: AvmOpcode::SUCCESSCOPY,
        addressing_mode: Some(AddressingModeBuilder::default().direct_operand(&dst_offset).build()),
        operands: vec![AvmOperand::U16 { value: u16_memory_address(&dst_offset)? }],
        ..Default::default()
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn oversized_address() -> MemoryAddress {
        MemoryAddress::direct(u16::MAX as u32 + 1)
    }

    fn assert_oversized_address_error(opcode: BrilligOpcode<FieldElement>) {
        let err = try_brillig_to_avm(&[opcode]).unwrap_err();

        assert_eq!(
            err,
            TranspileError::U16MemoryAddressOutOfRange { address: u16::MAX as u32 + 1 }
        );
    }

    #[test]
    fn brillig_to_avm_preserves_existing_infallible_api_for_valid_input() {
        let (bytecode, pc_map) = brillig_to_avm(&[BrilligOpcode::Mov {
            destination: MemoryAddress::direct(1),
            source: MemoryAddress::direct(0),
        }]);

        assert!(!bytecode.is_empty());
        assert_eq!(pc_map.len(), 2);
    }

    #[test]
    fn u16_memory_address_accepts_max_value() {
        let address = MemoryAddress::direct(u16::MAX as u32);
        assert_eq!(u16_memory_address(&address).unwrap(), u16::MAX);
    }

    #[test]
    fn u16_memory_address_rejects_oversized_value() {
        let address = MemoryAddress::direct(u16::MAX as u32 + 1);
        assert_eq!(
            u16_memory_address(&address).unwrap_err(),
            TranspileError::U16MemoryAddressOutOfRange { address: u16::MAX as u32 + 1 }
        );
    }

    #[test]
    fn brillig_to_avm_rejects_oversized_u16_operand() {
        assert_oversized_address_error(BrilligOpcode::CalldataCopy {
            destination_address: oversized_address(),
            size_address: MemoryAddress::direct(0),
            offset_address: MemoryAddress::direct(1),
        });
    }

    #[test]
    fn try_brillig_to_avm_rejects_reported_wrapping_collision_address() {
        let collision_address = 70_000;
        let err = try_brillig_to_avm(&[BrilligOpcode::CalldataCopy {
            destination_address: MemoryAddress::direct(collision_address),
            size_address: MemoryAddress::direct(0),
            offset_address: MemoryAddress::direct(1),
        }])
        .unwrap_err();

        assert_eq!(err, TranspileError::U16MemoryAddressOutOfRange { address: collision_address });
    }

    #[test]
    fn brillig_to_avm_rejects_oversized_jump_if_condition() {
        assert_oversized_address_error(BrilligOpcode::JumpIf {
            condition: oversized_address(),
            location: 0,
        });
    }

    #[test]
    fn brillig_to_avm_rejects_oversized_const_destination() {
        assert_oversized_address_error(BrilligOpcode::Const {
            destination: oversized_address(),
            value: FieldElement::from(u16::MAX as u32 + 1),
            bit_size: BitSize::Integer(IntegerBitSize::U32),
        });
    }

    #[test]
    fn brillig_to_avm_rejects_oversized_indirect_const_destination() {
        assert_oversized_address_error(BrilligOpcode::IndirectConst {
            destination_pointer: oversized_address(),
            value: FieldElement::from(u16::MAX as u32 + 1),
            bit_size: BitSize::Integer(IntegerBitSize::U32),
        });
    }

    #[test]
    fn brillig_to_avm_rejects_oversized_binary_field_operand() {
        assert_oversized_address_error(BrilligOpcode::BinaryFieldOp {
            destination: MemoryAddress::direct(2),
            op: BinaryFieldOp::Add,
            lhs: oversized_address(),
            rhs: MemoryAddress::direct(1),
        });
    }

    #[test]
    fn brillig_to_avm_rejects_oversized_binary_int_operand() {
        assert_oversized_address_error(BrilligOpcode::BinaryIntOp {
            destination: MemoryAddress::direct(2),
            op: BinaryIntOp::Add,
            bit_size: IntegerBitSize::U32,
            lhs: MemoryAddress::direct(0),
            rhs: oversized_address(),
        });
    }

    #[test]
    fn brillig_to_avm_rejects_oversized_not_operand() {
        assert_oversized_address_error(BrilligOpcode::Not {
            destination: MemoryAddress::direct(1),
            source: oversized_address(),
            bit_size: IntegerBitSize::U32,
        });
    }

    #[test]
    fn brillig_to_avm_rejects_oversized_mov_operand() {
        assert_oversized_address_error(BrilligOpcode::Mov {
            destination: oversized_address(),
            source: MemoryAddress::direct(0),
        });
    }

    #[test]
    fn brillig_to_avm_rejects_oversized_conditional_mov_operand() {
        assert_oversized_address_error(BrilligOpcode::ConditionalMov {
            destination: MemoryAddress::direct(1),
            source_a: MemoryAddress::direct(0),
            source_b: oversized_address(),
            condition: MemoryAddress::direct(2),
        });
    }

    #[test]
    fn brillig_to_avm_rejects_oversized_load_operand() {
        assert_oversized_address_error(BrilligOpcode::Load {
            destination: MemoryAddress::direct(0),
            source_pointer: oversized_address(),
        });
    }

    #[test]
    fn brillig_to_avm_rejects_oversized_store_operand() {
        assert_oversized_address_error(BrilligOpcode::Store {
            destination_pointer: oversized_address(),
            source: MemoryAddress::direct(0),
        });
    }

    #[test]
    fn brillig_to_avm_rejects_oversized_cast_operand() {
        assert_oversized_address_error(BrilligOpcode::Cast {
            destination: MemoryAddress::direct(1),
            source: oversized_address(),
            bit_size: BitSize::Integer(IntegerBitSize::U32),
        });
    }

    #[test]
    fn debug_log_message_size_rejects_oversized_u16_immediate() {
        assert_eq!(
            u16_immediate("debug log message size", u16::MAX as u32 + 1).unwrap_err(),
            TranspileError::U16ImmediateOutOfRange {
                name: "debug log message size",
                value: u16::MAX as u32 + 1,
            }
        );
    }
}
