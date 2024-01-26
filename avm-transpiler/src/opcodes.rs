/**
 * All AVM opcodes
 */
#[derive(Copy, Clone)]
pub enum AvmOpcode {
  // Compute
  // Compute - Arithmetic
  ADD,
  SUB,
  MUL,
  DIV,
  // Compute - Comparators
  EQ,
  LT,
  LTE,
  // Compute - Bitwise
  AND,
  OR,
  XOR,
  NOT,
  SHL,
  SHR,
  // Compute - Type Conversions
  CAST,

  // Execution Environment
  ADDRESS,
  STORAGEADDRESS,
  ORIGIN,
  SENDER,
  PORTAL,
  FEEPERL1GAS,
  FEEPERL2GAS,
  FEEPERDAGAS,
  CONTRACTCALLDEPTH,
  // Execution Environment - Globals
  CHAINID,
  VERSION,
  BLOCKNUMBER,
  TIMESTAMP,
  COINBASE,
  BLOCKL1GASLIMIT,
  BLOCKL2GASLIMIT,
  BLOCKDAGASLIMIT,
  // Execution Environment - Calldata
  CALLDATACOPY,

  // Machine State
  // Machine State - Gas
  L1GASLEFT,
  L2GASLEFT,
  DAGASLEFT,
  // Machine State - Internal Control Flow
  JUMP,
  JUMPI,
  INTERNALCALL,
  INTERNALRETURN,
  // Machine State - Memory
  SET,
  MOV,
  CMOV,

  // World State
  BLOCKHEADERBYNUMBER,
  SLOAD, // Public Storage
  SSTORE, // Public Storage
  READL1TOL2MSG, // Messages
  SENDL2TOL1MSG, // Messages
  EMITNOTEHASH, // Notes & Nullifiers
  EMITNULLIFIER, // Notes & Nullifiers

  // Accrued Substate
  EMITUNENCRYPTEDLOG,

  // Control Flow - Contract Calls
  CALL,
  STATICCALL,
  RETURN,
  REVERT,

  // Gadgets
  KECCAK,
  POSEIDON,
}

impl AvmOpcode {
    pub fn name(&self) -> &'static str {
        match self {
            // Compute
            // Compute - Arithmetic
            AvmOpcode::ADD => "ADD",
            AvmOpcode::SUB => "SUB",
            AvmOpcode::MUL => "MUL",
            AvmOpcode::DIV => "DIV",
            // Compute - Comparators
            AvmOpcode::EQ => "EQ",
            AvmOpcode::LT => "LT",
            AvmOpcode::LTE => "LTE",
            // Compute - Bitwise
            AvmOpcode::AND => "AND",
            AvmOpcode::OR => "OR",
            AvmOpcode::XOR => "XOR",
            AvmOpcode::NOT => "NOT",
            AvmOpcode::SHL => "SHL",
            AvmOpcode::SHR => "SHR",
            // Compute - Type Conversions
            AvmOpcode::CAST => "CAST",

            // Execution Environment
            AvmOpcode::ADDRESS => "ADDRESS",
            AvmOpcode::STORAGEADDRESS => "STORAGEADDRESS",
            AvmOpcode::ORIGIN => "ORIGIN",
            AvmOpcode::SENDER => "SENDER",
            AvmOpcode::PORTAL => "PORTAL",
            AvmOpcode::FEEPERL1GAS => "FEEPERL1GAS",
            AvmOpcode::FEEPERL2GAS => "FEEPERL2GAS",
            AvmOpcode::FEEPERDAGAS => "FEEPERDAGAS",
            AvmOpcode::CONTRACTCALLDEPTH => "CONTRACTCALLDEPTH",
            // Execution Environment - Globals
            AvmOpcode::CHAINID => "CHAINID",
            AvmOpcode::VERSION => "VERSION",
            AvmOpcode::BLOCKNUMBER => "BLOCKNUMBER",
            AvmOpcode::TIMESTAMP => "TIMESTAMP",
            AvmOpcode::COINBASE => "COINBASE",
            AvmOpcode::BLOCKL1GASLIMIT => "BLOCKL1GASLIMIT",
            AvmOpcode::BLOCKL2GASLIMIT => "BLOCKL2GASLIMIT",
            AvmOpcode::BLOCKDAGASLIMIT => "BLOCKDAGASLIMIT",
            // Execution Environment - Calldata
            AvmOpcode::CALLDATACOPY => "CALLDATACOPY",

            // Machine State
            // Machine State - Gas
            AvmOpcode::L1GASLEFT => "L1GASLEFT",
            AvmOpcode::L2GASLEFT => "L2GASLEFT",
            AvmOpcode::DAGASLEFT => "DAGASLEFT",
            // Machine State - Internal Control Flow
            AvmOpcode::JUMP => "JUMP",
            AvmOpcode::JUMPI => "JUMPI",
            AvmOpcode::INTERNALCALL => "INTERNALCALL",
            AvmOpcode::INTERNALRETURN => "INTERNALRETURN",
            // Machine State - Memory
            AvmOpcode::SET => "SET",
            AvmOpcode::MOV => "MOV",
            AvmOpcode::CMOV => "CMOV",

            // World State
            AvmOpcode::BLOCKHEADERBYNUMBER => "BLOCKHEADERBYNUMBER",
            AvmOpcode::SLOAD => "SLOAD", // Public Storage
            AvmOpcode::SSTORE => "SSTORE", // Public Storage
            AvmOpcode::READL1TOL2MSG => "READL1TOL2MSG", // Messages
            AvmOpcode::SENDL2TOL1MSG => "SENDL2TOL1MSG", // Messages
            AvmOpcode::EMITNOTEHASH => "EMITNOTEHASH", // Notes & Nullifiers
            AvmOpcode::EMITNULLIFIER => "EMITNULLIFIER", // Notes & Nullifiers

            // Accrued Substate
            AvmOpcode::EMITUNENCRYPTEDLOG => "EMITUNENCRYPTEDLOG",

            // Control Flow - Contract Calls
            AvmOpcode::CALL => "CALL",
            AvmOpcode::STATICCALL => "STATICCALL",
            AvmOpcode::RETURN => "RETURN",
            AvmOpcode::REVERT => "REVERT",

            // Gadgets
            AvmOpcode::KECCAK => "KECCAK",
            AvmOpcode::POSEIDON => "POSEIDON",
        }
    }
}

