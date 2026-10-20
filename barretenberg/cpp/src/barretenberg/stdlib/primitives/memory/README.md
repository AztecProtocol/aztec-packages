# ROM and RAM Tables in Barretenberg

This directory holds the stdlib memory primitives. The builder side is in `stdlib_circuit_builders/rom_ram_logic.*pp`, and the constraints are in `relations/memory_relation.hpp`.

| Class | Builder calls | Scheme |
| ----- | ------------- | ------ |
| `rom_table` | `set_ROM_element`, `read_ROM_array` (one value per index) | LogUp |
| `twin_rom_table` | `set_ROM_element_pair`, `read_ROM_array_pair` (two values per index) | Sorted records |
| `ram_table` | `init_RAM_element`, `read_RAM_array`, `write_RAM_array` | Sorted records with timestamps |

`straus_lookup_table` (`cycle_group`) and the biggroup tables also use value-pair ROM arrays. An array commits to one scheme on its first set or read call.

Notation: an upper case symbol is a value; the lower case symbol is its witness index.

## ROM array state

Suppose we have a ROM table with $n$ entries. The table holds one value $A_i$ per index (single-value) or two values $(A_i, B_i)$ (value pair):

| ROM Index | Value A   | Value B   |
| --------- | --------- | --------- |
| 0         | $A_0$     | $B_0$     |
| 1         | $A_1$     | $B_1$     |
| 2         | $A_2$     | $B_2$     |
| $\vdots$  | $\vdots$  | $\vdots$  |
| $n-1$     | $A_{n-1}$ | $B_{n-1}$ |

The values in the ROM table need to be circuit witnesses. If any of the values used to construct the tables are constants, they are converted to "fixed witnesses", i.e. witnesses that are explicitly constrained to equal the corresponding constant value. The above table can therefore be expressed in terms of its witness indices as follows:

| Witness index of ROM index | Witness index of value A | Witness index of value B |
| -------------------------- | ------------------------ | ------------------------ |
| $i_0$                      | $a_0$                    | $b_0$                    |
| $i_1$                      | $a_1$                    | $b_1$                    |
| $i_2$                      | $a_2$                    | $b_2$                    |
| $\vdots$                   | $\vdots$                 | $\vdots$                 |
| $i_{n-1}$                  | $a_{n-1}$                | $b_{n-1}$                |

In practice, the ROM table is "instantiated" only when we try to use `operator[]` on the ROM table with a witness index. Before this, every cell holds $U = 2^{32}-1$ (`UNINITIALIZED_MEMORY_RECORD`). On initializing the ROM table, the witness indices are set to the corresponding values in the ROM table. Every cell must be initialized exactly once.

> **Note**: If we have a ROM table with all entries as circuit constants, we end up adding $2n$ gates just to create the constant witnesses for the ROM values. This is not efficient, and we should avoid using ROM tables with all entries as circuit constants. The cost of the constant witnesses added for the ROM indices is generally amortized since they need only be added once and are then reused across any table that needs them.

## Single-value ROM: LogUp

Each table entry and each read is one gate in the memory block. Both gate types use the wire layout:

| Wire 1 | Wire 2 | Wire 3 | Wire 4 |
| ------ | ------ | ------ | ------ |
| index  | value  | $m_i$ (table entry) or 0 (read) | inverse helper |

The `q_c` selector holds the ROM array id, so a read is bound to the array it was issued against. During finalization (`process_ROM_logup_array`), wire 3 of each table entry is set to its read count $m_i$.

Each row has the fingerprint denominator

$$
\textsf{denom} := \gamma + \textsf{index} + \eta \cdot \textsf{value} + \eta^2 \cdot \textsf{array\_id},
$$

where $\gamma$ (`rom_logup_gamma`) is a challenge independent of $\eta$. The prover fills wire 4 with $1/\textsf{denom}$ in oink (`add_rom_logup_inverses_to_wire_4`), after the challenges are known and before wire 4 is committed. The memory relation checks:

