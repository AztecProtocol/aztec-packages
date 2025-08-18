$\newcommand{\endogroup}{\textcolor{orange}{\lambda}}$
$\newcommand{\endofield}{\textcolor{orange}{\beta}}$
$\newcommand{\rom}[1]{\textcolor{purple}{#1}}$
$\newcommand{\windex}[1]{\textcolor{grey}{#1}}$

### Lookup Tables in Biggroup

In the biggroup class, we use lookup tables to store precomputed multiples of a fixed group element $P$. Since we use the wNAF (windowed non-adjacent form) method for scalar multiplication, we need to store odd multiples of $P$ up to a certain window size. Further, to leverage endomorphism while computing scalar multiplication, we also store the endomorphic mapping of the multiples of $P$ in the table. For instance with a wNAF window size of 3, the lookup table for $P$ is represented as follows:

| Index | Element      | Endomorphism            |
| ----- | ------------ | ----------------------- |
| 0     | $-7 \cdot P$ | $-7 \endogroup \cdot P$ |
| 1     | $-5 \cdot P$ | $-5 \endogroup \cdot P$ |
| 2     | $-3 \cdot P$ | $-3 \endogroup \cdot P$ |
| 3     | $-1 \cdot P$ | $-1 \endogroup \cdot P$ |
| 4     | $1 \cdot P$  | $1 \endogroup \cdot P$  |
| 5     | $3 \cdot P$  | $3 \endogroup \cdot P$  |
| 6     | $5 \cdot P$  | $5 \endogroup \cdot P$  |
| 7     | $7 \cdot P$  | $7 \endogroup \cdot P$  |

Note that our wNAF form uses only (positive and negative) odd multiples of $P$ so as to avoid handling conditional logic in the circuit for 0 values. Each group element in the above table is represented as a point on the elliptic curve: $Q = (x, y)$ such that $x, y \in \mathbb{F}_q$. In our case, $\mathbb{F}_q$ is either the base field of BN254 or secp256k1 (or secp256r1). Since the native field used in our circuits is the scalar field $\mathbb{F}_r$ of BN254, $x$ and $y$ are non-native field elements and are represented as two `bigfield` elements, i.e., each of $x$ and $y$ consists of four binary-basis limbs and one prime-basis limb:

$$
\begin{aligned}
x &\equiv (x_0, x_1, x_2, x_3, x_p) & & \in \mathbb{F}_r^5, \\
y &\equiv (y_0, y_1, y_2, y_3, y_p) & & \in \mathbb{F}_r^5.
\end{aligned}
$$

Thus, when generating lookup tables, each element $Q$ in the table is represented as a tuple of 10 native field elements. Since we only support tables with one key and two values, we need 5 tables to represent the group element $Q$:

| Table 1: xlo |         |     | Table 2: xhi |         |
| ------------ | ------- | --- | ------------ | ------- |
| Value 1      | Value 2 |     | Value 1      | Value 2 |
| $x_0$        | $x_1$   |     | $x_2$        | $x_3$   |

| Table 3: ylo |         |     | Table 4: yhi |         |
| ------------ | ------- | --- | ------------ | ------- |
| Value 1      | Value 2 |     | Value 1      | Value 2 |
| $y_0$        | $y_1$   |     | $y_2$        | $y_3$   |

| Table 5: prime table |         |
| -------------------- | ------- |
| Value 1              | Value 2 |
| $x_p$                | $y_p$   |

Additionally, we also need tables for the endomorphism values. Suppose $x' := \endofield \cdot x$ is the x-coordinate of the endomorphism of the group element $Q$, represented as $x' = (x'_0, x'_1, x'_2, x'_3, x'_p) \in \mathbb{F}_r^5$. The endomorphism table is represented as follows:

| endo xlo table |         |     |     | endo xhi table |         |
| -------------- | ------- | --- | --- | -------------- | ------- |
| Value 1        | Value 2 |     |     | Value 1        | Value 2 |
| $x'_0$         | $x'_1$  |     |     | $x'_2$         | $x'_3$  |

| endo prime table |         |
| ---------------- | ------- |
| Value 1          | Value 2 |
| $x'_p$           | $y_p$   |

Note that since the y-coordinate remains unchanged under the endomorphism, we can use the same y-coordinate tables. For the prime-basis limb of the endomorphism, we use the same value $y_p$ (which is redundant but ensures consistency of using two-column tables). Thus, overall we need 8 tables to represent the lookup table for a group element $P$ with each table size being $2^3$ (for a wNAF window size of 3).

> Note:
> In the context of biggroup, we need variable-base lookup tables and fixed-base lookup tables. The variable-base lookup tables are used when the base point $P$ is not known at circuit synthesis time and is provided as a circuit witness. In this case, we need to generate the lookup tables on-the-fly based on the input base point $P$. On the other hand, fixed-base lookup tables are used when the base point $P$ is known at circuit synthesis time and can be hardcoded into the circuit (for example group generators). Fixed-base lookup tables are more efficient as they can be precomputed and do not require additional gates to enforce the correctness of the table entries. Variable-base lookup tables are realized using ROM tables (described below) while fixed-base lookup tables are realized using standard lookup tables in the circuit.

### ROM Tables in Barretenberg

Suppose we have a ROM table with $n$ entries, where each entry consists of two values: $\rom{A_i}$ and $\rom{B_i}$. The ROM table is represented as follows:

| ROM Index | Value A         | Value B         |
| --------- | --------------- | --------------- |
| 0         | $\rom{A_0}$     | $\rom{B_0}$     |
| 1         | $\rom{A_1}$     | $\rom{B_1}$     |
| 2         | $\rom{A_2}$     | $\rom{B_2}$     |
| $\vdots$  | $\vdots$        | $\vdots$        |
| $n-1$     | $\rom{A_{n-1}}$ | $\rom{B_{n-1}}$ |

The values in the ROM table need to be circuit witnesses. If any of these values are circuit constants, they must be used as fixed circuit witnesses (fixing circuit witnesses is enforced by one gate for each value). In this case, suppose the ROM values $\rom{A_i}$ and $\rom{B_i}$ are circuit witnesses, represented by the following witness indices:

| Witness index      | Value Witness   |
| ------------------ | --------------- |
| 0                  | $0$             |
| 1                  | $\dots$         |
| $\vdots$           | $\vdots$        |
| $\windex{a_0}$     | $\rom{A_0}$     |
| $\windex{a_1}$     | $\rom{A_1}$     |
| $\windex{\vdots}$  | $\rom{\vdots}$  |
| $\windex{a_{n-1}}$ | $\rom{A_{n-1}}$ |
| $\vdots$           | $\vdots$        |
| $\windex{b_0}$     | $\rom{B_0}$     |
| $\windex{b_1}$     | $\rom{B_1}$     |
| $\windex{\vdots}$  | $\rom{\vdots}$  |
| $\windex{b_{n-1}}$ | $\rom{B_{n-1}}$ |
| $\vdots$           | $\vdots$        |
|                    |                 |

The ROM table is "instantiated" only when we try to use `operator[]` on the ROM table with a witness index. In practice, the ROM table stores the witness indices (instead of the witness values), and the default values are set to $U = 2^{32}-1$ (the witness index used for circuit constants). On initializing the ROM table, the witness indices are set to the corresponding values in the ROM table. Additionally, we add constant witnesses to the circuit for the index set $\{0, 1, \dots, n - 1\}$. Thus, the updated witness vector looks like this:

| Witness index      | Value Witness   |
| ------------------ | --------------- |
| 0                  | $0$             |
| 1                  | $\dots$         |
| $\vdots$           | $\vdots$        |
| $\windex{a_0}$     | $\rom{A_0}$     |
| $\windex{a_1}$     | $\rom{A_1}$     |
| $\windex{\vdots}$  | $\rom{\vdots}$  |
| $\windex{a_{n-1}}$ | $\rom{A_{n-1}}$ |
| $\vdots$           | $\vdots$        |
| $\windex{b_0}$     | $\rom{B_0}$     |
| $\windex{b_1}$     | $\rom{B_1}$     |
| $\windex{\vdots}$  | $\rom{\vdots}$  |
| $\windex{b_{n-1}}$ | $\rom{B_{n-1}}$ |
| $\vdots$           | $\vdots$        |
| $\windex{i_1}$     | $\rom{1}$       |
| $\windex{i_2}$     | $\rom{2}$       |
| $\windex{\vdots}$  | $\rom{\vdots}$  |
| $\windex{i_{n-1}}$ | $\rom{n - 1}$   |
|                    |                 |

Note we do not need to add the index $0$ as we already have it stored as the witness index $\windex{0}$. This also means that we add $(n - 1)$ gates just to create these constant witnesses for the ROM indices. Finally, the ROM table is instantiated as follows:

| Witness index of ROM index | Witness index of value A | Witness index of value B |
| -------------------------- | ------------------------ | ------------------------ |
| $\windex{0}$               | $\windex{a_0}$           | $\windex{b_0}$           |
| $\windex{i_1}$             | $\windex{a_1}$           | $\windex{b_1}$           |
| $\windex{i_2}$             | $\windex{a_2}$           | $\windex{b_2}$           |
| $\windex{\vdots}$          | $\windex{\vdots}$        | $\windex{\vdots}$        |
| $\windex{i_{n-1}}$         | $\windex{a_{n-1}}$       | $\windex{b_{n-1}}$       |
|                            |                          |

> **Note**: If we have a ROM table with all entries as circuit constants, we end up adding $2n$ gates just to create the constant witnesses for the ROM values. This is not efficient, and we should avoid using ROM tables with all entries as circuit constants. The constant witnesses added for the ROM indices cost additional $(n - 1)$ gates but they are reused across multiple ROM tables.

The gate layout for the ROM table is as follows:

| Wire 1             | Wire 2             | Wire 3             | Wire 4             |
| ------------------ | ------------------ | ------------------ | ------------------ |
| $\windex{0}$       | $\windex{a_0}$     | $\windex{b_0}$     | $\windex{r_1}$     |
| $\windex{i_1}$     | $\windex{a_1}$     | $\windex{b_1}$     | $\windex{r_2}$     |
| $\windex{i_2}$     | $\windex{a_2}$     | $\windex{b_2}$     | $\windex{r_3}$     |
| $\vdots$           | $\vdots$           | $\vdots$           | $\vdots$           |
| $\windex{i_{n-1}}$ | $\windex{a_{n-1}}$ | $\windex{b_{n-1}}$ | $\windex{r_{n-1}}$ |

Note the fourth wire is used to store the memory record (also known as the "fingerprint"), which is defined as:

$$
\textsf{record}(i, a, b) := \textcolor{orange}{\eta} \cdot\rom{I} + \textcolor{orange}{\eta^2} \cdot \rom{A} + \textcolor{orange}{\eta^3} \cdot \rom{B},
\tag{1}
$$

where $\rom{I}$ is the ROM index, $(\rom{A}, \rom{B})$ is the ROM value, and $\textcolor{orange}{\eta}$ is a challenge value that is used to ensure the memory record is unique for each ROM entry. The memory record is used to verify the integrity of the ROM table and to ensure that the values are correctly associated with their indices.

In practice, the challenge $\textcolor{orange}{\eta}$ is a random value that can be generated only after the entire witness trace is generated. In other words, we don't know $\textcolor{orange}{\eta}$ until the witness trace is complete. Hence, while adding gates for the ROM table, we add the record variable as circuit witness and set it to $0$.

#### Reading from ROM Tables

Suppose we want to read from index $\rom{J}$ of the ROM table. The following steps are performed:

1. Fetch the witness index $\windex{j}$ of the ROM index: $\rom{J}$.
2. Retrieve the corresponding ROM value: $(\rom{A_j}, \rom{B_j}) = \textsf{table}[\rom{J}]$.
3. Add two new circuit variables $\windex{a_j}$ and $\windex{b_j}$ to the circuit, which are set to the values $\rom{A_j}$ and $\rom{B_j}$ respectively.

To enforce this in the circuit, we add a ROM gate:

| Wire 1       | Wire 2         | Wire 3         | Wire 4         |
| ------------ | -------------- | -------------- | -------------- |
| $\windex{j}$ | $\windex{a_j}$ | $\windex{b_j}$ | $\windex{r_j}$ |

where $\windex{r_j}$ is the witness index of the memory record for the tuple $(\rom{J}, \rom{A_j}, \rom{B_j}).$ We need to enforce a constraint that the memory record was computed correctly as per equation $(1)$.

Additionally, we also need to add sorted ROM gates to the trace (as a part of post-processing of the circuit) to ensure that the ROM entries are consistent. The sorted ROM gates are added to ensure that the ROM entries are in a sorted order based on their indices. To enforce this, we add the following constraint on the sorted ROM gates: given the following two sorted ROM gates,

| Wire 1        | Wire 2            | Wire 3            | Wire 4            |
| ------------- | ----------------- | ----------------- | ----------------- |
| $\windex{j}$  | $\windex{a_j}$    | $\windex{b_j}$    | $\windex{r_j}$    |
| $\windex{j'}$ | $\windex{a_{j'}}$ | $\windex{b_{j'}}$ | $\windex{r_{j'}}$ |

we check that $\windex{j'} \leq \windex{j}$ and that

$$
\windex{j} = \windex{j'} \implies \textsf{record}(\windex{j}, \windex{a_j}, \windex{b_j}) = \textsf{record}(\windex{j'}, \windex{a_{j'}}, \windex{b_{j'}}).
$$
