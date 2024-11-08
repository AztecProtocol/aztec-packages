import { WitnessMap } from '@noir-lang/acvm_js';

// See `simple_brillig_foreign_call` integration test in `acir/tests/test_program_serialization.rs`.
export const bytecode = Uint8Array.from([
  31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 149, 78, 203, 10, 192, 32, 12, 107, 54, 246, 16, 118, 219, 15, 236, 231, 118, 216,
  101, 135, 49, 252, 126, 5, 91, 80, 241, 81, 3, 197, 52, 49, 109, 65, 1, 187, 47, 48, 95, 248, 149, 62, 134, 104, 23,
  169, 0, 232, 255, 38, 251, 166, 156, 32, 22, 27, 97, 57, 222, 20, 252, 89, 127, 12, 76, 54, 119, 48, 79, 91, 199, 151,
  185, 135, 175, 149, 249, 243, 218, 251, 251, 209, 73, 212, 250, 154, 126, 22, 60, 7, 12, 47, 88, 88, 247, 1, 0, 0,
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
