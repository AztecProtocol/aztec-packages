$\newcommand{\endogroup}{\textcolor{orange}{\lambda}}$
$\newcommand{\endofield}{\textcolor{orange}{\beta}}$
$\newcommand{\rom}[1]{\textcolor{purple}{#1}}$
$\newcommand{\windex}[1]{\textcolor{grey}{#1}}$

### ROM Tables in Barretenberg

> Note: This section briefly describes the implementation of ROM tables in Barretenberg. More details on the implementation will be added during the internal audit of the memory primitives.

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
