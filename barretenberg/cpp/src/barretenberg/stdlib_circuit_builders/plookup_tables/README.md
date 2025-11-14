# Lookup Table Structure in Barretenberg

In Barretenberg, we use lookup tables extensively to optimise the number of constraints in the circuit for operations like bitwise XOR/AND and round-rotations (fundamental to various hashing algorithms like SHA256 and Blake2s), elliptic curve multi-scalar-multiplication algorithms, etc. Representing these operations via lookup tables significantly reduces the number of constraints compared to implementing them using basic arithmetic gates.

To understand how we structure lookup tables in Barretenberg, we will look at the example of a 32-bit bitwise XOR operation. A naive approach would be to create a single lookup table that maps every possible pair of 32-bit inputs to their XOR result. However, this would require a table with $2^{64}$ entries, which is impractical to store. Instead, we split each 32-bit input into 6-bit slices: five slices of 6 bits (30 bits total) plus one final slice of 2 bits (for the remaining 2 bits):

$$
\textsf{s} =
\underbrace{10}_{\normalsize s_{5}} \quad
\underbrace{101001}_{\normalsize s_{4}} \quad
\underbrace{110010}_{\normalsize s_{3}} \quad
\underbrace{011100}_{\normalsize s_{2}} \quad
\underbrace{101011}_{\normalsize s_{1}} \quad
\underbrace{001101}_{\normalsize s_{0}}
\in \{0, 1\}^{32}
$$

For each $n$-bit slice, we create a lookup table that maps every possible pair of $n$-bit inputs to their XOR result. In this case, we require a 6-bit table and a 2-bit table, with $2^{12} = 4096$ entries and $2^4 = 16$ entries, respectively. This type of table is referred to as a `BasicTable`. To compute the full 32-bit XOR result, we use a `MultiTable` which manages multiple `BasicTable`s. In this example, slices $s_0$ through $s_4$ use the `BasicTable` for 6-bit XOR operations, and slice $s_5$ uses a `BasicTable` for 2-bit XOR operations. The `MultiTable` stores the following metadata:

| Item                    | Description                                                                  |
| ----------------------- | ---------------------------------------------------------------------------- |
| `id`                    | Unique identifier for the multi table                                        |
| `num_lookups`           | Number of slices/lookups in the multi table                                  |
| `lookup_ids`            | List of unique identifiers for each basic table used in the multi table      |
| `slice_sizes`           | List of sizes (in bits) for each slice                                       |
| `column_i_coefficients` | Coefficients for each column to compute accumulated values (for `i = 1,2,3`) |
| `column_i_step_sizes`   | Step sizes for each column to compute accumulated values (for `i = 1,2,3`)   |
| `get_table_values`      | Function to retrieve the values of the multi table                           |
|                         |                                                                              |

A `BasicTable` consists of the following:

| Item                 | Description                                                                |
| -------------------- | -------------------------------------------------------------------------- |
| `id`                 | Unique identifier for the basic table                                      |
| `table_index`        | Index of the table in the multi-table                                      |
| `use_twin_keys`      | Boolean indicating whether it is a 2-keys-1-value table                    |
| `column_i`           | Actual values in a column of the basic table (for `i = 1,2,3`)             |
| `column_i_step_size` | Step sizes for each column to compute accumulated values (for `i = 1,2,3`) |
|                      |                                                                            |

We will next describe the need and the usage of the column coefficients and step sizes.

### Column Coefficients & Step Sizes

When we read data from the multi tables, we want the output to be the accumulated sum of individual slices to avoid the need for additional arithmetic gates in the circuit. For this reason, we need to carefully choose column coefficients that allow us to directly read the accumulated values from lookup tables.

For our 32-bit XOR example with slices indexed from LSB to MSB (i.e., $s_0$ is the least significant slice), we need to reconstruct the full 32-bit value as:

$$
\textsf{s} = s_{0} \cdot 2^{0} + s_{1} \cdot 2^{6} + s_{2} \cdot 2^{12} + s_{3} \cdot 2^{18} + s_{4} \cdot 2^{24} + s_{5} \cdot 2^{30}
$$

For the XOR operation, we need to reconstruct three values from their slices: the first input, the second input, and the XOR result. Since all three are 32-bit values split the same way, they all use the same coefficients:

