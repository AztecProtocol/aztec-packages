$\newcommand{\slice}[1]{\textcolor{orange}{s_{{#1}}}}$
$\newcommand{\colcoeff}[2]{\textcolor{skyblue}{{#1}_{{#2}}}}$

# Lookup Table Structure in Barretenberg

In Barretenberg, we use lookup tables extensively to optimise the number of constraints in the circuit for operations like bitwise XORs, bitwise ANDs, round-rotations and so on. These operations are fundamental to various hashing algorithms like SHA256 and Blake2s. Representing these operations via lookup tables significantly reduces the number of constraints compared to implementing them using basic arithmetic gates.

To understand how we structure lookup tables in Barretenberg, we will look at the example of a 32-bit bitwise XOR operation. A naive approach would be to create a single lookup table that maps every possible pair of 32-bit inputs to their XOR result. However, this would require a table with $2^{64}$ entries, which is impractical in barretenberg. Instead, we can split the 32-bit inputs into smaller slices and lookup each slice from smaller tables. If we split each 32-bit input into 4 slices of 8 bits each, we can create a lookup table that maps every possible pair of 8-bit inputs to their XOR result. This table would have $2^{16} = 65536$ entries, which is much more manageable. We would then perform 4 lookups to compute the full 32-bit XOR result.

In our implementation, we refer to the number of slices (i.e., the number of lookups) as `num_lookups` and the store the sizes of slices as `slice_sizes`. Suppose for an n-bit input $\textsf{s}$ we split it into $l$ slices as follows:

$$
\textsf{s} =
\underbrace{100011}_{\normalsize \slice{l-1}} \quad
\underbrace{00110011}_{\normalsize \slice{l-2}} \quad
\dots \quad
\underbrace{101000110}_{\normalsize \slice{1}} \quad
\underbrace{0101}_{\normalsize \slice{0}}
\in \{0, 1\}^{n}
$$

Each slice can be looked up from its own lookup table (or multiple slices can be looked from the same table if they match in length and we are performing the same operation on them). The individual lookup tables for each slice are called as `PlookupBasicTable` and the combined table with all basic tables woven together is referred to as `PlookupMultiTable`. The multi table stores the following meta-data:

Draw a table with the following columns:

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

As noted earlier, same basic table can be used multiple times in a multi-table. For illustration of a basic table, consider the slice $\slice{1}$ of size 9 bits from the above example. The corresponding basic table for this slice would look like:

| Key           | Value 1                                                                                                                                                                                           | Value 2                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| $$101000110$$ | $$\textcolor{grey}{00}1\textcolor{grey}{00}0\textcolor{grey}{00}1\textcolor{grey}{00}0\textcolor{grey}{00}0\textcolor{grey}{00}0\textcolor{grey}{00}1\textcolor{grey}{00}1\textcolor{grey}{00}0$$ | $$\textcolor{olive}{0110}10100$$ |

Note that the column 2 value is the base-8 sparse form of the key and column 3 is right-rotation by 4 of the key. More generally, we refer to the column values in a basic table as

$$(\slice{j}^{0}, \slice{j}^{1}, \slice{j}^{2})$$

for slice $\slice{j}$. A basic table consists of the following:

| Item                 | Description                                                                |
| -------------------- | -------------------------------------------------------------------------- |
| `id`                 | Unique identifier for the basic table                                      |
| `table_index`        | Index of the table in the multi table                                      |
| `use_twin_keys`      | Boolean indicating if its a 2-keys-1-value table                           |
| `column_i`           | Actual values in a column of the basic table (for `i = 1,2,3`)             |
| `column_i_step_size` | Step sizes for each column to compute accumulated values (for `i = 1,2,3`) |
|                      |                                                                            |

We will next describe the need and the usage of the column coefficients and step sizes.

### Column Coefficients & Step Sizes

When we read data from the multi tables, we want the output to be the accumulated sum of individual slices so as to avoid the need of additional arithmetic gates in the circuit. For this reason, we need to carefully choose column coefficients which would allow us to directly read the accumulated values from lookup tables. Let the column coefficients for the above $l$ slices be:

$$
\begin{aligned}
\texttt{column\_1\_coefficients}:  & \quad (\colcoeff{a}{0}, \colcoeff{a}{1}, \colcoeff{a}{2}, \dots, \colcoeff{a}{l-1}) \\
\texttt{column\_2\_coefficients}:  & \quad (\colcoeff{b}{0}, \colcoeff{b}{1}, \colcoeff{b}{2}, \dots, \colcoeff{b}{l-1}) \\
\texttt{column\_3\_coefficients}:  & \quad (\colcoeff{c}{0}, \colcoeff{c}{1}, \colcoeff{c}{2}, \dots, \colcoeff{c}{l-1})
\end{aligned}
$$

We will later see how we get these values for different multi tables. We also need to compute something called as column step sizes from the column coefficients. We do that as follows:

$$
\begin{aligned}
\texttt{column\_1\_step\_sizes}:  & \quad \left(1, \frac{\colcoeff{a}{1}}{\colcoeff{a}{0}},\frac{\colcoeff{a}{2}}{\colcoeff{a}{1}}, \dots, \frac{\colcoeff{a}{l-1}}{\colcoeff{a}{l-2}}\right) \\
\texttt{column\_2\_step\_sizes}:  & \quad \left(1, \frac{\colcoeff{b}{1}}{\colcoeff{b}{0}},\frac{\colcoeff{b}{2}}{\colcoeff{b}{1}}, \dots, \frac{\colcoeff{b}{l-1}}{\colcoeff{b}{l-2}}\right) \\
\texttt{column\_3\_step\_sizes}:  & \quad \left(1, \frac{\colcoeff{c}{1}}{\colcoeff{c}{0}},\frac{\colcoeff{c}{2}}{\colcoeff{c}{1}}, \dots, \frac{\colcoeff{c}{l-1}}{\colcoeff{c}{l-2}}\right)
\end{aligned}
$$

The accumulated values of the columns (for $j=0,1,2$ and $a$ would be replaced by $b,c$ appropriately) are computed as:

| Slice    | $\texttt{column\_\{j+1\}\_acc\_values}$                                                                                                                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| $$0$$    | $$\begin{aligned}  \slice{0}^{j} + \left(\frac{\colcoeff{a}{1}}{\colcoeff{a}{0}}\right) \slice{1}^{j} + \left(\frac{\colcoeff{a}{2}}{\colcoeff{a}{0}}\right) \slice{2}^{j} + \dots + \left(\frac{\colcoeff{a}{l-2}}{\colcoeff{a}{0}}\right) \slice{l-2}^{j} + \left(\frac{\colcoeff{a}{l-1}}{\colcoeff{a}{0}}\right) \slice{l-1}^{j} \end{aligned}$$ |
| $$1$$    | $$\begin{aligned}  \slice{1}^{j} + \left(\frac{\colcoeff{a}{2}}{\colcoeff{a}{1}}\right) \slice{2}^j + \dots + \left(\frac{\colcoeff{a}{l-2}}{\colcoeff{a}{1}}\right) \slice{l-2}^j + \left(\frac{\colcoeff{a}{l-1}}{\colcoeff{a}{1}}\right) \slice{l-1}^j \end{aligned}$$                                                                            |
| $\vdots$ | $$\vdots$$                                                                                                                                                                                                                                                                                                                                           |
| $$l-2$$  | $$\begin{aligned} \slice{l-2}^j + \frac{\colcoeff{a}{l-1}}{\colcoeff{a}{l-2}} \left( \slice{l-1}^j \right) \end{aligned}$$                                                                                                                                                                                                                           |
| $$l-1$$  | $$\slice{l-1}^j$$                                                                                                                                                                                                                                                                                                                                    |
|          |                                                                                                                                                                                                                                                                                                                                                      |

For the example $\textsf{s}$ given at the beginning, for computing its accumulated value (i.e. decimal form) we need to do:

$$
\textsf{s}_{\text{decimal}} = \slice{0}^0 + \textcolor{skyblue}{2^{4}} \slice{1}^0 + \dots + \textcolor{skyblue}{2^{n-14}}\slice{l-2}^0 + \textcolor{skyblue}{2^{n-6}}\slice{l-1}^0
$$

Thus, the column 1 coefficients should be:

$$
\frac{\colcoeff{a}{1}}{\colcoeff{a}{0}} = \textcolor{skyblue}{2^{4}}, \ \dots, \ \frac{\colcoeff{a}{l-2}}{\colcoeff{a}{0}} = 2^{n-14}, \ \frac{\colcoeff{a}{l-1}}{\colcoeff{a}{0}} = 2^{n-6}.
$$

Setting $a_0 = 1$, we get the values of $a_1, a_2, \dots, a_{l-1}$. This also highlights the need for having $a_0 = 1$ so as to simplify the computation for the remaining coefficients. Further, the column step sizes go into the selector polynomial $q_2, q_M, q_C$ when using multi tables in Plookup.
