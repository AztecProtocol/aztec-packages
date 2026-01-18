# Instruction Set: Quick Reference

Quick reference for all Aztec Virtual Machine (AVM) opcodes.

## Supporting Materials

Before diving into the instruction set, familiarize yourself with these core concepts:

- **[Introduction](README.md)**: What is the AVM and why do we need it?
- **[State](state.md)**: World state (persistent) vs execution state (transient)
- **[Memory Model](memory.md)**: Memory notation and tagged memory (`M[x]` and `T[x]`)
- **[Addressing Modes](addressing.md)**: Direct, indirect, and relative addressing along with their gas implications
- **[Execution Lifecycle](execution-lifecycle.md)**: VM initialization, PC rules, halting, gas charging order
- **[Gas Metering](gas.md)**: How L2 and DA gas costs are calculated and charged during instruction execution
- **[Errors](errors.md)**: Error types, triggers, and gas/state behavior
- **[Wire Formats](wire-format.md)**: How instructions are encoded in bytecode and why opcodes have variants like `ADD_8` and `ADD_16`

## Quick Reference

Click on an opcode name to view its detailed documentation.

* **[🔗ADD](opcodes/add.md)**: Addition (a + b)
    * Opcodes `0x00`-`0x01` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] + M[bOffset]
    ```
* **[🔗SUB](opcodes/sub.md)**: Subtraction (a - b)
    * Opcodes `0x02`-`0x03` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] - M[bOffset]
    ```
* **[🔗MUL](opcodes/mul.md)**: Multiplication (a * b)
    * Opcodes `0x04`-`0x05` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] * M[bOffset]
    ```
* **[🔗DIV](opcodes/div.md)**: Integer division (a / b)
    * Opcodes `0x06`-`0x07` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] / M[bOffset]
    ```
* **[🔗FDIV](opcodes/fdiv.md)**: Field division (a / b)
    * Opcodes `0x08`-`0x09` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] / M[bOffset]
    ```
* **[🔗EQ](opcodes/eq.md)**: Equality check (a == b)
    * Opcodes `0x0A`-`0x0B` (2 wire formats)
    ```javascript
    M[dstOffset] = (M[aOffset] == M[bOffset]) ? 1 : 0
    ```
* **[🔗LT](opcodes/lt.md)**: Less than (a &lt; b)
    * Opcodes `0x0C`-`0x0D` (2 wire formats)
    ```javascript
    M[dstOffset] = (M[aOffset] < M[bOffset]) ? 1 : 0
    ```
* **[🔗LTE](opcodes/lte.md)**: Less than or equal (a &lt;= b)
    * Opcodes `0x0E`-`0x0F` (2 wire formats)
    ```javascript
    M[dstOffset] = (M[aOffset] <= M[bOffset]) ? 1 : 0
    ```
* **[🔗AND](opcodes/and.md)**: Bitwise AND (a &amp; b)
    * Opcodes `0x10`-`0x11` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] & M[bOffset]
    ```
* **[🔗OR](opcodes/or.md)**: Bitwise OR (a | b)
    * Opcodes `0x12`-`0x13` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] | M[bOffset]
    ```
* **[🔗XOR](opcodes/xor.md)**: Bitwise XOR (a ^ b)
    * Opcodes `0x14`-`0x15` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] ^ M[bOffset]
    ```
* **[🔗NOT](opcodes/not.md)**: Bitwise NOT (~a)
    * Opcodes `0x16`-`0x17` (2 wire formats)
    ```javascript
    M[dstOffset] = ~M[srcOffset]
    ```
* **[🔗SHL](opcodes/shl.md)**: Shift left (a &lt;&lt; b)
    * Opcodes `0x18`-`0x19` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] << M[bOffset]
    ```
* **[🔗SHR](opcodes/shr.md)**: Shift right (a &gt;&gt; b)
    * Opcodes `0x1A`-`0x1B` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] >> M[bOffset]
    ```
* **[🔗CAST](opcodes/cast.md)**: Type cast memory value
    * Opcodes `0x1C`-`0x1D` (2 wire formats)
    ```javascript
    M[dstOffset] = M[srcOffset] as tag
    ```
* **[🔗GETENVVAR](opcodes/getenvvar.md)**: Get environment variable
    * Opcode `0x1E`
    ```javascript
    M[dstOffset] = environmentVariable[varEnum]
    ```
