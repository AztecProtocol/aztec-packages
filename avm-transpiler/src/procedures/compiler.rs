mod operand_collector;

use crate::{
    bit_traits::bits_needed_for,
    instructions::{AvmInstruction, AvmOperand},
    opcodes::AvmOpcode,
    transpile::UNRESOLVED_PC,
    utils::make_operand,
};
use fxhash::FxHashMap as HashMap;
use operand_collector::OperandCollector;

use super::parser::{Alias, Assembly, Label, ParsedOpcode};

pub(crate) use operand_collector::SCRATCH_SPACE_START;

pub(crate) struct CompiledProcedure {
    pub instructions: Vec<AvmInstruction>,
    // Map of instruction label to local avm pc
    pub locations: HashMap<Label, usize>,
    // Map of instruction index to jumped to label
    pub unresolved_jumps: HashMap<usize, Label>,

    pub instructions_size: usize,
}

impl CompiledProcedure {
    fn add_instruction(&mut self, instruction: AvmInstruction, label: Option<Label>) {
        if let Some(label) = label {
            self.locations.insert(label, self.instructions_size);
        }
        self.instructions_size += instruction.size();
        self.instructions.push(instruction);
    }

    fn add_unresolved_jump(&mut self, target: Label) {
        self.unresolved_jumps.insert(self.instructions.len(), target);
    }
}

pub(crate) fn compile(parsed_assembly: Assembly) -> Result<CompiledProcedure, String> {
    let mut result = CompiledProcedure {
        instructions: Vec::with_capacity(parsed_assembly.len()),
        locations: HashMap::default(),
        unresolved_jumps: HashMap::default(),
        instructions_size: 0,
    };
    for parsed_opcode in parsed_assembly.into_iter() {
        compile_opcode(parsed_opcode.clone(), &mut result)
            .map_err(|err| format!("Error compiling opcode {:?}: {}", parsed_opcode, err))?;
    }

    Ok(result)
}

