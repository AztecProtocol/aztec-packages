# External Audit Scope: RAM/ROM

Repository: https://github.com/AztecProtocol/aztec-packages
Commit hash: 05a381f8b31ae4648e480f1369e911b148216e8b

## Files to Audit
Paths relative to `aztec-packages/barretenberg/cpp/src/barretenberg`

### Lowest level
#### Circuit code in `stdlib_circuit_builders`
This is the lowest level of our ROM/RAM abstraction.

1. `stdlib_circuit_builders/rom_ram_logic.*pp`
2. `stdlib_circuit_builders/ultra_circuit_builder.*pp`. These files are large; however, the scope of this audit _only_ touches memory operations, and hence we are primarily concerned with the interface with `ROM` and `RAM`. This corresponds to the methods:
    a. `create_ROM_array`
    b. `set_ROM_element`
    c. `set_ROM_element_pair`
    d. `read_ROM_array`
    e. `read_ROM_array_pair`
    f. `create_RAM_array`
    g. `init_RAM_array`
    h. `write_RAM_array`
    i. `read_RAM_array`
    j. `apply_memory_selectors`

#### Testing
1. `ultrahonk/rom_ram.test.cpp`.
### In `stdlib/primitives/memory`
One level of abstraction higher than in `stdlib_circuit_builders`. This is part of an API that is called by the code in `dsl`.

#### Code
1. `stdlib/primitives/memory/rom_table.*pp`
2. `stdlib/primitives/memory/twin_rom_table.*pp`
3. `stdlib/primitives/memory/ram_table.*pp`
#### Testing
1. `stdlib/primitives/memory/rom_table.test.cpp`
2. `stdlib/primitives/memory/twin_rom_table.test.cpp`
3. `stdlib/primitives/memory/ram_table.test.cpp`
#### Additional documentation
Some extra documentation for ROM/twin ROM tables is contained in the `README`.

### `dsl`
This is the highest level of abstraction of the memory operations in `barretenberg`. This is part of the package that transforms `acir` constraints into a `barretenberg` circuit.

#### Code
In the following code, only the ROM/RAM parts need to be audited in this audit. In particular, the databus parts (`CallData` and `ReturnData`) are outside the scope of this audit.
1. `dsl/acir_format/block_constraint.*pp`

The relevant methods are:
    a. `process_ROM_operations`
    b. `process_RAM_operations`

#### Testing
The memory tests may be found
1. `dsl/acir_format/block_constraints.test.cpp`

Inside of this audit, the relevant tests are:
    a. `ROMTest`
    b. `RAMTest`
## Brief Summary of Module
This audit consists of memory, i.e. ROM and RAM, in `barretenberg`. In particular, the files above allow for a user to construct circuits with fixed-size memory tables, both with static and dynamic memory.

Detailed documentation of the circuit-level construction may be found in `rom_ram_logic.*pp`; for ROM tables, there is additional documentation in the `README` in `stdlib/primitives/memory`.


## Security Mechanisms
1. Fuzzing: while there is acir fuzzing: `acir_dsl.fuzzer.cpp`, it **does not** fuzz the ROM/RAM gates.
2. Boomerang (to check for underconstrained circuits): `boomerang_value_detection/graph_description_ram_rom.test.cpp`
