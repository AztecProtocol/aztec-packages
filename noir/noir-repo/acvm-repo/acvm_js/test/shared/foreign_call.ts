import { WitnessMap } from '@noir-lang/acvm_js';

// See `simple_brillig_foreign_call` integration test in `acir/tests/test_program_serialization.rs`.
export const bytecode = Uint8Array.from([
  31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 173, 79, 73, 10, 128, 48, 12, 204, 136, 91, 193, 155, 31, 137, 63, 240, 51, 30,
  188, 120, 16, 241, 253, 22, 76, 32, 148, 182, 30, 204, 64, 200, 100, 66, 150, 1, 189, 24, 99, 64, 120, 39, 89, 107,
  11, 213, 86, 201, 252, 15, 11, 252, 118, 177, 253, 183, 73, 9, 172, 72, 21, 103, 234, 62, 100, 250, 173, 163, 243,
  144, 220, 117, 222, 207, 3, 213, 161, 119, 167, 24, 189, 240, 253, 184, 183, 243, 194, 199, 68, 169, 46, 233, 115,
  166, 247, 0, 1, 178, 238, 151, 120, 2, 0, 0,
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
