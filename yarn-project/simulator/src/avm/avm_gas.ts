import * as c from '@aztec/circuits.js/constants';

import { TypeTag } from './avm_memory_types.js';
import { InstructionExecutionError } from './errors.js';
import { Addressing, AddressingMode } from './opcodes/addressing_mode.js';
import { Opcode } from './serialization/instruction_serialization.js';

/** Gas counters in L1, L2, and DA. */
export type Gas = {
  l2Gas: number;
  daGas: number;
};

/** Maps a Gas struct to gasLeft properties. */
export function gasToGasLeft(gas: Gas) {
  return { l2GasLeft: gas.l2Gas, daGasLeft: gas.daGas };
}

/** Maps gasLeft properties to a gas struct. */
export function gasLeftToGas(gasLeft: { l2GasLeft: number; daGasLeft: number }) {
  return { l2Gas: gasLeft.l2GasLeft, daGas: gasLeft.daGasLeft };
}

/** Creates a new instance with all values set to zero except the ones set. */
export function makeGas(gasCost: Partial<Gas>) {
  return { ...EmptyGas, ...gasCost };
}

/** Sums together multiple instances of Gas. */
export function sumGas(...gases: Partial<Gas>[]) {
  return gases.reduce(
    (acc: Gas, gas) => ({
      l2Gas: acc.l2Gas + (gas.l2Gas ?? 0),
      daGas: acc.daGas + (gas.daGas ?? 0),
    }),
    EmptyGas,
  );
}

/** Multiplies a gas instance by a scalar. */
export function mulGas(gas: Partial<Gas>, scalar: number) {
  return { l2Gas: (gas.l2Gas ?? 0) * scalar, daGas: (gas.daGas ?? 0) * scalar };
}

/** Zero gas across all gas dimensions. */
export const EmptyGas: Gas = {
  l2Gas: 0,
  daGas: 0,
};

function makeCost(l2Gas: number, daGas: number): Gas {
  return { l2Gas, daGas };
}

/** Dimensions of gas usage: L1, L2, and DA. */
export const GAS_DIMENSIONS = ['l2Gas', 'daGas'] as const;

