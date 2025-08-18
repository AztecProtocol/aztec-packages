use crate::{
    instructions::AvmTypeTag,
    procedures::parser::{Label, Operand, ParsedOpcode, Symbol},
};

// We should probably pull these constants from the noir compiler
const NUM_RESERVED_REGISTERS: usize = 3;
const MAX_STACK_FRAME_SIZE: usize = 2048;
const MAX_STACK_SIZE: usize = 16 * MAX_STACK_FRAME_SIZE;
const MAX_SCRATCH_SPACE: usize = 64;
pub(crate) const SCRATCH_SPACE_START: usize = NUM_RESERVED_REGISTERS + MAX_STACK_SIZE;

pub(crate) enum Immediate {
    Numeric(u128),
    Label(Label),
}

impl Immediate {
    pub(crate) fn unwrap_numeric(&self) -> u128 {
        match self {
            Immediate::Numeric(value) => *value,
            Immediate::Label(_) => panic!("Expected numeric immediate"),
        }
    }

    pub(crate) fn unwrap_label(&self) -> Label {
        match self {
            Immediate::Numeric(_) => panic!("Expected label immediate"),
            Immediate::Label(label) => label.clone(),
        }
    }
}

pub(crate) struct OperandCollectionResult {
    pub(crate) operands: Vec<usize>,
    pub(crate) indirect: Vec<bool>,
    pub(crate) immediates: Vec<Immediate>,
    pub(crate) tag: Option<AvmTypeTag>,
}

pub(crate) struct OperandCollector {
    parsed_opcode: ParsedOpcode,
    extracted_operands: Vec<usize>,
    extracted_immediates: Vec<Immediate>,
    indirect: Vec<bool>,

    operand_index: usize,
    extracted_tag: bool,
}

impl OperandCollector {
    pub(crate) fn new(parsed_opcode: ParsedOpcode) -> Self {
        OperandCollector {
            parsed_opcode,
            extracted_operands: vec![],
            extracted_immediates: vec![],
            indirect: vec![],
            operand_index: 0,
            extracted_tag: false,
        }
    }

    fn next_operand(&mut self) -> Option<Operand> {
        if self.operand_index >= self.parsed_opcode.operands.len() {
            return None;
        }
        let operand = self.parsed_opcode.operands[self.operand_index].clone();
        self.operand_index += 1;
        Some(operand)
    }

    fn convert_address(address: usize) -> Result<usize, String> {
        if address > MAX_SCRATCH_SPACE {
            return Err(format!("Address {} is out of bounds", address));
        }
        let result = address + SCRATCH_SPACE_START;
        Ok(result)
    }

    pub(crate) fn memory_address_operand(&mut self) -> Result<(), String> {
        let operand = self.next_operand().ok_or("Missing operand".to_string())?;
        let address = match operand {
            Operand::Symbol(symbol) => match symbol {
                Symbol::Direct(address) => {
                    self.indirect.push(false);
                    OperandCollector::convert_address(address)
                }
                Symbol::Indirect(address) => {
                    self.indirect.push(true);
                    OperandCollector::convert_address(address)
                }
                Symbol::Reserved(address) => {
                    self.indirect.push(false);
                    Ok(address)
                }
                Symbol::Label(_) => Err("Expected address found label".to_string()),
            },
            Operand::Immediate(_) => Err("Expected address found numeric".to_string()),
        }?;
        self.extracted_operands.push(address);
        Ok(())
    }

    pub(crate) fn numeric_operand(&mut self) -> Result<(), String> {
        let operand = self.next_operand().ok_or("Missing operand".to_string())?;
        let immediate = match operand {
            Operand::Symbol(symbol) => match symbol {
                Symbol::Reserved(_) | Symbol::Indirect(_) | Symbol::Direct(_) => {
                    Err("Expected numeric found address".to_string())
                }
                Symbol::Label(_) => Err("Operand should not be a label".to_string()),
            },
            Operand::Immediate(value) => Ok(Immediate::Numeric(value)),
        }?;
        self.extracted_immediates.push(immediate);
        Ok(())
    }

    pub(crate) fn label_operand(&mut self) -> Result<(), String> {
        let operand = self.next_operand().ok_or("Missing operand".to_string())?;
        let immediate = match operand {
            Operand::Symbol(symbol) => match symbol {
                Symbol::Reserved(_) | Symbol::Indirect(_) | Symbol::Direct(_) => {
                    Err("Expected label found address".to_string())
                }
                Symbol::Label(label) => Ok(Immediate::Label(label)),
            },
            Operand::Immediate(_) => Err("Expected label found numeric".to_string()),
        }?;
        self.extracted_immediates.push(immediate);
        Ok(())
    }

    pub(crate) fn with_tag(&mut self) -> Result<(), String> {
        if self.parsed_opcode.tag.is_none() {
            return Err("Missing tag".to_string());
        }
        self.extracted_tag = true;
        Ok(())
    }

    pub(crate) fn finish(self) -> Result<OperandCollectionResult, String> {
        if self.operand_index < self.parsed_opcode.operands.len() {
            return Err("Too many operands".to_string());
        }
        if !self.extracted_tag && self.parsed_opcode.tag.is_some() {
            return Err("Extra tag".to_string());
        }
        Ok(OperandCollectionResult {
            operands: self.extracted_operands,
            indirect: self.indirect,
            immediates: self.extracted_immediates,
            tag: self.parsed_opcode.tag,
        })
    }
}
