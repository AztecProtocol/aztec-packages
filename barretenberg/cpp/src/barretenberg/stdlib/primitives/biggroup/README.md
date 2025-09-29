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

Refer to the [ROM table documentation](../memory/README.md) for details on how ROM tables are implemented in Barretenberg.
