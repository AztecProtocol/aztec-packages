# Aztec Virtual Machine (AVM)

While private execution is performed client-side and proven in a traditional ZK circuit,
public execution follows a more standard Ethereum-style execution model in a Virtual
Machine (VM). As with execution on Ethereum, Aztec's public execution must be
performed by network participants to guarantee global, deterministic and sequential
ordering of public state accesses.

While using a VM instead of a series of compiled circuits introduces some costs, it is
required on a generally programmable platform like Aztec. Without one, errors during
the execution of a public function cannot be distinguished from a proof which is simply
invalid (i.e., a proof with unsatisfiable constraints). This would create an opportunity for
a Sequencer or Prover to censor user transactions by crafting invalid witnesses, or for a
user to grief the network by submitting transactions which can never be successfully
proven.

Given that public execution must be performed network-side, network participants must
be fairly compensated for their time and resources. Not only does that imply the need for
gas/mana metering of public execution, but it also means that network participants
must be compensated for transactions that error during public execution to ensure fair
compensation and prevent DDoS attacks.

These two critical requirements, gas metering and compensation for failing transactions,
render standard ZK circuits impractical for Aztec's public execution. A VM is the clear
alternative.

Furthermore, as part of a ZK-rollup system, every transaction's execution must be
provable, including its public portion. Only once a transaction is proven and rolled up in
a block are its state updates accepted by the network. Therefore, a VM for public
execution must be provable and compatible with Aztec’s ZK-SNARK proving system.

The Aztec Virtual Machine was designed with all of these requirements in mind.

The AVM features a custom Instruction Set Architecture (ISA). Contracts with public
logic contain public bytecode, a sequence of AVM instruction with a bit-format optimized
for efficient constraining in a zkVM. A contract’s public bytecode can be invoked by
public execution requests.

The AVM:
* Executes specified public bytecode, instruction by instruction, given some arguments.
* Meters execution by tracking gas costs per-executed-instruction.
* Tracks both “mana” and “data availability” gas.
* Supports nested contract calls and conditional error recovery.
* Manages access to public state, L1↔L2 messages, public logs, and some limited private state.
* Finalizes state updates initiated during private execution.
* Handles fee payment based on accumulated gas costs.

All public execution for a transaction is performed as a unit and eventually proven in a
single AVM proof.

## Sections

- **[Memory Model](./memory.md)**: Learn about memory, storage, and type tags
- **[Addressing Modes](./addressing.md)**: Understand direct, indirect, and relative addressing
- **[Wire Formats](./wire-format.md)**: How instructions are encoded in bytecode
- **[Gas Metering](./gas.md)**: Explore how gas costs are calculated and charged
- **[State](./state.md)**: World state (persistent) vs execution state (transient)
- **[External Calls](./external-calls.md)**: How nested contract calls work (CALL, STATICCALL, RETURN, REVERT)
- **[Instruction Set: Quick Reference](./avm-isa-quick-reference.md)**: A quick reference of all AVM instructions
- **[Instruction Set: Full Reference](./avm-isa-full.md)**: Complete reference for all AVM instructions