fn compile_opcode(
    parsed_opcode: ParsedOpcode,
    result: &mut CompiledProcedure,
) -> Result<(), String> {
    let label = parsed_opcode.label.clone();
    let alias = parsed_opcode.alias;
    let mut collector = OperandCollector::new(parsed_opcode);
    match alias {
        Alias::ADD
        | Alias::SUB
        | Alias::MUL
        | Alias::FDIV
        | Alias::DIV
        | Alias::AND
        | Alias::OR
        | Alias::XOR
        | Alias::SHL
        | Alias::SHR
        | Alias::EQ
        | Alias::LT
        | Alias::LTE => {
            compile_binary_instruction(alias, label, collector, result)?;
        }
        Alias::SET => {
            collector.memory_address_operand()?;
            collector.numeric_operand()?;
            collector.with_tag()?;
            let collection = collector.finish()?;
            let dest_address = collection.operands[0];
            let immediate_value = collection.immediates[0].unwrap_numeric();
            let bits_needed_val = bits_needed_for(&immediate_value);
            let bits_needed_mem =
                if bits_needed_val >= 16 { 16 } else { bits_needed_for(&dest_address) };
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

            result.add_instruction(
                AvmInstruction {
                    opcode: set_opcode,
                    indirect: Some(build_addressing_mode(collection.indirect)),
                    operands: vec![make_operand(bits_needed_mem, &dest_address)],
                    immediates: vec![make_operand(bits_needed_opcode, &immediate_value)],
                    tag: collection.tag,
                },
                label,
            );
        }
        Alias::JUMP => {
            collector.label_operand()?;
            let collection = collector.finish()?;
            result.add_unresolved_jump(collection.immediates[0].unwrap_label());
            result.add_instruction(
                AvmInstruction {
                    opcode: AvmOpcode::JUMP_32,
                    immediates: vec![AvmOperand::U32 { value: UNRESOLVED_PC }],
                    ..Default::default()
                },
                label,
            );
        }
        Alias::JUMPI => {
            collector.memory_address_operand()?;
            collector.label_operand()?;
            let collection = collector.finish()?;
            result.add_unresolved_jump(collection.immediates[0].unwrap_label());
            result.add_instruction(
                AvmInstruction {
                    opcode: AvmOpcode::JUMPI_32,
                    indirect: Some(build_addressing_mode(collection.indirect)),
                    operands: vec![make_operand(16, &collection.operands[0])],
                    immediates: vec![AvmOperand::U32 { value: UNRESOLVED_PC }],
                    ..Default::default()
                },
                label,
            );
        }
        Alias::NOT => {
            collector.memory_address_operand()?;
            collector.memory_address_operand()?;
            let collection = collector.finish()?;
            let bits_needed = collection.operands.iter().map(bits_needed_for).max().unwrap();
            assert!(
                bits_needed == 8 || bits_needed == 16,
                "NOT opcodes only support 8 or 16 bit encodings, got: {}",
                bits_needed
            );
            result.add_instruction(
                AvmInstruction {
                    opcode: if bits_needed == 8 { AvmOpcode::NOT_8 } else { AvmOpcode::NOT_16 },
                    indirect: Some(build_addressing_mode(collection.indirect)),
                    operands: collection
                        .operands
                        .iter()
                        .map(|operand| make_operand(bits_needed, operand))
                        .collect(),
                    ..Default::default()
                },
                label,
            );
        }

        Alias::CAST => {
            collector.memory_address_operand()?;
            collector.memory_address_operand()?;
            collector.with_tag()?;
            let collection = collector.finish()?;

            let bits_needed = collection.operands.iter().map(bits_needed_for).max().unwrap();
            let avm_opcode = match bits_needed {
                8 => AvmOpcode::CAST_8,
                16 => AvmOpcode::CAST_16,
                _ => {
                    panic!("CAST only supports 8 and 16 bit encodings, needed {}", bits_needed)
                }
            };
            result.add_instruction(
                AvmInstruction {
                    opcode: avm_opcode,
                    indirect: Some(build_addressing_mode(collection.indirect)),
                    operands: collection
                        .operands
                        .iter()
                        .map(|operand| make_operand(bits_needed, operand))
                        .collect(),
                    tag: collection.tag,
                    ..Default::default()
                },
                label,
            );
        }

        Alias::MOV => {
            collector.memory_address_operand()?;
            collector.memory_address_operand()?;
            let collection = collector.finish()?;
            let bits_needed = collection.operands.iter().map(bits_needed_for).max().unwrap();
            let mov_opcode = match bits_needed {
                8 => AvmOpcode::MOV_8,
                16 => AvmOpcode::MOV_16,
                _ => panic!("MOV operands must fit in 16 bits but needed {}", bits_needed),
            };

            result.add_instruction(
                AvmInstruction {
                    opcode: mov_opcode,
                    indirect: Some(build_addressing_mode(collection.indirect)),
                    operands: collection
                        .operands
                        .iter()
                        .map(|operand| make_operand(bits_needed, operand))
                        .collect(),
                    ..Default::default()
                },
                label,
            );
        }

        Alias::INTERNALRETURN => {
            collector.finish()?;
            result.add_instruction(
                AvmInstruction { opcode: AvmOpcode::INTERNALRETURN, ..Default::default() },
                label,
            );
        }

        Alias::ECADD => {
            collector.memory_address_operand()?; // p1 x
            collector.memory_address_operand()?; // p1 y
            collector.memory_address_operand()?; // p1 is_infinite
            collector.memory_address_operand()?; // p2 x
            collector.memory_address_operand()?; // p2 y
            collector.memory_address_operand()?; // p2 is_infinite
            collector.memory_address_operand()?; // result
            let collection = collector.finish()?;
            result.add_instruction(
                AvmInstruction {
                    opcode: AvmOpcode::ECADD,
                    indirect: Some(build_addressing_mode(collection.indirect)),
                    operands: collection
                        .operands
                        .into_iter()
                        .map(|operand| AvmOperand::U16 { value: operand as u16 })
                        .collect(),
                    ..Default::default()
                },
                label,
            );
        }

        Alias::TORADIXBE => {
            collector.memory_address_operand()?; // input
            collector.memory_address_operand()?; // radix
            collector.memory_address_operand()?; // num_limbs
            collector.memory_address_operand()?; // output_bits
            collector.memory_address_operand()?; // output
            let collection = collector.finish()?;

            result.add_instruction(
                AvmInstruction {
                    opcode: AvmOpcode::TORADIXBE,
                    indirect: Some(build_addressing_mode(collection.indirect)),
                    operands: collection
                        .operands
                        .into_iter()
                        .map(|operand| AvmOperand::U16 { value: operand as u16 })
                        .collect(),
                    ..Default::default()
                },
                label,
            );
        }
    };
    Ok(())
}

