# Instruction Set Quick Reference

Quick reference for all Aztec Virtual Machine (AVM) instructions. The AVM is the virtual machine used for **public execution** in the Aztec protocol.

For detailed documentation of each instruction, see [Instruction Set Details](avm-isa-full.md).

## Understanding the AVM

Before diving into the instruction set, familiarize yourself with these core concepts:

- **[Introduction](./)**: What is the AVM and why do we need it?
- **[Memory Model](memory)**: Memory notation and tagged memory (`M[x]` and `T[x]`)
- **[Addressing Modes](addressing)**: Direct, indirect, and relative addressing along with their gas implications
- **[Gas Metering](gas)**: How L2 and DA gas costs are calculated and charged during instruction execution
- **[Wire Formats](wire-format)**: How instructions are encoded in bytecode and why opcodes have variants like `ADD_8` and `ADD_16`

## Quick Reference

Click on an opcode name to view its detailed documentation.

* **[ADD](avm-isa-full.md#add)**: Addition (a + b)
    * Opcodes `0x00`-`0x01` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] + M[bOffset]
    ```
* **[SUB](avm-isa-full.md#sub)**: Subtraction (a - b)
    * Opcodes `0x02`-`0x03` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] - M[bOffset]
    ```
* **[MUL](avm-isa-full.md#mul)**: Multiplication (a * b)
    * Opcodes `0x04`-`0x05` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] * M[bOffset]
    ```
* **[DIV](avm-isa-full.md#div)**: Integer division (a / b)
    * Opcodes `0x06`-`0x07` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] / M[bOffset]
    ```
* **[FDIV](avm-isa-full.md#fdiv)**: Field division (a / b)
    * Opcodes `0x08`-`0x09` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] / M[bOffset]
    ```
* **[EQ](avm-isa-full.md#eq)**: Equality check (a == b)
    * Opcodes `0x0A`-`0x0B` (2 wire formats)
    ```javascript
    M[dstOffset] = (M[aOffset] == M[bOffset]) ? 1 : 0
    ```
* **[LT](avm-isa-full.md#lt)**: Less than (a &lt; b)
    * Opcodes `0x0C`-`0x0D` (2 wire formats)
    ```javascript
    M[dstOffset] = (M[aOffset] < M[bOffset]) ? 1 : 0
    ```
* **[LTE](avm-isa-full.md#lte)**: Less than or equal (a &lt;= b)
    * Opcodes `0x0E`-`0x0F` (2 wire formats)
    ```javascript
    M[dstOffset] = (M[aOffset] <= M[bOffset]) ? 1 : 0
    ```
* **[AND](avm-isa-full.md#and)**: Bitwise AND (a &amp; b)
    * Opcodes `0x10`-`0x11` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] & M[bOffset]
    ```
* **[OR](avm-isa-full.md#or)**: Bitwise OR (a | b)
    * Opcodes `0x12`-`0x13` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] | M[bOffset]
    ```
* **[XOR](avm-isa-full.md#xor)**: Bitwise XOR (a ^ b)
    * Opcodes `0x14`-`0x15` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] ^ M[bOffset]
    ```