/** Base gas costs for each instruction. Additional gas cost may be added on top due to memory or storage accesses, etc. */
const BASE_GAS_COSTS: Record<Opcode, Gas> = {
  [Opcode.ADD_8]: makeCost(c.AVM_ADD_BASE_L2_GAS, 0),
  [Opcode.ADD_16]: makeCost(c.AVM_ADD_BASE_L2_GAS, 0),
  [Opcode.SUB_8]: makeCost(c.AVM_SUB_BASE_L2_GAS, 0),
  [Opcode.SUB_16]: makeCost(c.AVM_SUB_BASE_L2_GAS, 0),
  [Opcode.MUL_8]: makeCost(c.AVM_MUL_BASE_L2_GAS, 0),
  [Opcode.MUL_16]: makeCost(c.AVM_MUL_BASE_L2_GAS, 0),
  [Opcode.DIV_8]: makeCost(c.AVM_DIV_BASE_L2_GAS, 0),
  [Opcode.DIV_16]: makeCost(c.AVM_DIV_BASE_L2_GAS, 0),
  [Opcode.FDIV_8]: makeCost(c.AVM_FDIV_BASE_L2_GAS, 0),
  [Opcode.FDIV_16]: makeCost(c.AVM_FDIV_BASE_L2_GAS, 0),
  [Opcode.EQ_8]: makeCost(c.AVM_EQ_BASE_L2_GAS, 0),
  [Opcode.EQ_16]: makeCost(c.AVM_EQ_BASE_L2_GAS, 0),
  [Opcode.LT_8]: makeCost(c.AVM_LT_BASE_L2_GAS, 0),
  [Opcode.LT_16]: makeCost(c.AVM_LT_BASE_L2_GAS, 0),
  [Opcode.LTE_8]: makeCost(c.AVM_LTE_BASE_L2_GAS, 0),
  [Opcode.LTE_16]: makeCost(c.AVM_LTE_BASE_L2_GAS, 0),
  [Opcode.AND_8]: makeCost(c.AVM_AND_BASE_L2_GAS, 0),
  [Opcode.AND_16]: makeCost(c.AVM_AND_BASE_L2_GAS, 0),
  [Opcode.OR_8]: makeCost(c.AVM_OR_BASE_L2_GAS, 0),
  [Opcode.OR_16]: makeCost(c.AVM_OR_BASE_L2_GAS, 0),
  [Opcode.XOR_8]: makeCost(c.AVM_XOR_BASE_L2_GAS, 0),
  [Opcode.XOR_16]: makeCost(c.AVM_XOR_BASE_L2_GAS, 0),
  [Opcode.NOT_8]: makeCost(c.AVM_NOT_BASE_L2_GAS, 0),
  [Opcode.NOT_16]: makeCost(c.AVM_NOT_BASE_L2_GAS, 0),
  [Opcode.SHL_8]: makeCost(c.AVM_SHL_BASE_L2_GAS, 0),
  [Opcode.SHL_16]: makeCost(c.AVM_SHL_BASE_L2_GAS, 0),
  [Opcode.SHR_8]: makeCost(c.AVM_SHR_BASE_L2_GAS, 0),
  [Opcode.SHR_16]: makeCost(c.AVM_SHR_BASE_L2_GAS, 0),
  [Opcode.CAST_8]: makeCost(c.AVM_CAST_BASE_L2_GAS, 0),
  [Opcode.CAST_16]: makeCost(c.AVM_CAST_BASE_L2_GAS, 0),
  [Opcode.GETENVVAR_16]: makeCost(c.AVM_GETENVVAR_BASE_L2_GAS, 0),
  [Opcode.CALLDATACOPY]: makeCost(c.AVM_CALLDATACOPY_BASE_L2_GAS, 0),
  [Opcode.RETURNDATASIZE]: makeCost(c.AVM_RETURNDATASIZE_BASE_L2_GAS, 0),
  [Opcode.RETURNDATACOPY]: makeCost(c.AVM_RETURNDATACOPY_BASE_L2_GAS, 0),
  [Opcode.JUMP_32]: makeCost(c.AVM_JUMP_BASE_L2_GAS, 0),
  [Opcode.JUMPI_32]: makeCost(c.AVM_JUMPI_BASE_L2_GAS, 0),
  [Opcode.INTERNALCALL]: makeCost(c.AVM_INTERNALCALL_BASE_L2_GAS, 0),
  [Opcode.INTERNALRETURN]: makeCost(c.AVM_INTERNALRETURN_BASE_L2_GAS, 0),
  [Opcode.SET_8]: makeCost(c.AVM_SET_BASE_L2_GAS, 0),
  [Opcode.SET_16]: makeCost(c.AVM_SET_BASE_L2_GAS, 0),
  [Opcode.SET_32]: makeCost(c.AVM_SET_BASE_L2_GAS, 0),
  [Opcode.SET_64]: makeCost(c.AVM_SET_BASE_L2_GAS, 0),
  [Opcode.SET_128]: makeCost(c.AVM_SET_BASE_L2_GAS, 0),
  [Opcode.SET_FF]: makeCost(c.AVM_SET_BASE_L2_GAS, 0),
  [Opcode.MOV_8]: makeCost(c.AVM_MOV_BASE_L2_GAS, 0),
  [Opcode.MOV_16]: makeCost(c.AVM_MOV_BASE_L2_GAS, 0),
  [Opcode.SLOAD]: makeCost(c.AVM_SLOAD_BASE_L2_GAS, 0),
  [Opcode.SSTORE]: makeCost(c.AVM_SSTORE_BASE_L2_GAS, c.AVM_SSTORE_BASE_DA_GAS),
  [Opcode.NOTEHASHEXISTS]: makeCost(c.AVM_NOTEHASHEXISTS_BASE_L2_GAS, 0),
  [Opcode.EMITNOTEHASH]: makeCost(c.AVM_EMITNOTEHASH_BASE_L2_GAS, c.AVM_EMITNOTEHASH_BASE_DA_GAS),
  [Opcode.NULLIFIEREXISTS]: makeCost(c.AVM_NULLIFIEREXISTS_BASE_L2_GAS, 0),
  [Opcode.EMITNULLIFIER]: makeCost(c.AVM_EMITNULLIFIER_BASE_L2_GAS, c.AVM_EMITNULLIFIER_BASE_DA_GAS),
  [Opcode.L1TOL2MSGEXISTS]: makeCost(c.AVM_L1TOL2MSGEXISTS_BASE_L2_GAS, 0),
  [Opcode.EMITUNENCRYPTEDLOG]: makeCost(c.AVM_EMITUNENCRYPTEDLOG_BASE_L2_GAS, 0),
  [Opcode.SENDL2TOL1MSG]: makeCost(c.AVM_SENDL2TOL1MSG_BASE_L2_GAS, c.AVM_SENDL2TOL1MSG_BASE_DA_GAS),
  [Opcode.GETCONTRACTINSTANCE]: makeCost(c.AVM_GETCONTRACTINSTANCE_BASE_L2_GAS, 0),
  [Opcode.CALL]: makeCost(c.AVM_CALL_BASE_L2_GAS, 0),
  [Opcode.STATICCALL]: makeCost(c.AVM_STATICCALL_BASE_L2_GAS, 0),
  [Opcode.RETURN]: makeCost(c.AVM_RETURN_BASE_L2_GAS, 0),
  [Opcode.REVERT_8]: makeCost(c.AVM_REVERT_BASE_L2_GAS, 0),
  [Opcode.REVERT_16]: makeCost(c.AVM_REVERT_BASE_L2_GAS, 0),
  [Opcode.DEBUGLOG]: makeCost(c.AVM_DEBUGLOG_BASE_L2_GAS, 0),
  [Opcode.POSEIDON2]: makeCost(c.AVM_POSEIDON2_BASE_L2_GAS, 0),
  [Opcode.SHA256COMPRESSION]: makeCost(c.AVM_SHA256COMPRESSION_BASE_L2_GAS, 0),
  [Opcode.KECCAKF1600]: makeCost(c.AVM_KECCAKF1600_BASE_L2_GAS, 0),
  [Opcode.ECADD]: makeCost(c.AVM_ECADD_BASE_L2_GAS, 0),
  [Opcode.MSM]: makeCost(c.AVM_MSM_BASE_L2_GAS, 0),
  [Opcode.TORADIXBE]: makeCost(c.AVM_TORADIXBE_BASE_L2_GAS, 0),
};

