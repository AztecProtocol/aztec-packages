import { WitnessMap } from '@noir-lang/acvm_js';

// See `simple_brillig_foreign_call` integration test in `acir/tests/test_program_serialization.rs`.
export const bytecode = Uint8Array.from([
  31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 173, 143, 49, 10, 0, 33, 16, 3, 227, 30, 28, 199, 85, 62, 69, 127, 224, 103, 44,
  108, 44, 68, 124, 191, 136, 10, 41, 196, 70, 167, 217, 37, 129, 144, 124, 0, 20, 58, 15, 253, 204, 212, 220, 184, 230,
  12, 171, 238, 101, 25, 238, 43, 99, 67, 227, 93, 244, 159, 252, 228, 135, 88, 124, 202, 187, 213, 140, 94, 249, 66,
  130, 96, 67, 5, 171, 116, 175, 175, 108, 1, 0, 0,
]);
export const initialWitnessMap: WitnessMap = new Map([
  [1, '0x0000000000000000000000000000000000000000000000000000000000000005'],
]);

export const oracleCallName = 'invert';
export const oracleCallInputs = [['0x0000000000000000000000000000000000000000000000000000000000000005']];

export const oracleResponse = ['0x135b52945a13d9aa49b9b57c33cd568ba9ae5ce9ca4a2d06e7f3fbd4c6666667'];

export const expectedWitnessMap = new Map([
  [1, '0x0000000000000000000000000000000000000000000000000000000000000005'],
  [2, '0x135b52945a13d9aa49b9b57c33cd568ba9ae5ce9ca4a2d06e7f3fbd4c6666667'],
]);
