import { WitnessMap } from '@noir-lang/acvm_js';

// See `simple_brillig_foreign_call` integration test in `acir/tests/test_program_serialization.rs`.
export const bytecode = Uint8Array.from([
  31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 173, 81, 203, 10, 128, 48, 12, 179, 19, 31, 3, 111, 254, 200, 246, 7, 254, 140, 7,
  47, 30, 68, 252, 126, 39, 182, 80, 70, 182, 203, 26, 40, 73, 3, 43, 9, 163, 238, 199, 156, 134, 88, 15, 204, 178, 107,
  136, 183, 49, 135, 54, 68, 178, 187, 21, 116, 94, 151, 11, 210, 102, 165, 152, 148, 247, 153, 255, 113, 111, 24, 214,
  131, 124, 134, 247, 227, 4, 58, 58, 208, 119, 73, 51, 178, 62, 206, 103, 191, 110, 244, 237, 250, 69, 105, 47, 249,
  43, 240, 37, 201, 11, 205, 95, 230, 87, 127, 2, 0, 0,
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
