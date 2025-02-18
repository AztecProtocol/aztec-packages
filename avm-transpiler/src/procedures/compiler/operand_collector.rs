use crate::procedures::parser::{Operand, Symbol};

// We should probably pull these constants from the noir compiler
const NUM_RESERVED_REGISTERS: usize = 3;
const MAX_STACK_FRAME_SIZE: usize = 2048;
const MAX_STACK_SIZE: usize = 16 * MAX_STACK_FRAME_SIZE;
const MAX_SCRATCH_SPACE: usize = 64;
const SCRATCH_SPACE_START: usize = NUM_RESERVED_REGISTERS + MAX_STACK_SIZE;

pub(crate) struct OperandCollectionResult {
    operands: Vec<usize>,
    indirect: Vec<bool>,
    immediates: Vec<Immediate>,
}

pub(crate) struct OperandCollector {
    parsed_opcode: ParsedOpcode,
    label_prefix: String,
    extracted_operands: Vec<usize>,
    operand_index: usize,
    indirect: Vec<bool>,
}

impl OperandCollector {
    pub(crate) fn new(parsed_opcode: ParsedOpcode, label_prefix: String) -> Self {
        OperandCollector {
            parsed_opcode,
            label_prefix,
            extracted_operands: vec![],
            indirect: vec![],
            operand_index: 0,
        }
    }

    fn next_operand(&mut self) -> Option<Operand> {
        if self.operand_index >= self.parsed_opcode.operands.len() {
            return None;
        }
        let operand = self.parsed_opcode.operands[self.operand_index];
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
                Symbol::Label(label) => Err("Operand should not be a label".to_string()),
            },
            Operand::Immediate(address) => Err("Operand should not be immediate".to_string()),
        }?;
        self.extracted_operands.push(address);
        Ok(())
    }

    pub(crate) fn finish(self) -> Result<(Vec<usize>, Vec<bool>), String> {
        if self.operand_index < self.parsed_opcode.operands.len() {
            return Err("Too many operands".to_string());
        }
        Ok((self.extracted_operands, self.indirect))
    }
}