const DYNAMIC_GAS_COSTS = new Map<Opcode, Gas>([
  [Opcode.CALLDATACOPY, makeCost(c.AVM_CALLDATACOPY_DYN_L2_GAS, 0)],
  [Opcode.RETURNDATACOPY, makeCost(c.AVM_RETURNDATACOPY_DYN_L2_GAS, 0)],
  [Opcode.EMITUNENCRYPTEDLOG, makeCost(c.AVM_EMITUNENCRYPTEDLOG_DYN_L2_GAS, c.AVM_EMITUNENCRYPTEDLOG_DYN_DA_GAS)],
  [Opcode.CALL, makeCost(c.AVM_CALL_DYN_L2_GAS, 0)],
  [Opcode.STATICCALL, makeCost(c.AVM_STATICCALL_DYN_L2_GAS, 0)],
  [Opcode.RETURN, makeCost(c.AVM_RETURN_DYN_L2_GAS, 0)],
  [Opcode.REVERT_8, makeCost(c.AVM_REVERT_DYN_L2_GAS, 0)],
  [Opcode.REVERT_16, makeCost(c.AVM_REVERT_DYN_L2_GAS, 0)],
  [Opcode.DEBUGLOG, makeCost(c.AVM_DEBUGLOG_DYN_L2_GAS, 0)],
  [Opcode.MSM, makeCost(c.AVM_MSM_DYN_L2_GAS, 0)],
  [Opcode.TORADIXBE, makeCost(c.AVM_TORADIXBE_DYN_L2_GAS, 0)],
]);

/** Returns the fixed base gas cost for a given opcode. */
export function getBaseGasCost(opcode: Opcode): Gas {
  return BASE_GAS_COSTS[opcode];
}

export function getDynamicGasCost(opcode: Opcode): Gas {
  return DYNAMIC_GAS_COSTS.has(opcode) ? DYNAMIC_GAS_COSTS.get(opcode)! : makeCost(0, 0);
}

/** Returns the gas cost associated with the memory operations performed. */
export function getMemoryGasCost(args: { reads?: number; writes?: number; indirect?: number }) {
  const { reads, writes, indirect } = args;
  const indirectCount = Addressing.fromWire(indirect ?? 0).count(AddressingMode.INDIRECT);
  const l2MemoryGasCost =
    (reads ?? 0) * GAS_COST_CONSTANTS.MEMORY_READ +
    (writes ?? 0) * GAS_COST_CONSTANTS.MEMORY_WRITE +
    indirectCount * GAS_COST_CONSTANTS.MEMORY_INDIRECT_READ_PENALTY;
  return makeGas({ l2Gas: l2MemoryGasCost });
}

/** Constants used in base cost calculations. */
export const GAS_COST_CONSTANTS = {
  MEMORY_READ: 10,
  MEMORY_INDIRECT_READ_PENALTY: 10,
  MEMORY_WRITE: 100,
};

/** Returns gas cost for an operation on a given type tag based on the base cost per byte. */
export function getGasCostForTypeTag(tag: TypeTag, baseCost: Gas) {
  return mulGas(baseCost, getGasCostMultiplierFromTypeTag(tag));
}

/** Returns a multiplier based on the size of the type represented by the tag. Throws on uninitialized or invalid. */
function getGasCostMultiplierFromTypeTag(tag: TypeTag) {
  switch (tag) {
    case TypeTag.UINT1: // same as u8
      return 1;
    case TypeTag.UINT8:
      return 1;
    case TypeTag.UINT16:
      return 2;
    case TypeTag.UINT32:
      return 4;
    case TypeTag.UINT64:
      return 8;
    case TypeTag.UINT128:
      return 16;
    case TypeTag.FIELD:
      return 32;
    case TypeTag.INVALID:
      throw new InstructionExecutionError(`Invalid tag type for gas cost multiplier: ${TypeTag[tag]}`);
  }
}