* **[🔗CALLDATACOPY](opcodes/calldatacopy.md)**: Copy calldata to memory
    * Opcode `0x1F`
    ```javascript
    M[dstOffset:dstOffset+M[copySizeOffset]] = calldata[M[cdStartOffset]:M[cdStartOffset]+M[copySizeOffset]]
    ```
* **[🔗SUCCESSCOPY](opcodes/successcopy.md)**: Get success status of latest external call
    * Opcode `0x20`
    ```javascript
    M[dstOffset] = nestedCallSuccess ? 1 : 0
    ```
* **[🔗RETURNDATASIZE](opcodes/returndatasize.md)**: Get returndata size
    * Opcode `0x21`
    ```javascript
    M[dstOffset] = nestedReturndata.length
    ```
* **[🔗RETURNDATACOPY](opcodes/returndatacopy.md)**: Copy returndata to memory
    * Opcode `0x22`
    ```javascript
    M[dstOffset:dstOffset+M[copySizeOffset]] = nestedReturndata[M[rdStartOffset]:M[rdStartOffset]+M[copySizeOffset]]
    ```
* **[🔗JUMP](opcodes/jump.md)**: Unconditional jump
    * Opcode `0x23`
    ```javascript
    PC = jumpOffset
    ```
* **[🔗JUMPI](opcodes/jumpi.md)**: Conditional jump
    * Opcode `0x24`
    ```javascript
    if M[condOffset] != 0 then PC = loc else PC = PC + instructionSize
    ```
* **[🔗INTERNALCALL](opcodes/internalcall.md)**: Internal function call
    * Opcode `0x25`
    ```javascript
    internalCallStack.push({callPc: PC, returnPc: PC + instructionSize}); PC = loc
    ```
* **[🔗INTERNALRETURN](opcodes/internalreturn.md)**: Return from internal call
    * Opcode `0x26`
    ```javascript
    PC = internalCallStack.pop().returnPc
    ```
* **[🔗SET](opcodes/set.md)**: Set memory to immediate value
    * Opcodes `0x27`-`0x2C` (6 wire formats)
    ```javascript
    M[dstOffset] = value
    ```
* **[🔗MOV](opcodes/mov.md)**: Move value between memory locations
    * Opcodes `0x2D`-`0x2E` (2 wire formats)
    ```javascript
    M[dstOffset] = M[srcOffset]
    ```
* **[🔗SLOAD](opcodes/sload.md)**: Load value from public storage
    * Opcode `0x2F`
    ```javascript
    M[dstOffset] = storage[contractAddress][M[slotOffset]]
    ```
* **[🔗SSTORE](opcodes/sstore.md)**: Store value to public storage
    * Opcode `0x30`
    ```javascript
    storage[contractAddress][M[slotOffset]] = M[srcOffset]
    ```
* **[🔗NOTEHASHEXISTS](opcodes/notehashexists.md)**: Check existence of note hash
    * Opcode `0x31`
    ```javascript
    M[existsOffset] = noteHashTree.exists(M[noteHashOffset], M[leafIndexOffset]) ? 1 : 0
    ```
* **[🔗EMITNOTEHASH](opcodes/emitnotehash.md)**: Emit note hash
    * Opcode `0x32`
    ```javascript
    noteHashes.append(M[noteHashOffset])
    ```
* **[🔗NULLIFIEREXISTS](opcodes/nullifierexists.md)**: Check existence of nullifier
    * Opcode `0x33`
    ```javascript
    M[existsOffset] = nullifierTree.exists(M[addressOffset], M[nullifierOffset]) ? 1 : 0
    ```
* **[🔗EMITNULLIFIER](opcodes/emitnullifier.md)**: Emit nullifier
    * Opcode `0x34`
    ```javascript
    nullifiers.append(M[nullifierOffset])
    ```
* **[🔗L1TOL2MSGEXISTS](opcodes/l1tol2msgexists.md)**: Check existence of L1-to-L2 message
    * Opcode `0x35`
    ```javascript
    M[existsOffset] = l1ToL2Messages.exists(M[msgHashOffset], M[msgLeafIndexOffset]) ? 1 : 0
    ```
