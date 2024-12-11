/// All AVM opcodes
/// Keep updated with TS, cpp, and docs protocol specs!
#[allow(clippy::upper_case_acronyms, dead_code, non_camel_case_types)]
#[derive(PartialEq, Copy, Clone, Debug, Eq, Hash)]
pub enum AvmOpcode {
    // Compute
    ADD_8,
    ADD_16,
    SUB_8,
    SUB_16,
    MUL_8,
    MUL_16,
    DIV_8,
    DIV_16,
    FDIV_8,
    FDIV_16,
    EQ_8,
    EQ_16,
    LT_8,
    LT_16,
    LTE_8,
    LTE_16,
    AND_8,
    AND_16,
    OR_8,
    OR_16,
    XOR_8,
    XOR_16,
    NOT_8,
    NOT_16,
    SHL_8,
    SHL_16,
    SHR_8,
    SHR_16,
    CAST_8,
    CAST_16,
    // Execution environment
    GETENVVAR_16,
    CALLDATACOPY,
    RETURNDATASIZE,
    RETURNDATACOPY,
    // Control flow
    JUMP_32,
    JUMPI_32,
    INTERNALCALL,
    INTERNALRETURN,
    // Memory
    SET_8,
    SET_16,
    SET_32,
    SET_64,
    SET_128,
    SET_FF,
    MOV_8,
    MOV_16,
    // World state
    SLOAD,
    SSTORE,
    NOTEHASHEXISTS,
    EMITNOTEHASH,
    NULLIFIEREXISTS,
    EMITNULLIFIER,
    L1TOL2MSGEXISTS,
    GETCONTRACTINSTANCE,
    EMITUNENCRYPTEDLOG,
    SENDL2TOL1MSG,
    // External calls
    CALL,
    STATICCALL,
    RETURN,
    REVERT_8,
    REVERT_16,
    // Misc
    DEBUGLOG,
    // Gadgets
    POSEIDON2,
    SHA256COMPRESSION,
    KECCAKF1600,
    ECADD,
    MSM,
    // Conversions
    TORADIXBE,
}

impl AvmOpcode {
    pub fn name(&self) -> &'static str {
        match self {
            // Compute
            // Compute - Arithmetic
            AvmOpcode::ADD_8 => "ADD_8",
            AvmOpcode::ADD_16 => "ADD_16",
            AvmOpcode::SUB_8 => "SUB_8",
            AvmOpcode::SUB_16 => "SUB_16",
            AvmOpcode::MUL_8 => "MUL_8",
            AvmOpcode::MUL_16 => "MUL_16",
            AvmOpcode::DIV_8 => "DIV_8",
            AvmOpcode::DIV_16 => "DIV_16",
            AvmOpcode::FDIV_8 => "FDIV_8",
            AvmOpcode::FDIV_16 => "FDIV_16",
            // Compute - Comparators
            AvmOpcode::EQ_8 => "EQ_8",
            AvmOpcode::EQ_16 => "EQ_16",
            AvmOpcode::LT_8 => "LT_8",
            AvmOpcode::LT_16 => "LT_16",
            AvmOpcode::LTE_8 => "LTE_8",
            AvmOpcode::LTE_16 => "LTE_16",
            // Compute - Bitwise
            AvmOpcode::AND_8 => "AND_8",
            AvmOpcode::AND_16 => "AND_16",
            AvmOpcode::OR_8 => "OR_8",
            AvmOpcode::OR_16 => "OR_16",
            AvmOpcode::XOR_8 => "XOR_8",
            AvmOpcode::XOR_16 => "XOR_16",
            AvmOpcode::NOT_8 => "NOT_8",
            AvmOpcode::NOT_16 => "NOT_16",
            AvmOpcode::SHL_8 => "SHL_8",
            AvmOpcode::SHL_16 => "SHL_16",
            AvmOpcode::SHR_8 => "SHR_8",
            AvmOpcode::SHR_16 => "SHR_16",
            // Compute - Type Conversions
            AvmOpcode::CAST_8 => "CAST_8",
            AvmOpcode::CAST_16 => "CAST_16",

            // Execution Environment
            AvmOpcode::GETENVVAR_16 => "GETENVVAR_16",
            // Execution Environment - Calldata
            AvmOpcode::CALLDATACOPY => "CALLDATACOPY",
            AvmOpcode::RETURNDATASIZE => "RETURNDATASIZE",
            AvmOpcode::RETURNDATACOPY => "RETURNDATACOPY",

            // Machine State
            // Machine State - Internal Control Flow
            AvmOpcode::JUMP_32 => "JUMP_32",
            AvmOpcode::JUMPI_32 => "JUMPI_32",
            AvmOpcode::INTERNALCALL => "INTERNALCALL",
            AvmOpcode::INTERNALRETURN => "INTERNALRETURN",
            // Machine State - Memory
            AvmOpcode::SET_8 => "SET_8",
            AvmOpcode::SET_16 => "SET_16",
            AvmOpcode::SET_32 => "SET_32",
            AvmOpcode::SET_64 => "SET_64",
            AvmOpcode::SET_128 => "SET_128",
            AvmOpcode::SET_FF => "SET_FF",
            AvmOpcode::MOV_8 => "MOV_8",
            AvmOpcode::MOV_16 => "MOV_16",

            // World State
            AvmOpcode::SLOAD => "SLOAD",   // Public Storage
            AvmOpcode::SSTORE => "SSTORE", // Public Storage
            AvmOpcode::NOTEHASHEXISTS => "NOTEHASHEXISTS", // Notes & Nullifiers
            AvmOpcode::EMITNOTEHASH => "EMITNOTEHASH", // Notes & Nullifiers
            AvmOpcode::NULLIFIEREXISTS => "NULLIFIEREXISTS", // Notes & Nullifiers
            AvmOpcode::EMITNULLIFIER => "EMITNULLIFIER", // Notes & Nullifiers
            AvmOpcode::L1TOL2MSGEXISTS => "L1TOL2MSGEXISTS", // Messages

            // Accrued Substate
            AvmOpcode::EMITUNENCRYPTEDLOG => "EMITUNENCRYPTEDLOG",
            AvmOpcode::SENDL2TOL1MSG => "SENDL2TOL1MSG",
            AvmOpcode::GETCONTRACTINSTANCE => "GETCONTRACTINSTANCE",

            // Control Flow - Contract Calls
            AvmOpcode::CALL => "CALL",
            AvmOpcode::STATICCALL => "STATICCALL",
            AvmOpcode::RETURN => "RETURN",
            AvmOpcode::REVERT_8 => "REVERT_8",
            AvmOpcode::REVERT_16 => "REVERT_16",

            // Misc
            AvmOpcode::DEBUGLOG => "DEBUGLOG",

            // Gadgets
            AvmOpcode::POSEIDON2 => "POSEIDON2",
            AvmOpcode::SHA256COMPRESSION => "SHA256COMPRESSION",
            AvmOpcode::KECCAKF1600 => "KECCAKF1600",
            AvmOpcode::ECADD => "ECADD",
            AvmOpcode::MSM => "MSM",
            // Conversions
            AvmOpcode::TORADIXBE => "TORADIXBE",
        }
    }
}