fn compile_binary_instruction(
    alias: Alias,
    label: Option<Label>,
    mut collector: OperandCollector,
    result: &mut CompiledProcedure,
) -> Result<(), String> {
    collector.memory_address_operand()?;
    collector.memory_address_operand()?;
    collector.memory_address_operand()?;
    let collection = collector.finish()?;
    let bits_needed = collection.operands.iter().map(bits_needed_for).max().unwrap();
    assert!(
        bits_needed == 8 || bits_needed == 16,
        "Binary opcodes only support 8 or 16 bit encodings, got: {}",
        bits_needed
    );
    let avm_opcode = match alias {
        Alias::ADD => match bits_needed {
            8 => AvmOpcode::ADD_8,
            16 => AvmOpcode::ADD_16,
            _ => unreachable!(),
        },
        Alias::SUB => match bits_needed {
            8 => AvmOpcode::SUB_8,
            16 => AvmOpcode::SUB_16,
            _ => unreachable!(),
        },
        Alias::MUL => match bits_needed {
            8 => AvmOpcode::MUL_8,
            16 => AvmOpcode::MUL_16,
            _ => unreachable!(),
        },
        Alias::FDIV => match bits_needed {
            8 => AvmOpcode::FDIV_8,
            16 => AvmOpcode::FDIV_16,
            _ => unreachable!(),
        },
        Alias::DIV => match bits_needed {
            8 => AvmOpcode::DIV_8,
            16 => AvmOpcode::DIV_16,
            _ => unreachable!(),
        },
        Alias::AND => match bits_needed {
            8 => AvmOpcode::AND_8,
            16 => AvmOpcode::AND_16,
            _ => unreachable!(),
        },
        Alias::OR => match bits_needed {
            8 => AvmOpcode::OR_8,
            16 => AvmOpcode::OR_16,
            _ => unreachable!(),
        },
        Alias::XOR => match bits_needed {
            8 => AvmOpcode::XOR_8,
            16 => AvmOpcode::XOR_16,
            _ => unreachable!(),
        },
        Alias::SHL => match bits_needed {
            8 => AvmOpcode::SHL_8,
            16 => AvmOpcode::SHL_16,
            _ => unreachable!(),
        },
        Alias::SHR => match bits_needed {
            8 => AvmOpcode::SHR_8,
            16 => AvmOpcode::SHR_16,
            _ => unreachable!(),
        },
        Alias::EQ => match bits_needed {
            8 => AvmOpcode::EQ_8,
            16 => AvmOpcode::EQ_16,
            _ => unreachable!(),
        },
        Alias::LT => match bits_needed {
            8 => AvmOpcode::LT_8,
            16 => AvmOpcode::LT_16,
            _ => unreachable!(),
        },
        Alias::LTE => match bits_needed {
            8 => AvmOpcode::LTE_8,
            16 => AvmOpcode::LTE_16,
            _ => unreachable!(),
        },
        _ => unreachable!("Invalid binary opcode: {:?}", alias),
    };

    result.add_instruction(
        AvmInstruction {
            opcode: avm_opcode,
            indirect: Some(build_addressing_mode(collection.indirect)),
            operands: collection
                .operands
                .iter()
                .map(|operand| make_operand(bits_needed, operand))
                .collect(),
            ..Default::default()
        },
        label,
    );
    Ok(())
}

fn build_addressing_mode(indirect: Vec<bool>) -> AvmOperand {
    let num_operands = indirect.len();
    assert!(num_operands <= 8, "Too many operands for building addressing mode bytes");

    let mut result = 0;
    for (i, indirect) in indirect.into_iter().enumerate() {
        if indirect {
            result |= 1 << i;
        }
    }

    if num_operands <= 4 {
        AvmOperand::U8 { value: result as u8 }
    } else {
        AvmOperand::U16 { value: result as u16 }
    }
}
