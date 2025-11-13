$\newcommand{\slice}[1]{\textcolor{orange}{s_{{#1}}}}$

# Lookup Table Structure in Barretenberg

In Barretenberg, we use lookup tables extensively to optimise the number of constraints in the circuit for operations like bitwise XORs, bitwise ANDs, round-rotations and so on. These operations are fundamental to various hashing algorithms like SHA256 and Blake2s. Representing these operations via lookup tables significantly reduces the number of constraints compared to implementing them using basic arithmetic gates.

To understand how we structure lookup tables in Barretenberg, we will look at the example of a 32-bit bitwise XOR operation. A naive approach would be to create a single lookup table that maps every possible pair of 32-bit inputs to their XOR result. However, this would require a table with $2^{64}$ entries, which is impractical in barretenberg. Instead, we can split the 32-bit inputs into smaller slices and lookup each slice from a single, much smaller lookup table.

More generally, suppose we split each $n$-bit input into $l$ slices, each of size $b$ bits such that:

$$
b := \left\lceil \frac{n}{l} \right\rceil.
$$

We can then create a lookup table that maps every possible pair of $b$-bit inputs to their XOR result. This table would have $2^{2b}$ entries, which is much more manageable (for example, if $b = 6$ the table size is $2^{12} = 4096$). Ofcourse, we would need to perform $l$ lookups to compute the full n-bit XOR result. Also, if $n$ is not perfectly divisible by $l$, the last slice can be smaller than $b$ bits. Thus, for the last slice, we would create a smaller lookup table that maps every possible pair of $(n - b \cdot (l-1))$-bit inputs to their XOR result.

In our implementation, we refer to the number of slices (or lookups) as `num_lookups` and the store the sizes of slices as `slice_sizes`. As hinted earlier, the slices can have different sizes. Suppose for an n-bit input $\textsf{s}$ we have the following slices:

$$
\textsf{s} =
\underbrace{100011}_{\normalsize \slice{l-1}} \quad
\underbrace{00110011}_{\normalsize \slice{l-2}} \quad
\dots \quad
\underbrace{101000110}_{\normalsize \slice{1}} \quad
\underbrace{0101}_{\normalsize \slice{0}}
\in \mathbb{Z}_2^{n}
$$

WIP WIP WIP WIP WIP

All of the individual lookup tables for each slice are called as `PlookupBasicTable` and the combined table with all basic tables woven together in something called as `PlookupMultiTable`. The multi table needs to store the following:&#x20;

1. `id`
2. `num_lookups`
3. `lookup_ids`
4. `slice_sizes`
5. `column_1_coefficients, column_2_coefficients, column_3_coefficients`
6. `column_1_step_sizes, column_2_step_sizes, column_3_step_sizes`
7. `get_table_values`

The first, second and the third are self-explanatory, note that is is possible to use a same basic table multiple times in a multi table. The sizes of the basic tables are stored in `slice_sizes`. A basic table is of the form (we use the slice $$s_1$$ above for illustration):

| Key           | Value 1                                                                                                                                                                                  | Value 2                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| $$101000110$$ | $$\textcolor{red}{00}1\textcolor{red}{00}0\textcolor{red}{00}1\textcolor{red}{00}0\textcolor{red}{00}0\textcolor{red}{00}0\textcolor{red}{00}1\textcolor{red}{00}1\textcolor{red}{00}0$$ | $$\textcolor{red}{0110}10100$$ |

Note that the column 2 value is the base-8 sparse form of the key and column 3 is right-rotation by 4 of the key. More generally, we refer to the column values in a basic table as $$(s_j^{0}, s_j^{1}, s_j^{2})$$ for slice $$s_j$$. A basic table consists of the following:

1. `id`
2. `table_index`
3. `use_twin_keys`
4. `column_1, column_2, column_3`
5. `column_1_step_size, column_2_step_size, column_3_step_size`

Note that `use_twin_keys` is a boolean set to true if we need two keys. We will next describe the need and the usage of the column coefficients and step sizes.

### Column Coefficients & Step Sizes

When we read data from the multi tables, we want the output to be the accumulated sum of individual slices so as to avoid the need of additional `add` gates in the circuit. For this reason, we need to carefully choose column coefficients which would allow us to directly read the accumulated values from lookup tables. Let the column coefficients for the above $$l$$ slices be:

$$
\begin{aligned}
\texttt{column\_1\_coefficients}  &= (a_0, a_1, a_2, \dots, a_{l-1}) \\
\texttt{column\_2\_coefficients}  &= (b_0, b_1, b_2, \dots, b_{l-1}) \\
\texttt{column\_3\_coefficients}  &= (c_0, c_1, c_2, \dots, c_{l-1})
\end{aligned}
$$

We will later see how we get these values for different multi tables. We also need to compute something called as column step sizes from the column coefficients. We do that as follows:

$$
\begin{aligned}
\texttt{column\_1\_step\_sizes}  &= \left(1, \frac{a_1}{a_0},\frac{a_2}{a_1}, \dots, \frac{a_{l-1}}{a_{l-2}}\right) \\
\texttt{column\_2\_step\_sizes}  &= \left(1, \frac{b_1}{b_0},\frac{b_2}{b_1}, \dots, \frac{b_{l-1}}{b_{l-2}}\right) \\
\texttt{column\_3\_step\_sizes}  &= \left(1, \frac{c_1}{c_0},\frac{c_2}{c_1}, \dots, \frac{c_{l-1}}{c_{l-2}}\right)
\end{aligned}
$$

The accumulated values of the columns (for $$j=0,1,2$$ and $$a$$ would be replaced by $$b,c$$ appropriately) are computed as:

| Slice      | $$\texttt{column\_\{j+1\}\_acc\_values}$$                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| $$0$$      | $$\begin{aligned}  s_0^{j} + \left(\frac{a_{1}}{a_{0}}\right)s_1^{j} + \left(\frac{a_{2}}{a_{0}}\right) s_{2}^j + \dots + \left(\frac{a_{l-2}}{a_{0}}\right) s_{l-2}^j + \left(\frac{a_{l-1}}{a_{0}}\right) s_{l-1}^j \end{aligned}$$ |
| $$1$$      | $$\begin{aligned}  s_1^{j} + \left(\frac{a_{2}}{a_{1}}\right) s_{2}^j + \dots + \left(\frac{a_{l-2}}{a_{1}}\right) s_{l-2}^j + \left(\frac{a_{l-1}}{a_{1}}\right) s_{l-1}^j \end{aligned}$$                                           |
| $$\vdots$$ | $$\vdots$$                                                                                                                                                                                                                            |
| $$l-2$$    | $$\begin{aligned} s_{l-2}^j + \frac{a_{l-1}}{a_{l-2}} \left( s_{l-1}^j \right) \end{aligned}$$                                                                                                                                        |
| $$l-1$$    | $$s_{l-1}^j$$                                                                                                                                                                                                                         |

For the example $$textsf{s}$$ given at the beginning, for computing its accumulated value (i.e. decimal form) we need to do:

$$
\textsf{s}_{\text{decimal}} = s_0^0 + 2^{4}s_1^0 + \dots + 2^{n-14}s^0_{l-2} + 2^{n-6}s_{l-2}^0
$$

Thus, the column 1 coefficients should be:

$$
\frac{a_1}{a_0} = 2^{4}, \ \dots, \ \frac{a_{l-2}}{a_0} = 2^{n-14}, \ \frac{a_{l-1}}{a_0} = 2^{n-6}.
$$

Setting $$a_0 = 1$$, we get the values of $$a_1, a_2, \dots, a_{l-1}$$. This also highlights the need for having $$a_0 = 1$$ so as to simplify the computation for the remaining coefficients. Further, the column step sizes go into the selector polynomial $$q_2, q_M, q_C$$ when using multi tables in Plookup.