#[derive(Copy, Clone)]
pub enum AvmTypeTag {
    UNINITIALIZED,
    UINT8,
    UINT16,
    UINT32,
    UINT64,
    UINT128,
    FIELD,
    INVALID,
  }

pub const ZEROTH_OPERAND_INDIRECT: u8 = 0b00000001;
pub const FIRST_OPERAND_INDIRECT: u8 = 0b00000010;
pub const ZEROTH_FIRST_OPERANDS_INDIRECT: u8 = 0b00000011;

pub enum AvmOperand {
    U32 {
        value: u32,
    },
    U64 {
        value: u64,
    },
    U128 {
        value: u128
    },
}
impl AvmOperand {
    pub fn to_string(&self) -> String {
        match self {
            AvmOperand::U32 { value } => format!(" U32:{}", value),
            AvmOperand::U64 { value } => format!(" U64:{}", value),
            AvmOperand::U128 { value } => format!("U128:{}", value),
        }
    }
    pub fn to_be_bytes(&self) -> Vec<u8> {
        match self {
            AvmOperand::U32 { value } => value.to_be_bytes().to_vec(),
            AvmOperand::U64 { value } => value.to_be_bytes().to_vec(),
            AvmOperand::U128 { value } => value.to_be_bytes().to_vec(),
        }
    }
}

pub struct AvmInstruction {
    pub opcode: AvmOpcode,
    pub indirect: Option<u8>, // bit field (0: direct, 1: indirect) - 0th bit is 0th offset arg, etc
    pub dst_tag: Option<AvmTypeTag>,
    pub operands: Vec<AvmOperand>,
}
impl AvmInstruction {
    pub fn to_string(&self) -> String {
        let mut out_str = format!("opcode {}", self.opcode.name());
        if let Some(indirect) = self.indirect {
            out_str += format!(", indirect: {}", indirect).as_str();
        }
        if let Some(dst_tag) = self.dst_tag {
            out_str += format!(", dst_tag: {}", dst_tag as u8).as_str();
        }
        if self.operands.len() > 0 {
            out_str += ", operands: [";
            for operand in &self.operands {
                out_str += format!("{}, ", operand.to_string()).as_str();
            }
            out_str += "]";
        }
        out_str
    }
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.push(self.opcode as u8);
        if let Some(indirect) = self.indirect {
            bytes.push(indirect);
        }
        if let Some(dst_tag) = self.dst_tag {
            // FIXME: should be u8! Update when TS updates.
            //bytes.push(dst_tag as u8);
            bytes.extend_from_slice(&(dst_tag as u32).to_be_bytes());
        }
        for operand in &self.operands {
            bytes.extend_from_slice(&operand.to_be_bytes());
        }
        bytes
    }
}
impl Default for AvmInstruction {
    fn default() -> Self {
        AvmInstruction {
            opcode: AvmOpcode::ADD,
            // TODO: default to Some(0), since all instructions have indirect flag except jumps
            indirect: None,
            dst_tag: None,
            operands: vec![],
        }
    }
}