* **[NOT](avm-isa-full.md#not)**: Bitwise NOT (~a)
    * Opcodes `0x16`-`0x17` (2 wire formats)
    ```javascript
    M[dstOffset] = ~M[srcOffset]
    ```
* **[SHL](avm-isa-full.md#shl)**: Shift left (a &lt;&lt; b)
    * Opcodes `0x18`-`0x19` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] << M[bOffset]
    ```
* **[SHR](avm-isa-full.md#shr)**: Shift right (a &gt;&gt; b)
    * Opcodes `0x1A`-`0x1B` (2 wire formats)
    ```javascript
    M[dstOffset] = M[aOffset] >> M[bOffset]
    ```
* **[CAST](avm-isa-full.md#cast)**: Type cast memory value
    * Opcodes `0x1C`-`0x1D` (2 wire formats)
    ```javascript
    M[dstOffset] = M[srcOffset] as tag
    ```
* **[GETENVVAR](avm-isa-full.md#getenvvar)**: Get environment variable
    * Opcode `0x1E`
    ```javascript
    M[dstOffset] = environmentVariable[varEnum]
    ```
* **[CALLDATACOPY](avm-isa-full.md#calldatacopy)**: Copy calldata to memory
    * Opcode `0x1F`
    ```javascript
    M[dstOffset:dstOffset+M[copySizeOffset]] = calldata[M[cdStartOffset]:M[cdStartOffset]+M[copySizeOffset]]
    ```
* **[SUCCESSCOPY](avm-isa-full.md#successcopy)**: Get success status of latest external call
    * Opcode `0x20`
    ```javascript
    M[dstOffset] = nestedCallSuccess ? 1 : 0
    ```
* **[RETURNDATASIZE](avm-isa-full.md#returndatasize)**: Get returndata size
    * Opcode `0x21`
    ```javascript
    M[dstOffset] = nestedReturndata.length
    ```
* **[RETURNDATACOPY](avm-isa-full.md#returndatacopy)**: Copy returndata to memory
    * Opcode `0x22`
    ```javascript
    M[dstOffset:dstOffset+M[copySizeOffset]] = nestedReturndata[M[rdStartOffset]:M[rdStartOffset]+M[copySizeOffset]]
    ```
* **[JUMP](avm-isa-full.md#jump)**: Unconditional jump
    * Opcode `0x23`
    ```javascript
    PC = jumpOffset
    ```
* **[JUMPI](avm-isa-full.md#jumpi)**: Conditional jump
    * Opcode `0x24`
    ```javascript
    if M[condOffset] != 0 then PC = loc else PC = PC + instructionSize
    ```
* **[INTERNALCALL](avm-isa-full.md#internalcall)**: Internal function call
    * Opcode `0x25`
    ```javascript
    internalCallStack.push({callPc: PC, returnPc: PC + instructionSize}); PC = loc
    ```
* **[INTERNALRETURN](avm-isa-full.md#internalreturn)**: Return from internal call
    * Opcode `0x26`
    ```javascript
    PC = internalCallStack.pop().returnPc
    ```
* **[SET](avm-isa-full.md#set)**: Set memory to immediate value
    * Opcodes `0x27`-`0x2C` (6 wire formats)
    ```javascript
    M[dstOffset] = value
    ```
* **[MOV](avm-isa-full.md#mov)**: Move value between memory locations
    * Opcodes `0x2D`-`0x2E` (2 wire formats)
    ```javascript
    M[dstOffset] = M[srcOffset]
    ```
* **[SLOAD](avm-isa-full.md#sload)**: Load value from public storage
    * Opcode `0x2F`
    ```javascript
    M[dstOffset] = storage[contractAddress][M[slotOffset]]
    ```
* **[SSTORE](avm-isa-full.md#sstore)**: Store value to public storage
    * Opcode `0x30`
    ```javascript
    storage[contractAddress][M[slotOffset]] = M[srcOffset]
    ```
* **[NOTEHASHEXISTS](avm-isa-full.md#notehashexists)**: Check existence of note hash
    * Opcode `0x31`
    ```javascript
    M[existsOffset] = noteHashTree.exists(M[noteHashOffset], M[leafIndexOffset]) ? 1 : 0
    ```
* **[EMITNOTEHASH](avm-isa-full.md#emitnotehash)**: Emit note hash
    * Opcode `0x32`
    ```javascript
    noteHashes.append(M[noteHashOffset])
    ```
* **[NULLIFIEREXISTS](avm-isa-full.md#nullifierexists)**: Check existence of nullifier
    * Opcode `0x33`
    ```javascript
    M[existsOffset] = nullifierTree.exists(M[addressOffset], M[nullifierOffset]) ? 1 : 0
    ```
* **[EMITNULLIFIER](avm-isa-full.md#emitnullifier)**: Emit nullifier
    * Opcode `0x34`
    ```javascript
    nullifiers.append(M[nullifierOffset])
    ```
* **[L1TOL2MSGEXISTS](avm-isa-full.md#l1tol2msgexists)**: Check existence of L1-to-L2 message
    * Opcode `0x35`
    ```javascript
    M[existsOffset] = l1ToL2Messages.exists(M[msgHashOffset], M[msgLeafIndexOffset]) ? 1 : 0
    ```
* **[GETCONTRACTINSTANCE](avm-isa-full.md#getcontractinstance)**: Get contract instance information
    * Opcode `0x36`
    ```javascript
    M[dstOffset] = contractInstance.exists ? 1 : 0; M[dstOffset+1] = contractInstance[memberEnum]
    ```
* **[EMITUNENCRYPTEDLOG](avm-isa-full.md#emitunencryptedlog)**: Emit public log
    * Opcode `0x37`
    ```javascript
    unencryptedLogs.append(M[logOffset:logOffset+M[logSizeOffset]])
    ```
* **[SENDL2TOL1MSG](avm-isa-full.md#sendl2tol1msg)**: Send L2-to-L1 message
    * Opcode `0x38`
    ```javascript
    l2ToL1Messages.append({recipient: M[recipientOffset], content: M[contentOffset]})
    ```
* **[CALL](avm-isa-full.md#call)**: Call external contract
    * Opcode `0x39`
    ```javascript
    nestedCallResult = executeContract(
        /*address=*/M[addrOffset],
        /*args=*/M[argsOffset:argsOffset+M[argsSizeOffset]],
        {l2Gas: M[l2GasOffset], daGas: M[daGasOffset]}
    )
    ```
* **[STATICCALL](avm-isa-full.md#staticcall)**: Static call to external contract
    * Opcode `0x3A`
    ```javascript
    nestedCallResult = executeContractStatic(
        /*address=*/M[addrOffset],
        /*args=*/M[argsOffset:argsOffset+M[argsSizeOffset]],
        {l2Gas: M[l2GasOffset], daGas: M[daGasOffset]}
    )
    ```
* **[RETURN](avm-isa-full.md#return)**: Return from call
    * Opcode `0x3B`
    ```javascript
    return M[returnOffset:returnOffset+M[returnSizeOffset]]; halt
    ```
* **[REVERT](avm-isa-full.md#revert)**: Revert execution
    * Opcodes `0x3C`-`0x3D` (2 wire formats)
    ```javascript
    revert M[returnOffset:returnOffset+M[retSizeOffset]]; halt
    ```
* **[DEBUGLOG](avm-isa-full.md#debuglog)**: Output debug log
    * Opcode `0x3E`
    ```javascript
    debugLog(level, message, M[fieldsOffset:fieldsOffset+M[fieldsSizeOffset]])
    ```
* **[POSEIDON2](avm-isa-full.md#poseidon2)**: Poseidon2 permutation
    * Opcode `0x3F`
    ```javascript
    M[outputStateOffset:outputStateOffset+4] = poseidon2Permutation(/*input=*/M[inputStateOffset:inputStateOffset+4])
    ```
* **[SHA256COMPRESSION](avm-isa-full.md#sha256compression)**: SHA-256 compression
    * Opcode `0x40`
    ```javascript
    M[outputOffset:outputOffset+8] = sha256compress(/*state=*/M[stateOffset:stateOffset+8], /*inputs=*/M[inputsOffset:inputsOffset+16])
    ```
* **[KECCAKF1600](avm-isa-full.md#keccakf1600)**: Keccak-f[1600] permutation
    * Opcode `0x41`
    ```javascript
    M[dstOffset:dstOffset+25] = keccakf1600(/*input=*/M[inputOffset:inputOffset+25])
    ```
* **[ECADD](avm-isa-full.md#ecadd)**: Grumpkin elliptic curve addition
    * Opcode `0x42`
    ```javascript
    M[dstOffset:dstOffset+3] = grumpkinAdd(
        /*point1=*/{x: M[p1XOffset], y: M[p1YOffset], isInfinite: M[p1IsInfiniteOffset]},
        /*point2=*/{x: M[p2XOffset], y: M[p2YOffset], isInfinite: M[p2IsInfiniteOffset]}
    )
    ```
* **[TORADIXBE](avm-isa-full.md#toradixbe)**: Convert to radix (big-endian)
    * Opcode `0x43`
    ```javascript
    M[dstOffset:dstOffset+M[numLimbsOffset]] = toRadixBE(
        /*value=*/M[srcOffset],
        /*radix=*/M[radixOffset],
        /*numLimbs=*/M[numLimbsOffset],
        /*outputBits=*/M[outputBitsOffset]
    )
    ```
