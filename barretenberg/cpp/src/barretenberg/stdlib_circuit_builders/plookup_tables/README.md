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

To understand how coefficients and step sizes are used, consider the actual gate structure for our 32-bit XOR example. The purpose of these gates is twofold:

1. **Prove decomposition**: Verify that the fully reconstructed 32-bit values correctly decompose into the individual slices
2. **Prove lookups**: Verify that each individual `BasicTable` lookup is valid (i.e., each slice pair XORs correctly)

We create 6 lookup gates, one for each slice. To understand the pattern, let's focus on the first wire $w_1$:

| row idx | $w_1$                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------- |
| $0$     | $S = s_0 \cdot 2^{0} + s_1 \cdot 2^{6} + s_2 \cdot 2^{12} + s_3 \cdot 2^{18} + s_4 \cdot 2^{24} + s_5 \cdot 2^{30}$ |
| $1$     | $\frac{S - s_0}{2^6} = s_1 \cdot 2^{0} + s_2 \cdot 2^{6} + s_3 \cdot 2^{12} + s_4 \cdot 2^{18} + s_5 \cdot 2^{24}$  |
| $2$     | $\frac{S - s_0 - s_1 \cdot 2^6}{2^{12}} = s_2 \cdot 2^{0} + s_3 \cdot 2^{6} + s_4 \cdot 2^{12} + s_5 \cdot 2^{18}$  |
| $3$     | $\frac{S - s_0 - s_1 \cdot 2^6 - s_2 \cdot 2^{12}}{2^{18}} = s_3 \cdot 2^{0} + s_4 \cdot 2^{6} + s_5 \cdot 2^{12}$  |
| $4$     | $\frac{S - s_0 - s_1 \cdot 2^6 - s_2 \cdot 2^{12} - s_3 \cdot 2^{18}}{2^{24}} = s_4 \cdot 2^{0} + s_5 \cdot 2^{6}$  |
| $5$     | $\frac{S - s_0 - s_1 \cdot 2^6 - s_2 \cdot 2^{12} - s_3 \cdot 2^{18} - s_4 \cdot 2^{24}}{2^{30}} = s_5 \cdot 2^{0}$ |
|         |                                                                                                                     |

This establishes the reconstruction of the full value $S$ from the slices while also allowing us to prove the individual lookups by considering the difference of consecutive rows. For example, the slice value $s_0$ is reconstructed as:

$$w_1[0] - w_1[1]\cdot 2^6 = S  - \frac{S - s_0}{2^6}\cdot 2^6 = s_0$$

Or, more generally for the $i$-th wire and $j$-th row:

$$w_i[j] - w_i[j+1]\cdot \texttt{step\_size}_{i,j} = s_{i,j}, \,\,\, i = 1,2,3, \,\,\, j \in [0,5]$$

In the lookup relation (`LogDerivLookupRelation`) values $w_i[j+1]$ are accessed via the shifted wire polynomials `w_i_shift` and the $\texttt{step\_size}_{i,j}$ are stored in selectors $q_r, q_m$ and $q_c$.