$$
\begin{aligned}
\texttt{column\_1\_coefficients} &= (2^{0}, 2^{6}, 2^{12}, 2^{18}, 2^{24}, 2^{30}) \quad \text{(for first input)} \\
\texttt{column\_2\_coefficients} &= (2^{0}, 2^{6}, 2^{12}, 2^{18}, 2^{24}, 2^{30}) \quad \text{(for second input)} \\
\texttt{column\_3\_coefficients} &= (2^{0}, 2^{6}, 2^{12}, 2^{18}, 2^{24}, 2^{30}) \quad \text{(for XOR result)}
\end{aligned}
$$

From these coefficients, we compute the column step sizes as the ratio between consecutive coefficients:

$$
\texttt{column\_i\_step\_sizes}: \quad \left(1, \frac{2^{6}}{2^{0}}, \frac{2^{12}}{2^{6}}, \frac{2^{18}}{2^{12}}, \frac{2^{24}}{2^{18}}, \frac{2^{30}}{2^{24}}\right) = (1, 2^{6}, 2^{6}, 2^{6}, 2^{6}, 2^{6})
$$

for all three columns $i = 1, 2, 3$.

Note that the first coefficient is always 1 (i.e., $a_0 = 1$), which simplifies the computation. The step sizes are used during the lookup process to incrementally compute accumulated values from the table lookups, avoiding the need for additional multiplication gates in the circuit. They represent the multiplicative factor needed to scale each slice to its correct position in the final reconstructed value.

### Lookup Gate Structure with Accumulators

To understand how coefficients and step sizes are used, let's examine the actual gate structure for our 32-bit XOR example. The purpose of these gates is twofold:

1. **Prove decomposition**: Verify that the fully reconstructed 32-bit values correctly decompose into the individual slices
2. **Prove lookups**: Verify that each individual `BasicTable` lookup is valid (i.e., each slice pair XORs correctly)

We create 6 lookup gates, one for each slice. The key insight is that we start with the **full 32-bit values** and verify they decompose correctly:

**Gate 0** (for slice $s_0$, the 6-bit LSB):
- Wire 1 = $S$ (full 32-bit first XOR input)
- Wire 2 = $T$ (full 32-bit second XOR input)
- Wire 3 = $S \oplus T$ (full 32-bit XOR result)
- Lookup: Verifies that $s_0 = S \bmod 2^6$, $t_0 = T \bmod 2^6$, and $s_0 \oplus t_0$ is correct
- Selectors: $q_2 = -2^6$, $q_M = -2^6$, $q_C = -2^6$ (step sizes for next gate)

**Gate 1** (for slice $s_1$):
- Wire 1 = $(S - s_0) / 2^6$ (remaining bits after removing $s_0$)
- Wire 2 = $(T - t_0) / 2^6$ (remaining bits after removing $t_0$)
- Wire 3 = $(S \oplus T - (s_0 \oplus t_0)) / 2^6$ (remaining XOR result)
- Lookup: Verifies next 6-bit slice and its XOR
- Selectors: $q_2 = -2^6$, $q_M = -2^6$, $q_C = -2^6$

**Gates 2-4**: Continue the pattern, progressively removing lower slices...

**Gate 5** (for slice $s_5$, the 2-bit MSB):
- Wire 1, 2, 3 = Final 2-bit slices
- Lookup: Verifies the final 2-bit slice lookup
- Selectors: $q_2 = 0$, $q_M = 0$, $q_C = 0$ (no more decomposition needed)

The gates are linked by the constraint:

$$
\text{Wire}_i(\text{next}) \cdot \text{step\_size}_i + \text{slice}_i = \text{Wire}_i(\text{current})
$$

Rearranging, we can extract each slice as:

$$
\text{slice}_i = \text{Wire}_i(\text{current}) - \text{Wire}_i(\text{next}) \cdot \text{step\_size}_i
$$

In the plookup gate implementation, `Wire_i(current)` is the wire value `w_i` at the current gate, and `Wire_i(next)` is the shifted wire value `w_i_shift` from the next gate. The step sizes are stored in the selector polynomials ($q_2$ for column 1, $q_M$ for column 2, $q_C$ for column 3). Thus, each gate computes:

$$
\text{slice}_i = w_i - w_{i,\text{shift}} \cdot \text{scale}
$$

These computed slices are then looked up in the appropriate `BasicTable` to verify they form a valid entry $(s_i, t_i, s_i \oplus t_i)$. This mechanism ensures that:
1. The full values in Gate 0 correctly decompose into the slices
2. Each slice lookup is validated against the `BasicTable`
3. No additional multiplication gates are needed for the decomposition

This is the key innovation of the plookup accumulator pattern: we verify decomposition and table lookups simultaneously using only the wire shifts and selector-encoded step sizes.
