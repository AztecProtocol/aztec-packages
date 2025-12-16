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

### wNAF with Stagger

Suppose we have a scalar $a \in \mathbb{F}_r$ that we want to represent in wNAF form with stagger and skew factors. If $a$ is an $N$-bit scalar and the number of stagger bits is $t$, then we can represent $a$ as follows:

$$
a = b \cdot \windex{2^t} + \mathfrak{c}_a
$$

where $\mathfrak{c}_a \in [0, 2^t)$ is the stagger part and $b$ is the remaining part of the scalar. We can then represent $b$ in wNAF form with its skew factor $\mathfrak{s}_b \in \{0, 1\}$ as follows:

$$
\begin{aligned}
a &:= \left( - \mathfrak{s}_b + \sum_{i=0}^{n-1} b_i \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + \mathfrak{c}_a
\end{aligned}
$$

where $b_i \in \{ -(2^{w} - 1), \ \dots \ , -3, -1, 1, 3, \ \dots \ , (2^{w} - 1)\}$ are the wNAF slices and $n = \left\lceil \frac{(N - t)}{w} \right\rceil$ is the number of wNAF slices with $w$ being the wNAF window size. The skew factor $\mathfrak{s}_b$ is used to represent even numbers, i.e., $\mathfrak{s}_b = 1$ if $b$ is even. We require the wNAF values to be signed odd digits to avoid the digit 0 as that would have to be handled conditionally in circuits. For more details on wNAF representation in barretenberg, refer to the [wNAF hackmd](https://hackmd.io/@aztec-network/rJ3VZcyZ9#wNAF-Representation-of-Scalars-in-mathbbF_r).
We can simplify the above expression as follows:

$$
\begin{aligned}
a = \left(\sum_{i=0}^{n-1} b_i \cdot \windex{2^{wi}} \right) \cdot \windex{2^t}
+
\underbrace{\left(\mathfrak{c}_a - \mathfrak{s}_b \cdot \windex{2^t} \right)}_{\textsf{adjusted stagger}}
\end{aligned}
$$

The adjusted stagger term itself can be represented as wNAF slices. Let $\mathfrak{s}_c$ be the skew factor for the adjusted stagger term, then we can write:

$$
\begin{aligned}
a = \left(\sum_{i=0}^{n-1} b_i \cdot \windex{2^{wi}} \right) \cdot \windex{2^t}
+
\underbrace{\left(-\mathfrak{s}_c + \sum_{i=0}^{m-1} c_i \cdot \windex{2^{wi}} \right),}_{\textsf{adjusted stagger in wnaf form}}
\end{aligned}
$$

where number of wNAF slices in the adjusted stagger term is $m = \left\lceil \frac{t}{w} \right\rceil$. In our implementation, we restrict the stagger bits $t \le w$ and thus $m = 1$:

$$
\begin{aligned}
a &:= \left(\sum_{i=0}^{n-1} b_i \cdot \windex{2^{wi}} \right) \cdot \windex{2^t}
+
\underbrace{\left(-\mathfrak{s}_c + c_0 \right).}_{\textsf{adjusted stagger in wnaf form}}
\end{aligned}
\tag{1}
$$

One important detail here is that the raw wNAF value $e_i \in \{0, 1, \dots, 2^{w-1}\}$ along with a sign bit $\pi_i \in \{0, 1\}$ is used to represent the wNAF slices. The sign bit indicates whether the corresponding wNAF slice is positive or negative. To convert the raw wNAF value and sign bit to the signed-odd representation for our implementation, we use the following formula:

$$
\begin{aligned}
b_i &= (1 - 2 \pi_i) \cdot (2 e_i + 1) \\
&=
\begin{cases}
(2 e_i + 1), & \text{if } \pi_i = 0 \\
-(2 e_i + 1), & \text{if } \pi_i = 1
\end{cases}
\end{aligned}
$$

While reconstructing the scalar from its wNAF representation (in a circuit), we prefer to work with non-negative values. Since $|b_i| < 2^{w}$, to make the wNAF values positive, we add a bias of $2^{w}$ to each wNAF slice:

$$
\begin{aligned}
b_i + \windex{2^{w}} &=
\begin{cases}
(\windex{2^{w}} + 2 e_i + 1), & \text{if } \pi_i = 0 \\
(\windex{2^{w}} - 2 e_i - 1), & \text{if } \pi_i = 1
\end{cases} \\
&=
\begin{cases}
2 \cdot (\windex{2^{w - 1}} + e_i) + 1, & \text{if } \pi_i = 0 \\
2 \cdot (\windex{2^{w - 1}} - e_i - 1) + 1, & \text{if } \pi_i = 1
\end{cases} \\
& =: \ 2 \cdot e'_i + 1.
\end{aligned}
$$

We need to subtract this bias when reconstructing the scalar from its wNAF representation. Thus, the final scalar reconstruction formula is:

$$
\begin{aligned}
a &= \left(\sum_{i=0}^{n-1} (b_i + \windex{2^w}) \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + c_0 - \mathfrak{s}_c - \underbrace{ \left( \sum_{i=0}^{n-1} \windex{2^{w}} \cdot \windex{2^{wi}} \right) \cdot \windex{2^t}}_{\textsf{bias correction}}
\end{aligned}
$$

Similarly, the wNAF slice $c_0$ in the adjusted stagger term can be represented in terms of its raw wNAF value and sign bit as follows:

$$
\begin{aligned}
c_0 &= (1 - 2 \pi) \cdot (2 c + 1) \\
&=
\begin{cases}
(2 c + 1), & \text{if } \pi = 0 \\
-(2 c + 1), & \text{if } \pi = 1
\end{cases}
\end{aligned}
$$

Here as well, we can add a bias of $2^{w}$ to make $c_0$ non-negative (and then subtract the bias when reconstructing the scalar):

$$
\begin{aligned}
c_0 + \windex{2^{w}} &=
\begin{cases}
(\windex{2^{w}} + 2 c + 1), & \text{if } \pi = 0 \\
(\windex{2^{w}} - 2 c - 1), & \text{if } \pi = 1
\end{cases} \\
&=
\begin{cases}
2 \cdot (\windex{2^{w - 1}} + c) + 1, & \text{if } \pi = 0 \\
2 \cdot (\windex{2^{w - 1}} - c - 1) + 1, & \text{if } \pi = 1
\end{cases} \\
& =: \ 2 \cdot c' + 1.
\end{aligned}
$$

Substituting the expression for $(b_i + \windex{2^{w}})$ and $(c_0 + \windex{2^{w}})$, we get:

$$
\begin{aligned}
a &= \left(\sum_{i=0}^{n-1} (2 \cdot e'_i + 1)
\cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + (2 \cdot c' + 1) - \mathfrak{s}_c - \underbrace{\left( \left( \sum_{i=0}^{n-1} \windex{2^{w}} \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + \windex{2^{w}} \right)}_{\textsf{bias correction due to b and c}} \\
&= \left(\sum_{i=0}^{n-1} (2 \cdot e'_i)
\cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + (2 \cdot c') - \mathfrak{s}_c - \underbrace{\left( \left( \sum_{i=0}^{n-1} (\windex{2^{w} - 1}) \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + (\windex{2^{w} - 1}) \right)}_{\textsf{adjusted bias correction}}
\end{aligned}
$$

This expression is used in the circuit to reconstruct the scalar from its wNAF representation. The adjusted bias correction term is a constant that can be precomputed and hardcoded into the circuit.

#### Handling Large Scalars

When we have a scalar that is larger than $\frac{r}{2}$, to minimize the number of wNAF slices, we represent the negative of the scalar instead. Thus, for a scalar $a > \frac{r}{2}$, we define $a_{\textsf{negative}} := (r - a) < \frac{r}{2}$ as an $N$-bit scalar and represent $a_{\textsf{negative}}$ in wNAF form as described above. The final scalar multiplication is then computed as:

$$
\begin{aligned}
a \cdot P &= (r - a_{\textsf{negative}}) \cdot P \\
&= r \cdot P - a_{\textsf{negative}} \cdot P \\
&= - a_{\textsf{negative}} \cdot P
\end{aligned}
$$

Thus, to compute the wNAF representation of $-a_{\textsf{negative}} \in \mathbb{F}_r$, we can use the same expression as before (see Equation $(1)$). If $a_{\textsf{negative}}$ is represented as:

$$
\begin{aligned}
a_{\textsf{negative}} =
\left(\sum_{i=0}^{n-1} b_{i, \textsf{negative}} \cdot \windex{2^{wi}} \right) \cdot \windex{2^t}
+
\underbrace{\left(-\mathfrak{s}_{c, \textsf{negative}} + c_{0, \textsf{negative}} \right).}_{\textsf{adjusted stagger in wnaf form}}
\end{aligned}
$$

$$
\begin{aligned}
\implies -a_{\textsf{negative}} &= \left(\sum_{i=0}^{n-1} -b_{i, \textsf{negative}} \cdot \windex{2^{wi}} \right) \cdot \windex{2^t}
+
\mathfrak{s}_{c, \textsf{negative}} - c_{0, \textsf{negative}}.
\end{aligned}
$$

We can write the negative wNAF slices $-b_{i, \textsf{negative}}$ in terms of the raw wNAF values and sign bits as follows:

$$
\begin{aligned}
-b_{i, \textsf{negative}} &= -(1 - 2 \pi_{i, \textsf{negative}}) \cdot (2 e_{i, \text{negative}} + 1) \\
&=
\begin{cases}
-(2 e_{i, \text{negative}} + 1), & \text{if } \pi_{i, \textsf{negative}} = 0 \\
(2 e_{i, \text{negative}} + 1), & \text{if } \pi_{i, \textsf{negative}} = 1
\end{cases} \
\end{aligned}
$$

Similarly, we can add a bias of $2^{w}$ to each negative wNAF slice to make them non-negative:

$$
\begin{aligned}
-b_{i, \textsf{negative}} + 2^{w} &=
\begin{cases}
(\windex{2^{w}} - 2 e_{i, \text{negative}} - 1), & \text{if } \pi_{i, \textsf{negative}} = 0 \\
(\windex{2^{w}} + 2 e_{i, \text{negative}} + 1), & \text{if } \pi_{i, \textsf{negative}} = 1
\end{cases} \\
&=
\begin{cases}
2 \cdot (\windex{2^{w - 1}} - e_{i, \text{negative}} - 1) + 1, & \text{if } \pi_{i, \textsf{negative}} = 0 \\
2 \cdot (\windex{2^{w - 1}} + e_{i, \text{negative}}) + 1, & \text{if } \pi_{i, \textsf{negative}} = 1
\end{cases} \\
& =: \ 2 \cdot e'_{i, \textsf{negative}} + 1.
\end{aligned}
$$

We can similarly add a bias of $2^{w}$ to the adjusted stagger wNAF slice $c_{0, \textsf{negative}}$. Therefore, the final scalar reconstruction formula for $-a_{\textsf{negative}}$ is:

$$
\begin{aligned}
-a_{\textsf{negative}} &= \left(\sum_{i=0}^{n-1} (2e'_{i, \textsf{negative}}) \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + (2 \cdot c'_{\textsf{negative}}) + \mathfrak{s}_{c, \textsf{negative}} \\
& \quad
 - \underbrace{\left( \left( \sum_{i=0}^{n-1} (\windex{2^{w} - 1}) \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + (\windex{2^{w} - 1}) \right)}_{\textsf{adjusted bias correction for both b and c}}
\end{aligned}
$$

Notice that the terms $e'_{i, \textsf{negative}}$ and $c'_{\textsf{negative}}$ are similar to $e'_i$ and $c'$ respectively, except that the sign bits are flipped. Thus, we can use the same circuit logic to reconstruct both $a$ and $-a_{\textsf{negative}}$ from their wNAF representations with appropriate sign bit handling.
