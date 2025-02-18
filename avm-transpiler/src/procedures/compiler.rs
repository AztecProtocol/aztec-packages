mod operand_collector;

use crate::{
    bit_traits::bits_needed_for,
    instructions::{AvmInstruction, AvmOperand},
    opcodes::AvmOpcode,
    utils::make_operand,
};
use fxhash::FxHashMap as HashMap;

use super::parser::{Alias, Assembly, Operand, ParsedOpcode, Symbol};


pub(crate) type Label = String;

pub(crate) struct CompiledProcedure {
    pub instructions: Vec<AvmInstruction>,
    // Map of instruction index to label
    pub locations: HashMap<usize, Label>,
    // Maps the index of an unresolved jump/call to the label it's supposed to jump/call to
    pub unresolved_jumps: HashMap<usize, Label>,
}

enum Immediate {
    Numeric(u128),
    Label(Label),
}

pub(crate) fn compile(
    parsed_assembly: Assembly,
    label_prefix: String,
) -> Result<CompiledProcedure, String> {
    let instructions = Vec::with_capacity(parsed_assembly.len());
    let locations = HashMap::default();
    let unresolved_jumps = HashMap::default();
    let mut result = CompiledProcedure { instructions, locations, unresolved_jumps };
    for parsed_opcode in parsed_assembly.into_iter() {
        match parsed_opcode.alias {
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
                compile_binary_instruction(parsed_opcode, label_prefix, &mut result)?;
            }
        }
    }

    Ok(result)
}

fn compile_binary_instruction(
    parsed_opcode: ParsedOpcode,
    label_prefix: String,
    result: &mut CompiledProcedure,
) -> Result<(), String> {
    let alias = parsed_opcode.alias;
    let mut collector = OperandCollector::new(parsed_opcode, label_prefix);
    collector.memory_address_operand()?;
    collector.memory_address_operand()?;
    collector.memory_address_operand()?;
    let (operands, indirect) = collector.finish()?;
    let bits_needed = operands.iter().map(bits_needed_for).max().unwrap();
    assert!(
        bits_needed == 8 || bits_needed == 16,
        "Binary opcodes only support 8 or 16 bit encodings, got: {}",
        bits_needed
    );
    let avm_opcode = match alias {
        Alias::ADD => match bits_needed {
            8 => AvmOpcode::ADD_8,
            16 => AvmOpcode::ADD_16,
        },
        Alias::SUB => match bits_needed {
            8 => AvmOpcode::SUB_8,
            16 => AvmOpcode::SUB_16,
        },
        Alias::MUL => match bits_needed {
            8 => AvmOpcode::MUL_8,
            16 => AvmOpcode::MUL_16,
        },
        Alias::FDIV => match bits_needed {
            8 => AvmOpcode::FDIV_8,
            16 => AvmOpcode::FDIV_16,
        },
        Alias::DIV => match bits_needed {
            8 => AvmOpcode::DIV_8,
            16 => AvmOpcode::DIV_16,
        },
        Alias::AND => match bits_needed {
            8 => AvmOpcode::AND_8,
            16 => AvmOpcode::AND_16,
        },
        Alias::OR => match bits_needed {
            8 => AvmOpcode::OR_8,
            16 => AvmOpcode::OR_16,
        },
        Alias::XOR => match bits_needed {
            8 => AvmOpcode::XOR_8,
            16 => AvmOpcode::XOR_16,
        },
        Alias::SHL => match bits_needed {
            8 => AvmOpcode::SHL_8,
            16 => AvmOpcode::SHL_16,
        },
        Alias::SHR => match bits_needed {
            8 => AvmOpcode::SHR_8,
            16 => AvmOpcode::SHR_16,
        },
        Alias::EQ => match bits_needed {
            8 => AvmOpcode::EQ_8,
            16 => AvmOpcode::EQ_16,
        },
        Alias::LT => match bits_needed {
            8 => AvmOpcode::LT_8,
            16 => AvmOpcode::LT_16,
        },
        Alias::LTE => match bits_needed {
            8 => AvmOpcode::LTE_8,
            16 => AvmOpcode::LTE_16,
        },
        _ => unreachable!("Invalid binary opcode: {:?}", alias),
    };
    let instruction = AvmInstruction {
        opcode: avm_opcode,
        indirect: Some(build_addressing_mode(indirect)),
        operands: operands.iter().map(|operand| make_operand(bits_needed, operand)).collect(),
        ..Default::default()
    };
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