* **[🔗GETCONTRACTINSTANCE](opcodes/getcontractinstance.md)**: Get contract instance information
    * Opcode `0x36`
    ```javascript
    M[dstOffset] = contractInstance.exists ? 1 : 0; M[dstOffset+1] = contractInstance[memberEnum]
    ```
* **[🔗EMITUNENCRYPTEDLOG](opcodes/emitunencryptedlog.md)**: Emit public log
    * Opcode `0x37`
    ```javascript
    unencryptedLogs.append(M[logOffset:logOffset+M[logSizeOffset]])
    ```
* **[🔗SENDL2TOL1MSG](opcodes/sendl2tol1msg.md)**: Send L2-to-L1 message
    * Opcode `0x38`
    ```javascript
    l2ToL1Messages.append({recipient: M[recipientOffset], content: M[contentOffset]})
    ```
* **[🔗CALL](opcodes/call.md)**: Call external contract
    * Opcode `0x39`
    ```javascript
    nestedCallResult = executeContract(
        /*address=*/M[addrOffset],
        /*args=*/M[argsOffset:argsOffset+M[argsSizeOffset]],
        {l2Gas: M[l2GasOffset], daGas: M[daGasOffset]}
    )
    ```
* **[🔗STATICCALL](opcodes/staticcall.md)**: Static call to external contract
    * Opcode `0x3A`
    ```javascript
    nestedCallResult = executeContractStatic(
        /*address=*/M[addrOffset],
        /*args=*/M[argsOffset:argsOffset+M[argsSizeOffset]],
        {l2Gas: M[l2GasOffset], daGas: M[daGasOffset]}
    )
    ```
* **[🔗RETURN](opcodes/return.md)**: Return from call
    * Opcode `0x3B`
    ```javascript
    return M[returnOffset:returnOffset+M[returnSizeOffset]]; halt
    ```
* **[🔗REVERT](opcodes/revert.md)**: Revert execution
    * Opcodes `0x3C`-`0x3D` (2 wire formats)
    ```javascript
    revert M[returnOffset:returnOffset+M[retSizeOffset]]; halt
    ```
* **[🔗DEBUGLOG](opcodes/debuglog.md)**: Output debug log
    * Opcode `0x3E`
    ```javascript
    debugLog(level, message, M[fieldsOffset:fieldsOffset+M[fieldsSizeOffset]])
    ```
* **[🔗POSEIDON2](opcodes/poseidon2.md)**: Poseidon2 permutation
    * Opcode `0x3F`
    ```javascript
    M[outputStateOffset:outputStateOffset+4] = poseidon2Permutation(/*input=*/M[inputStateOffset:inputStateOffset+4])
    ```
* **[🔗SHA256COMPRESSION](opcodes/sha256compression.md)**: SHA-256 compression
    * Opcode `0x40`
    ```javascript
    M[outputOffset:outputOffset+8] = sha256compress(/*state=*/M[stateOffset:stateOffset+8], /*inputs=*/M[inputsOffset:inputsOffset+16])
    ```
* **[🔗KECCAKF1600](opcodes/keccakf1600.md)**: Keccak-f[1600] permutation
    * Opcode `0x41`
    ```javascript
    M[dstOffset:dstOffset+25] = keccakf1600(/*input=*/M[inputOffset:inputOffset+25])
    ```
* **[🔗ECADD](opcodes/ecadd.md)**: Grumpkin elliptic curve addition
    * Opcode `0x42`
    ```javascript
    M[dstOffset:dstOffset+3] = grumpkinAdd(
        /*point1=*/{x: M[p1XOffset], y: M[p1YOffset], isInfinite: M[p1IsInfiniteOffset]},
        /*point2=*/{x: M[p2XOffset], y: M[p2YOffset], isInfinite: M[p2IsInfiniteOffset]}
    )
    ```
* **[🔗TORADIXBE](opcodes/toradixbe.md)**: Convert to radix (big-endian)
    * Opcode `0x43`
    ```javascript
    M[dstOffset:dstOffset+M[numLimbsOffset]] = toRadixBE(
        /*value=*/M[srcOffset],
        /*radix=*/M[radixOffset],
        /*numLimbs=*/M[numLimbsOffset],
        /*outputBits=*/M[outputBitsOffset]
    )
    ```

---
← Previous: [Wire Formats](./wire-format.md) | Next: [Tooling and Compilation](./tooling.md) →
