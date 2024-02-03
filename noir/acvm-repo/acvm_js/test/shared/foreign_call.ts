import { WitnessMap } from '@noir-lang/acvm_js';

// See `simple_brillig_foreign_call` integration test in `acir/tests/test_program_serialization.rs`.
export const bytecode = Uint8Array.from([
  31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 173, 143, 177, 10, 192, 32, 12, 68, 207, 148, 150, 118, 234, 175, 216, 63, 232,
  207, 116, 232, 226, 32, 226, 247, 171, 24, 33, 72, 112, 209, 7, 33, 199, 13, 199, 221, 9, 192, 160, 178, 9, 45, 105,
  222, 203, 223, 206, 241, 152, 117, 89, 86, 246, 37, 222, 80, 216, 149, 254, 141, 43, 223, 193, 250, 119, 241, 243, 97,
  180, 90, 75, 232, 189, 91, 243, 73, 24, 132, 1, 9, 251, 174, 12, 242, 132, 1, 0, 0,
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
