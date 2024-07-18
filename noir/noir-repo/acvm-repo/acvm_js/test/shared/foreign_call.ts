import { WitnessMap } from '@noir-lang/acvm_js';

// See `simple_brillig_foreign_call` integration test in `acir/tests/test_program_serialization.rs`.
export const bytecode = Uint8Array.from([
  31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 173, 80, 49, 10, 192, 32, 12, 52, 45, 45, 165, 155, 63, 209, 31, 248, 25, 7, 23, 7,
  17, 223, 175, 96, 2, 65, 131, 139, 30, 132, 75, 238, 224, 72, 2, 170, 227, 107, 5, 216, 63, 200, 52, 115, 144, 230,
  144, 205, 30, 44, 156, 203, 50, 124, 223, 107, 108, 128, 139, 106, 113, 217, 141, 252, 10, 30, 225, 103, 126, 136,
  197, 167, 188, 250, 149, 24, 49, 105, 90, 48, 42, 102, 64, 215, 189, 158, 1, 0, 0,
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
