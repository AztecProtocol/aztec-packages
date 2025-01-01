use std::fmt::{self, Display};
use std::fmt::{Debug, Formatter};

use acvm::acir::brillig::MemoryAddress;
use acvm::{AcirField, FieldElement};

use crate::opcodes::AvmOpcode;

/// A simple representation of an AVM instruction for the purpose
/// of generating an AVM bytecode from Brillig.
/// Note: this structure does not impose rules like "ADD instruction must have 3 operands"
/// That job is left to the instruction decoder, not this thin transpiler.
pub struct AvmInstruction {
    pub opcode: AvmOpcode,

    /// Any instructions with memory offset operands have the indirect flag
    /// Each bit is a boolean: 0:direct, 1:indirect
    /// The 0th bit corresponds to an instruction's 0th offset arg, 1st to 1st, etc...
    pub indirect: Option<AvmOperand>,

    /// Some instructions have a tag, its usage will depend on the instruction.
    /// Its usage will depend on the instruction.
    pub tag: Option<AvmTypeTag>,

    /// Different instructions have different numbers of operands. These operands contain
    /// memory addresses.
    pub operands: Vec<AvmOperand>,

    // Operands which are immediate, i.e., contain hardcoded constants.
    pub immediates: Vec<AvmOperand>,
}

impl Display for AvmInstruction {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "opcode {}", self.opcode.name())?;
        if let Some(indirect) = &self.indirect {
            write!(f, ", indirect: {}", indirect)?;
        }
        if !self.operands.is_empty() {
            write!(f, ", operands: [")?;
            for operand in &self.operands {
                write!(f, "{operand}, ")?;
            }
            write!(f, "]")?;
        };
        // This will be either inTag or dstTag depending on the operation
        if let Some(dst_tag) = self.tag {
            write!(f, ", tag: {}", dst_tag as u8)?;
        }
        if !self.immediates.is_empty() {
            write!(f, ", immediates: [")?;
            for immediate in &self.immediates {
                write!(f, "{immediate}, ")?;
            }
            write!(f, "]")?;
        };
        Ok(())
    }
}

impl AvmInstruction {
    /// Bytes representation for generating AVM bytecode
    /// Order: INDIRECT, OPERANDS, TAG, IMMEDIATES
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.push(self.opcode as u8);
        if let Some(indirect) = &self.indirect {
            bytes.extend_from_slice(&indirect.to_be_bytes());
        }
        for operand in &self.operands {
            bytes.extend_from_slice(&operand.to_be_bytes());
        }
        // This will be either inTag or dstTag depending on the operation
        if let Some(tag) = self.tag {
            bytes.extend_from_slice(&(tag as u8).to_be_bytes());
        }
        for immediate in &self.immediates {
            bytes.extend_from_slice(&immediate.to_be_bytes());
        }
        bytes
    }

    pub fn size(&self) -> usize {
        self.to_bytes().len()
    }
}

impl Debug for AvmInstruction {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "{self}")
    }
}

impl Default for AvmInstruction {
    fn default() -> Self {
        AvmInstruction {
            opcode: AvmOpcode::ADD_8,
            indirect: Some(AvmOperand::U8 { value: 0 }),
            tag: None,
            operands: vec![],
            immediates: vec![],
        }
    }
}

/// AVM instructions may include a type tag
#[allow(clippy::upper_case_acronyms, dead_code)]
#[derive(Copy, Clone, Debug)]
pub enum AvmTypeTag {
    FIELD,
    UINT1,
    UINT8,
    UINT16,
    UINT32,
    UINT64,
    UINT128,
    INVALID,
}

/// Operands are usually 8, 16 and 32 bits (offsets)
/// Immediates (as used by the SET instruction) can have different sizes
#[allow(non_camel_case_types)]
pub enum AvmOperand {
    U8 { value: u8 },
    U16 { value: u16 },
    U32 { value: u32 },
    U64 { value: u64 },
    U128 { value: u128 },
    FF { value: FieldElement },
    // Unresolved brillig pc that needs translation to a 16 bit byte-indexed PC.
    BRILLIG_LOCATION { brillig_pc: u32 },
}

impl Display for AvmOperand {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            AvmOperand::U8 { value } => write!(f, " U8:{}", value),
            AvmOperand::U16 { value } => write!(f, " U16:{}", value),
            AvmOperand::U32 { value } => write!(f, " U32:{}", value),
            AvmOperand::U64 { value } => write!(f, " U64:{}", value),
            AvmOperand::U128 { value } => write!(f, " U128:{}", value),
            AvmOperand::FF { value } => write!(f, " FF:{}", value),
            AvmOperand::BRILLIG_LOCATION { brillig_pc } => {
                write!(f, " BRILLIG_LOCATION:{}", brillig_pc)
            }
        }
    }
}

impl AvmOperand {
    pub fn to_be_bytes(&self) -> Vec<u8> {
        match self {
            AvmOperand::U8 { value } => value.to_be_bytes().to_vec(),
            AvmOperand::U16 { value } => value.to_be_bytes().to_vec(),
            AvmOperand::U32 { value } => value.to_be_bytes().to_vec(),
            AvmOperand::U64 { value } => value.to_be_bytes().to_vec(),
            AvmOperand::U128 { value } => value.to_be_bytes().to_vec(),
            AvmOperand::FF { value } => value.to_be_bytes(),
            AvmOperand::BRILLIG_LOCATION { brillig_pc } => brillig_pc.to_be_bytes().to_vec(),
        }
    }
}

#[derive(Debug, Default)]
pub(crate) struct AddressingModeBuilder {
    indirect: Vec<bool>,
    relative: Vec<bool>,
}

impl AddressingModeBuilder {
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

    pub(crate) fn build(self) -> AvmOperand {
        let num_operands = self.indirect.len();
        assert!(num_operands <= 8, "Too many operands for building addressing mode bytes");

        let mut result = 0;
        for (i, (indirect, relative)) in
            self.indirect.into_iter().zip(self.relative.into_iter()).enumerate()
        {
            if indirect {
                result |= 1 << i;
            }
            if relative {
                result |= 1 << (num_operands + i);
            }
        }

        if num_operands <= 4 {
            AvmOperand::U8 { value: result as u8 }
        } else {
            AvmOperand::U16 { value: result as u16 }
        }
    }
}
