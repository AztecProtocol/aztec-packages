use std::fmt::{self, Display};
use std::fmt::{Debug, Formatter};
use acvm::acir::brillig::MemoryAddress;
use acvm::{AcirField, FieldElement};
use crate::opcodes::AvmOpcode;

/// A simple representation of an AVM instruction for the purpose
/// of generating an AVM bytecode from Brillig.
/// Note: this structure does not impose rules like "ADD instruction must have 3 operands"
/// That job is left to the instruction decoder, not this thin transpiler.
#[derive(Debug)]
pub struct AvmInstruction {
    /// The operation code for this instruction
    pub opcode: AvmOpcode,
    /// Any instructions with memory offset operands have the indirect flag
    /// Each bit is a boolean: 0:direct, 1:indirect
    /// The 0th bit corresponds to an instruction's 0th offset arg, 1st to 1st, etc...
    pub indirect: Option<AvmOperand>,
    /// Some instructions have a tag, its usage will depend on the instruction.
    pub tag: Option<AvmTypeTag>,
    /// Different instructions have different numbers of operands. These operands contain
    /// memory addresses.
    pub operands: Vec<AvmOperand>,
    /// Operands which are immediate, i.e., contain hardcoded constants.
    pub immediates: Vec<AvmOperand>,
}

impl Display for AvmInstruction {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "opcode {}", self.opcode.name())?;
        
        if let Some(indirect) = &self.indirect {
            write!(f, ", indirect: {indirect}")?;
        }
        
        if !self.operands.is_empty() {
            write!(f, ", operands: [")?;
            for (i, operand) in self.operands.iter().enumerate() {
                if i > 0 {
                    write!(f, ", ")?;
                }
                write!(f, "{operand}")?;
            }
            write!(f, "]")?;
        }

        if let Some(tag) = self.tag {
            write!(f, ", tag: {}", tag as u8)?;
        }

        if !self.immediates.is_empty() {
            write!(f, ", immediates: [")?;
            for (i, immediate) in self.immediates.iter().enumerate() {
                if i > 0 {
                    write!(f, ", ")?;
                }
                write!(f, "{immediate}")?;
            }
            write!(f, "]")?;
        }

        Ok(())
    }
}

#[derive(Debug)]
pub(crate) struct AddressingModeBuilder {
    indirect: Vec<bool>,
    relative: Vec<bool>,
}

impl AddressingModeBuilder {
    pub(crate) fn new() -> Self {
        Self {
            indirect: Vec::new(),
            relative: Vec::new(),
        }
    }

    pub(crate) fn direct_operand(mut self, address: &MemoryAddress) -> Self {
        self.relative.push(address.is_relative());
        self.indirect.push(false);
        self
    }

    pub(crate) fn indirect_operand(mut self, address: &MemoryAddress) -> Self {
        self.relative.push(address.is_relative());
        self.indirect.push(true);
        self
    }

    pub(crate) fn build(self) -> Result<AvmOperand, &'static str> {
        let num_operands = self.indirect.len();
        if num_operands > 8 {
            return Err("Too many operands for building addressing mode bytes");
        }

        let mut result: u16 = 0;
        for (i, (indirect, relative)) in self.indirect.into_iter().zip(self.relative.into_iter()).enumerate() {
            if indirect {
                result |= 1 << i;
            }
            if relative {
                result |= 1 << (num_operands + i);
            }
        }

        Ok(if num_operands <= 4 {
            AvmOperand::U8 { value: result as u8 }
        } else {
            AvmOperand::U16 { value: result }
        })
    }
} 
