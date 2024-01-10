// import { AVMInstruction, Opcode } from '../opcodes.js';


// // function addExample(addArg0, addArg1) {
// //  return addArg0 + addArg1;
// //}
// const addExample = [
//   // Get calldata size and store at M[0]
//   new AVMInstruction(Opcode.CALLDATASIZE, 0, 0, 0, 0), // SET M[0] = CD.length
//   // Copy calldata to memory starting at M[1]
//   new AVMInstruction(Opcode.CALLDATACOPY, 1, 0, 0, 0), // M[1:1+M[0]] = calldata[0+M[0]]);
//   // Add args and store at M[10]
//   new AVMInstruction(Opcode.ADD, 10, 0, 1, 2), // M[10] = M[1] + M[2]
//   // set return size to 1
//   new AVMInstruction(Opcode.SET, 20, 0, 1, 0), // SET M[20] = 1
//   new AVMInstruction(Opcode.RETURN, 0, 0, 10, 20), // return M[10]
// ];
// export const addBytecode = AVMInstruction.toBytecode(addExample);

// // function storageExample(addArg0, slotArg) {
// //  S[slotArg] = addArg0 + S[slotArg];
// //  return S[slotArg];
// //}
// const storageExample = [
//   // Get calldata size and store at M[0]
//   new AVMInstruction(Opcode.CALLDATASIZE, 0, 0, 0, 0), // SET M[0] = CD.length
//   // Copy calldata to memory starting at M[1]
//   new AVMInstruction(Opcode.CALLDATACOPY, 1, 0, 0, 0), // M[1:1+M[0]] = calldata[0+M[0]]);
//   // Arg1 species storage slot to load from (S[M[2]])
//   // load it into M[3]
//   new AVMInstruction(Opcode.SLOAD, 3, 0, 2, 0), // M[3] = S[M[2]]
//   // Add arg0 to value loaded from storage. Store result to memory at M[10].
//   new AVMInstruction(Opcode.ADD, 10, 0, 1, 3), // M[10] = M[1] + M[2]
//   // store results of ADD to the same storage slot S[M[2]]
//   new AVMInstruction(Opcode.SSTORE, 2, 0, 10, 0), // S[M[2]] = M[10]
//   // load the same word from storage (S[M[2]]) that was just written.
//   // store word to memory (M[4])
//   // (should now have value stored above)
//   new AVMInstruction(Opcode.SLOAD, 4, 0, 2, 0), // M[4] = S[M[2]]
//   // set return size to 1
//   new AVMInstruction(Opcode.SET, 20, 0, 1, 0), // SET M[20] = 1
//   // return the word loaded from storage (should match ADD output)
//   new AVMInstruction(Opcode.RETURN, 0, 0, 4, 20), // return M[4]
// ];
// export const storageBytecode = AVMInstruction.toBytecode(storageExample);

// // Make nested call to the specified address with some args
// // return nested call results
// //function nestedCallExample(targetAddr, [nestedCallArgs]) {
// //  gas = 1234
// //  return CALL(gas, targetAddr, nestedCallArgs)
// //}
// const nestedCallExample = [
//   // Get calldata size and store at M[0]
//   new AVMInstruction(Opcode.CALLDATASIZE, 0, 0, 0, 0), // SET M[0] = CD.length
//   // Copy calldata to memory starting at M[1]
//   new AVMInstruction(Opcode.CALLDATACOPY, 1, 0, 0, 0), // M[1:1+M[0]] = calldata[0+M[0]]);
//   // gas limit for CALL
//   new AVMInstruction(Opcode.SET, 100, 0, 1234, 0), //  SET M[100] = 1234
//   // Populate M[10,11,12,13] with the argsOffset, argsSize, retOffset, retSize for CALL
//   // argsOffset for CALL: M[2] because M[0] is calldatasize and M[1] is targetAddress (arg0 to top call)
//   new AVMInstruction(Opcode.SET, 10, 0, 2, 0), //  SET M[10] = 2 (points to second arg)
//   // const 1 for subtraction below
//   new AVMInstruction(Opcode.SET, 20, 0, 1, 0), // SET M[10] = 1
//   // argsSize for CALL: CALLDATASIZE - 1
//   // - args/calldata for nested call is pretty much the same as this call's calldata
//   //   but we don't forward the nested call address
//   new AVMInstruction(Opcode.SUB, 11, 0, 0, 20), // SET M[11] = M[0] - 1
//   // ReturnData will be one word and will be placed at M[200]
//   // retOffset for CALL: where will returnData go
//   new AVMInstruction(Opcode.SET, 12, 0, 200, 0), // SET M[12] = M[200]
//   // retSize for CALL: just one return field
//   new AVMInstruction(Opcode.SET, 13, 0, 1, 0), // SET M[13] = 1
//   // register 14 will contain the argsAndRetOffset (points to address 10 where M[10,11,12,13] contain argsOffset, argsSize, retOffset, retSize)
//   new AVMInstruction(Opcode.SET, 14, 0, 10, 0), // SET M[14] = 10
//   // Make a nested CALL with:
//   // - gas: M[100] (1234)
//   // - targetAddress: M[1]
//   // - argsAndRetOffset: M[14] (10 which points to M[10,11,12,13] containing argsOffset, argsSize, retOffset, retSize
//   new AVMInstruction(Opcode.CALL, 0, 14, 100, 1),
//   // TODO: add support for RETURNDATASIZE/COPY
//   new AVMInstruction(Opcode.RETURN, 0, 0, 200, 13), // return M[200] (size 1 from M[13])
// ];
// export const nestedCallBytecode = AVMInstruction.toBytecode(nestedCallExample);
