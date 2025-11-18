### ROM Tables in Barretenberg

> Note: This section briefly describes the implementation of ROM tables in Barretenberg. More details on the implementation may be found in `stdlib_circuit_builders/rom_ram_logic.*pp`.

In what follows, we distinguish between _values_ and their _witness index_ using, respectively, an upper case symbol and the corresponding lower case symbol.

Suppose we have a ROM table with $n$ entries, where each entry consists of two values: $A_i$ and $B_i$. The ROM table is represented as follows:

| ROM Index | Value A   | Value B   |
| --------- | --------- | --------- |
| 0         | $A_0$     | $B_0$     |
| 1         | $A_1$     | $B_1$     |
| 2         | $A_2$     | $B_2$     |
| $\vdots$  | $\vdots$  | $\vdots$  |
| $n-1$     | $A_{n-1}$ | $B_{n-1}$ |
|           |           |           |

The values in the ROM table need to be circuit witnesses. If any of the values used to construct the tables are constants, they are converted to "fixed witnesses", i.e. witness which are explicitly constrained to equal the corresponding constant value. The above table can therefore be expressed in terms of it's witness indices as follows:

| Witness index of ROM index | Witness index of value A | Witness index of value B |
| -------------------------- | ------------------------ | ------------------------ |
| $i_0$                      | $a_0$                    | $b_0$                    |
| $i_1$                      | $a_1$                    | $b_1$                    |
| $i_2$                      | $a_2$                    | $b_2$                    |
| $\vdots$                   | $\vdots$                 | $\vdots$                 |
| $i_{n-1}$                  | $a_{n-1}$                | $b_{n-1}$                |
|                            |                          |                          |

In practice, the ROM table is "instantiated" only when we try to use `operator[]` on the ROM table with a witness index. Prior to this, the default values are set to $U = 2^{32}-1$ (the witness index used for circuit constants). On initializing the ROM table, the witness indices are set to the corresponding values in the ROM table.

> **Note**: If we have a ROM table with all entries as circuit constants, we end up adding $2n$ gates just to create the constant witnesses for the ROM values. This is not efficient, and we should avoid using ROM tables with all entries as circuit constants. The cost of the constant witnesses added for the ROM indices is generally amortized since they need only be added once and are then reused across any table that needs them.

#### Gate layout

The gate layout for the ROM table is as follows:

| Wire 1    | Wire 2    | Wire 3    | Wire 4    |
| --------- | --------- | --------- | --------- |
| $i_0$     | $a_0$     | $b_0$     | $r_0$     |
| $i_1$     | $a_1$     | $b_1$     | $r_1$     |
| $i_2$     | $a_2$     | $b_2$     | $r_2$     |
| $\vdots$  | $\vdots$  | $\vdots$  | $\vdots$  |
| $i_{n-1}$ | $a_{n-1}$ | $b_{n-1}$ | $r_{n-1}$ |
|           |           |           |           |

Note the fourth wire is used to store the memory record (also known as the "fingerprint"), which is defined as:

$$
\textsf{record}(i, a, b) := \eta \cdot I + \eta^2 \cdot A + \eta^3 \cdot B,
\tag{1}
$$

where $I$ is the ROM index, $(A, B)$ is the ROM value, and $\eta$ is a challenge value that is used to ensure the memory record is unique for each ROM entry. The memory record is used to verify the integrity of the ROM table and to ensure that the values are correctly associated with their indices.

In practice, the challenge $\eta$ is a random value that can be generated only _after_ the entire witness trace is generated. In other words, we don't know $\eta$ until the witness trace is complete. Hence, while adding gates for the ROM table, we add the record variable as circuit witness and set it to $0$ (for it to be updated later).

#### Reading from ROM Tables

Suppose we want to read from index $J$ of the ROM table. The following steps are performed:

1. Fetch the witness index $j$ of the ROM index: $J$.
2. Retrieve the corresponding ROM value: $(A_j, B_j) = \textsf{table}[J]$.
3. Add two new circuit variables $a_j$ and $b_j$ to the circuit, which are set to the values $A_j$ and $B_j$ respectively.

To enforce this in the circuit, we add a ROM gate:

| Wire 1 | Wire 2 | Wire 3 | Wire 4 |
| ------ | ------ | ------ | ------ |
| $j$    | $a_j$  | $b_j$  | $r_j$  |
|        |        |        |        |

where $r_j$ is the witness index of the memory record for the tuple $(J, A_j, B_j).$ We need to enforce a constraint that the memory record was computed correctly as per equation $(1)$.

Additionally, we also need to add sorted ROM gates to the trace (as a part of post-processing of the circuit) to ensure that the ROM entries are consistent. The sorted ROM gates are added to ensure that the ROM entries are in a sorted order based on their indices. To enforce this, we add the following constraint on the sorted ROM gates: given the following two sorted ROM gates,

| Wire 1 | Wire 2   | Wire 3   | Wire 4   |
| ------ | -------- | -------- | -------- |
| $j$    | $a_j$    | $b_j$    | $r_j$    |
| $j'$   | $a_{j'}$ | $b_{j'}$ | $r_{j'}$ |
|        |          |          |          |

we check that $j' \leq j$ and that

$$
j = j' \implies \textsf{record}(j, a_j, b_j) = \textsf{record}(j', a_{j'}, b_{j'}).
$$
