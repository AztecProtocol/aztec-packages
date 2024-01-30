import { WitnessMap } from '@noir-lang/acvm_js';

// See `simple_brillig_foreign_call` integration test in `acir/tests/test_program_serialization.rs`.
export const bytecode = Uint8Array.from([
  31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 173, 143, 49, 10, 0, 33, 16, 3, 227, 30, 28, 119, 191, 209, 31, 248, 25, 11, 27,
  11, 17, 223, 175, 160, 66, 44, 180, 209, 129, 101, 195, 46, 132, 228, 3, 160, 208, 120, 72, 51, 227, 102, 251, 214,
  103, 24, 117, 207, 75, 115, 94, 161, 172, 127, 157, 183, 107, 31, 178, 139, 105, 215, 108, 66, 232, 41, 88, 83, 0,
  161, 242, 101, 235, 59, 1, 0, 0,
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