1. Per row: $w_4 \cdot \textsf{denom} = 1$.
2. Summed over the trace: $\sum_{\textsf{reads}} 1/\textsf{denom} - \sum_{\textsf{table entries}} m_i/\textsf{denom} = 0$.

The argument assumes at most one table row per (array, index). The builder enforces this when it sets elements; the circuit does not.

## Value-pair ROM: sorted records

Each table entry and each read is a ROM gate:

| Wire 1 | Wire 2 | Wire 3 | Wire 4 |
| ------ | ------ | ------ | ------ |
| $i$    | $a$    | $b$    | $r$    |

The fourth wire stores the memory record (also known as the "fingerprint"):

$$
\textsf{record}(i, a, b) := \eta \cdot I + \eta^2 \cdot A + \eta^3 \cdot B,
\tag{1}
$$

where $I$ is the ROM index, $(A, B)$ is the ROM value, and $\eta$ is a challenge. $\eta^2$ and $\eta^3$ are `eta_two` and `eta_three`.

The challenge $\eta$ is generated only _after_ the first three wires are committed. Hence, while adding gates for the ROM table, we add the record variable as a circuit witness and set it to $0$. The prover fills it in oink from `memory_read_records`.

#### Reading from ROM Tables

Suppose we want to read from index $J$ of the ROM table. The following steps are performed:

1. Fetch the witness index $j$ of the ROM index: $J$.
2. Retrieve the corresponding ROM value: $(A_j, B_j) = \textsf{table}[J]$.
3. Add two new circuit variables $a_j$ and $b_j$ to the circuit, which are set to the values $A_j$ and $B_j$ respectively.

To enforce this in the circuit, we add a ROM gate:

| Wire 1 | Wire 2 | Wire 3 | Wire 4 |
| ------ | ------ | ------ | ------ |
| $j$    | $a_j$  | $b_j$  | $r_j$  |

where $r_j$ is the witness index of the memory record for the tuple $(J, A_j, B_j).$ We need to enforce a constraint that the memory record was computed correctly as per equation $(1)$.

#### Sorted gates

During finalization (`process_ROM_array`), the builder sorts all records of the array by index and adds one sorted ROM gate per record. Given two adjacent sorted ROM gates,

| Wire 1 | Wire 2   | Wire 3   | Wire 4   |
| ------ | -------- | -------- | -------- |
| $j$    | $a_j$    | $b_j$    | $r_j$    |
| $j'$   | $a_{j'}$ | $b_{j'}$ | $r_{j'}$ |

we check that $j' - j \in \{0, 1\}$ and that

$$
j = j' \implies \textsf{record}(j, a_j, b_j) = \textsf{record}(j', a_{j'}, b_{j'}).
$$

Copy constraints pin the first sorted index to $0$ and the last to $n - 1$. A dummy gate with index $n$ follows the last sorted gate.

A tag-based generalized permutation ties the records of the ROM gates to the records of the sorted gates. `process_ROM_array` assigns one tag to every ROM-gate record and another to every sorted-gate record, and links them with `set_tau_transposition`. Without this multiset check, the sorted gates would prove nothing about the reads.

## RAM tables

A RAM gate has wires (index, timestamp, value, record). The record is $\eta \cdot \textsf{index} + \eta^2 \cdot \textsf{timestamp} + \eta^3 \cdot \textsf{value} + \textsf{access}$, with access 0 for a read and 1 for a write. The timestamp counts accesses to that array.

During finalization (`process_RAM_array`), the builder sorts the records by index, then timestamp, and adds sorted RAM gates (`create_sorted_RAM_gate`). The memory relation checks on adjacent sorted gates:

1. The index increases by 0 or 1.
2. The access type is boolean.
3. If the indices match and the next access is a read, the values match.
4. The timestamp difference between adjacent gates with the same index is range-constrained (RAM timestamp check gates).

The circuit writer must initialize every RAM cell with a write (`init_RAM_element`).
