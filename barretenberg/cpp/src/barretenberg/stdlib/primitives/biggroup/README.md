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
\cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + (2 \cdot c') - \mathfrak{s}_c - \underbrace{\left( \left( \sum_{i=0}^{n-1} (\windex{2^{w} - 1}) \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + (\windex{2^{w} - 1}) \right)}_{\textsf{adjusted bias correction}} \\
&= \underbrace{2 \cdot \left( \left(\sum_{i=0}^{n-1} e'_i \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + c' \right)}_{\textsf{positive part}} -
\underbrace{\left(\mathfrak{s}_c + \left( \sum_{i=0}^{n-1} (\windex{2^{w} - 1}) \cdot \windex{2^{wi}} \right) \cdot \windex{2^t} + (\windex{2^{w} - 1}) \right)}_{\textsf{negative part}} \\
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

### Signed Digit Representation

We can write the bit representation of an $n$-bit scalar $a$ with bits $a_0, a_1 \dots, a_{n - 1} \in \{0, 1\}$ as follows:

$$
\begin{aligned}
a &= \sum_{i=0}^{n-1} a_{i} \cdot \windex{2^{i}} \\
&= a_0 + \sum_{i=1}^{n-1} (2 \cdot a_{i}) \cdot \windex{2^{i - 1}} \\
&= a_0 + \sum_{i=1}^{n-1} (2 \cdot a_{i} - 1) \cdot \windex{2^{i - 1}}  + \underbrace{\sum_{i=1}^{n-1} \windex{2^{i - 1}}}_{\textsf{adjusted offset}} \\
&= a_0 + \sum_{i=1}^{n-1} (1 - 2 \cdot (1 - a_{i})) \cdot \windex{2^{i - 1}}  + \underbrace{(2^{n-1} - 1)}_{\textsf{adjusted offset}} \\
&= (a_0 - 1) + \sum_{i=1}^{n} (1 - 2 \cdot a'_{i}) \cdot \windex{2^{i - 1}}  \qquad \textsf{s.t. } a'_{n} = 0 \\
&= -(1 - a_0) + \sum_{i=0}^{n-1} \underbrace{(1 - 2 \cdot a'_{i+1})}_{b_i} \cdot \windex{2^{i}}  \qquad \textsf{s.t. } a'_{n} = 0 \\
\end{aligned}
$$

Here, $a'_{i + 1} \in \{0, 1\}$ are the signed digit representation of the scalar $a$ with the most significant digit $a'_n = 0$. Therefore, the new digits $b_i := (1 - 2 \cdot a'_{i + 1})$ can take values in $\{-1, 1\}$.
The term $(1 - a_0)$ is the skew factor $\mathfrak{s}_a \in \{0, 1\}$ which is 1 for even scalars and 0 for odd scalars. Thus, the final representation of an $n$-bit odd scalar $a$ in signed digit form is:

$$
\begin{aligned}
a &= -\mathfrak{s}_a + \sum_{i=0}^{n-1} b_i \cdot \windex{2^{i}}  \qquad \textsf{s.t. } b_i \in \{-1, 1\} \\
\end{aligned}
$$

where $\mathfrak{s}_a = 0$ if $a$ is odd and $\mathfrak{s}_a = 1$ if $a$ is even. Given $a'_{1}, \ldots, a'_{n}$, the signed digit representation of the scalar $a$, we can reconstruct the scalar $a$ in a circuit using the following formula:

$$
\begin{aligned}
a &= -\mathfrak{s}_a + \sum_{i=0}^{n-1} (1 - 2 \cdot a'_{i+1}) \cdot \windex{2^{i}} \\
&= -\mathfrak{s}_a + \sum_{i=0}^{n-1} (1 - a'_{i+1} - a'_{i+1}) \cdot \windex{2^{i}} \\
&= \underbrace{\sum_{i=0}^{n-1} (1 - a'_{i+1}) \cdot \windex{2^{i}}}_{\textsf{positive part}} - \underbrace{\left(\mathfrak{s}_a + \sum_{i=0}^{n-1} a'_{i+1} \cdot \windex{2^{i}} \right)}_{\textsf{negative part}}. \\
\end{aligned}
$$

Note that the positive and negative parts are both non-negative and can be computed in a circuit without any conditional logic.

### Strauss MSM with NAF

Given scalars $a_1, a_2, \dots, a_m \in \mathbb{F}_r$ and group elements $P_1, P_2, \dots, P_m \in \mathbb{G}$, the multi-scalar multiplication (MSM) is defined as:

$$
A = \sum_{j=1}^{m} a_j \cdot P_j
$$

In the Strauss MSM algorithm using NAF representation, we decompose each scalar $a_j$ into its NAF slices as follows:

$$
\begin{aligned}
a_j &= -\mathfrak{s}_j + \sum_{i=0}^{n-1} a_{j,n-1-i} \cdot \windex{2^{i}} \\
\end{aligned}
$$

where $a_{j,n-1-i} \in \{-1, 1\}$ are the NAF slices for scalar $a_j$ and $\mathfrak{s}_j \in \{0, 1\}$ is the skew factor for $a_j$. Note that $a_{j, 0}$ is the most-significant NAF slice. Let us draw a table of the NAF slices for all scalars along with the generator points:

$$
\begin{aligned}
\def\arraystretch{2}
\def\arraycolsep{40pt}
   \begin{array}{|c||c:c:c:c||c:c:c:c|}
   \hline
    \textcolor{olive}{P_1} & a_{1,0} & a_{1,1} & a_{1,2} & a_{1,3} & a_{1, 4} & \cdots & a_{1,n-2} & a_{1,n-1} \\ \hline
    \textcolor{olive}{P_2} & a_{2,0} & a_{2,1} & a_{2,2} & a_{2,3} & a_{2, 4} & \cdots & a_{2,n-2} & a_{2,n-1} \\ \hline
    \textcolor{olive}{P_3} & a_{3,0} & a_{3,1} & a_{3,2} & a_{3,3} & a_{3, 4} & \cdots & a_{3,n-2} & a_{3,n-1} \\ \hline
    \textcolor{olive}{P_4} & a_{4,0} & a_{4,1} & a_{4,2} & a_{4,3} & a_{4, 4} & \cdots & a_{4,n-2} & a_{4,n-1} \\ \hline
    \textcolor{olive}{P_5} & a_{5,0} & a_{5,1} & a_{5,2} & a_{5,3} & a_{5, 4} & \cdots & a_{5,n-2} & a_{5,n-1} \\ \hline
    \vdots & \vdots & \vdots & \vdots & \vdots & \vdots & \qquad \ddots \qquad  & \vdots & \vdots \\ \hline
    \textcolor{olive}{P_m} & a_{m,0} & a_{m,1} & a_{m,2} & a_{m,3} & a_{m, 4} & \cdots &  a_{m,n-2} & a_{m,n-1} \\
    \hline
\end{array}
\end{aligned}
$$

We group the generator points in sizes of 5 points each (the last group can have less than 5 points). We sometimes use 6 points per group if the net number of tables can be reduced for optimization purposes. In this case, for the first 5 points, we compute the following ROM lookup table:

$$
\begin{aligned}
\def\arraystretch{2}
\def\arraycolsep{40pt}
   \begin{array}{|c||c|}
   \hline
    \textsf{Index} & \textsf{Group Element} \\ \hline \hline
    0 & \textcolor{olive}{P_1} + \textcolor{olive}{P_2} + \textcolor{olive}{P_3} + \textcolor{olive}{P_4} + \textcolor{olive}{P_5} \\ \hline
    1 & \textcolor{olive}{P_1} + \textcolor{olive}{P_2} + \textcolor{olive}{P_3} + \textcolor{olive}{P_4} - \textcolor{olive}{P_5} \\ \hline
    2 & \textcolor{olive}{P_1} + \textcolor{olive}{P_2} + \textcolor{olive}{P_3} - \textcolor{olive}{P_4} - \textcolor{olive}{P_5} \\ \hline
    \vdots & \vdots \\ \hline
    15 & \textcolor{olive}{P_1} - \textcolor{olive}{P_2} - \textcolor{olive}{P_3} - \textcolor{olive}{P_4} - \textcolor{olive}{P_5} \\ \hline
    16 & -\textcolor{olive}{P_1} + \textcolor{olive}{P_2} + \textcolor{olive}{P_3} + \textcolor{olive}{P_4} + \textcolor{olive}{P_5} \\ \hline
    17 & -\textcolor{olive}{P_1} + \textcolor{olive}{P_2} + \textcolor{olive}{P_3} + \textcolor{olive}{P_4} - \textcolor{olive}{P_5} \\ \hline
    \vdots & \vdots \\ \hline
    31 & -\textcolor{olive}{P_1} - \textcolor{olive}{P_2} - \textcolor{olive}{P_3} - \textcolor{olive}{P_4} - \textcolor{olive}{P_5} \\ \hline
\end{array}
\end{aligned}
$$

Going back to the NAF slice table, we can see that each column (i.e., each NAF slice index) corresponds to one of the entries in the above ROM table. For instance, the first column corresponds to the group element selected from the ROM table based on the signs of $a_{1,0}, a_{2,0}, a_{3,0}, a_{4,0}, a_{5,0}$. For example, since the first column always has values $(1, 1, 1, 1, 1)$, then we select the group element $(\textcolor{olive}{P_1} + \textcolor{olive}{P_2} + \textcolor{olive}{P_3} + \textcolor{olive}{P_4} + \textcolor{olive}{P_5})$ from the ROM table (which corresponds to index 0). We do this for all groups of 5 points in a given column and sum the selected group elements to get the total group element for that NAF slice column.

$$
\begin{aligned}
\def\arraystretch{1.6}
\begin{array}{c}
\begin{array}{|c||c|}
\hline
\textcolor{olive}{P_1} & a_{1,i} \\ \hline
\textcolor{olive}{P_2} & a_{2,i} \\ \hline
\textcolor{olive}{P_3} & a_{3,i} \\ \hline
\textcolor{olive}{P_4} & a_{4,i} \\ \hline
\textcolor{olive}{P_5} & a_{5,i} \\ \hline
\end{array}
\left.
\begin{array}{c}
\\ \\ \\ \\ \\
\end{array}
\right\} \xrightarrow{\text{lookup from ROM table 1}} \ \textcolor{orange}{Q_{i,1}}
\end{array}
\\
\def\arraystretch{1.6}
\begin{array}{c}
\begin{array}{|c||c|}
\hline
\textcolor{olive}{P_6} & a_{6,i} \\ \hline
\textcolor{olive}{P_7} & a_{7,i} \\ \hline
\textcolor{olive}{P_8} & a_{8,i} \\ \hline
\textcolor{olive}{P_9} & a_{9,i} \\ \hline
\textcolor{olive}{P_{10}} & a_{10,i} \\ \hline
\end{array}
\left.
\begin{array}{c}
\\ \\ \\ \\ \\
\end{array}
\right\} \xrightarrow{\text{lookup from ROM table 2}} \ \textcolor{orange}{Q_{i,2}}
\end{array}
\\
\vdots \\
\def\arraystretch{1.6}
\begin{array}{c}
\begin{array}{|c||c|}
\hline
\textcolor{olive}{P_{m-2}} & a_{m-2,i} \\ \hline
\textcolor{olive}{P_{m-1}} & a_{m-1,i} \\ \hline
\textcolor{olive}{P_{m}} & a_{m,i} \\ \hline
\end{array}
\left.
\begin{array}{c}
\\ \\ \\
\end{array}
\right\} \xrightarrow{\text{lookup from ROM table k}} \ \textcolor{orange}{Q_{i,k}}
\end{array}
\end{aligned}
$$

Here, $\textcolor{orange}{Q_{i,1}}, \textcolor{orange}{Q_{i,2}}, \dots, \textcolor{orange}{Q_{i,k}}$ are the selected group elements from each ROM table for the $i^{th}$ NAF slice column. We then sum these group elements to get the total group element for the $i^{th}$ NAF slice column:

$$
\textcolor{violet}{Q_{i}} = \textcolor{orange}{Q_{i,1}} + \textcolor{orange}{Q_{i,2}} + \dots + \textcolor{orange}{Q_{i,k}}
$$

To accumulate results from all columns, we iterate over the NAF columns in groups of 4 columns at a time. For each group of 4 columns, we perform the following steps:

1. For each NAF column in the group, we compute the accumulated group element $\textcolor{violet}{Q_i}$ as described above by performing ROM lookups and additions.
2. Suppose the accumulated group elements for the 4 columns are $\textcolor{violet}{Q_0}, \textcolor{violet}{Q_1}, \textcolor{violet}{Q_2}, \textcolor{violet}{Q_3}$. We then add these group elements to the overall accumulator with appropriate doublings. Specifically, we perform the following operation on the accumulator $R$:

$$
R = 2 \cdot \Big( 2 \cdot \big(2\cdot (2 \cdot R + \textcolor{violet}{Q_0}) + \textcolor{violet}{Q_1}\big) + \textcolor{violet}{Q_2}\Big) + \textcolor{violet}{Q_3}
$$

3. Lastly, after processing all NAF columns, we need to account for the skew factors $\mathfrak{s}_j$ for each scalar $a_j$:
   - If $\mathfrak{s}_j = 1$, we subtract the corresponding group element $P_j$ from the accumulator $R$.
   - If $\mathfrak{s}_j = 0$, we do nothing.

Thus, the final result of the Strauss MSM using NAF representation is given by:

$$
A = R - \sum_{j=1}^{m} \mathfrak{s}_j \cdot \textcolor{olive}{P_j}.
$$

#### Handling Points at Infinity

In the above Strauss MSM algorithm using NAF representation, if any of the group elements $P_j$ is the point at infinity (denoted as $\mathcal{O}$), we replace the pair $(\textcolor{olive}{P_j}, a_j)$ with $(\textcolor{olive}{G}, 0)$ in the input. This ensures that the contribution of that point to the MSM is effectively nullified, as multiplying any point by zero results in the point at infinity. Here, $\textcolor{olive}{G}$ is the generator point on the curve. This substitution allows us to maintain the structure of the MSM algorithm without introducing special cases for points at infinity.

Once we replace all points at infinity with $(\textcolor{olive}{G}, 0)$, we can proceed with the Strauss MSM algorithm as described above. However, when we construct the ROM tables, one of the entries can lead to a point at infinity if the group elements are linearly dependent. For instance, given distinct points $\textcolor{olive}{P_1}, \textcolor{olive}{P_2}, \textcolor{olive}{P_3}, \textcolor{olive}{P_4}, \textcolor{olive}{P_5} \in \mathbb{G}$, if we have $\textcolor{olive}{P_5} = (\textcolor{olive}{P_1} + \textcolor{olive}{P_2} + \textcolor{olive}{P_3} + \textcolor{olive}{P_4})$, then the entry at index $1$ in the ROM table will be the point at infinity. Our circuit implementation does not allow for such cases and will throw an error asserting that the $x$-coordinates of two points being added are equal (which happens when adding a point to its negation). Therefore, it is crucial to ensure that the input points are linearly independent to avoid points at infinity in the ROM tables. To achieve this, we can perform a pre-processing step on the input points to add a small random multiple of the generator point to each input point.

$$
\begin{aligned}
\textcolor{olive}{P_j} &\leftarrow \textcolor{olive}{P_j} + 2^{j} \cdot \delta \cdot \textcolor{olive}{G} \\
\end{aligned}
$$

where $\delta$ is a verifier-chosen, 128-bit random scalar in $\mathbb{F}_r$. This randomization helps in breaking any linear dependencies among the points, thereby preventing the occurrence of points at infinity in the ROM tables during the MSM computation. The reason we need to use a verifier-chosen scalar is to ensure that a malicious prover cannot manipulate input points to create linear dependencies that could lead to inability to generate valid proofs. We choose powers of 2 multiples of $\delta$ to ensure that the randomization does not add significant overhead to the recursive circuit. Specifically, we need to compute $\delta \cdot \textcolor{olive}{G}$ just once, and then we can obtain $2^{j} \cdot \delta \cdot \textcolor{olive}{G}$ by performing $j$ doublings, which is efficient in terms of circuit complexity. This approach effectively mitigates the risk of points at infinity while keeping the overhead manageable.

Even after randomization, we can still encounter points at infinity while accumulating the outputs of the ROM lookups for the first two NAF columns. For example, suppose the NAF slices for for a 5-point MSM in the first two rounds are as follows:

$$
\begin{aligned}
\def\arraystretch{1.6}
\begin{array}{c}
\begin{array}{|c||c|c|c|c|}
\hline
& \textsf{round 1} & \textsf{round 2} \\ \hline \hline
\textcolor{olive}{P_1} & +1 & -1 \\ \hline
\textcolor{olive}{P_2} & +1 & -1 \\ \hline
\textcolor{olive}{P_3} & +1 & -1 \\ \hline
\textcolor{olive}{P_4} & +1 & -1 \\ \hline
\textcolor{olive}{P_5} & +1 & -1 \\ \hline \hline
\textsf{column output} & \textcolor{violet}{Q_{1}} & \textcolor{violet}{Q_{2}} \\ \hline
\end{array}
\end{array}
\end{aligned}
$$

In this case, since $\textcolor{violet}{Q_{2}} = -\textcolor{violet}{Q_{1}}$, while initialising the accumulator $R$:

$$
\begin{aligned}
R &= 2 \cdot \textcolor{violet}{Q_{1}} + \textcolor{violet}{Q_{2}} =
\underbrace{(\textcolor{violet}{Q_{1}} + \textcolor{violet}{Q_{2}})}_{= \ \mathcal{O}} + (\textcolor{violet}{Q_{1}}) \\
\end{aligned}
$$

Our Montmogomery ladder implementation requires that the two points being added have distinct $x$-coordinates, which is not the case here since $\textcolor{violet}{Q_{2}} = -\textcolor{violet}{Q_{1}}$. So an honest prover would fail to generate a valid proof. To prevent this, we can add a random offset generator to the first column output before adding it to the accumulator:

$$
\begin{aligned}
R &= 2 \cdot (\textcolor{violet}{Q_{1}} + \windex{G_{\textsf{offset}}}) + \textcolor{violet}{Q_{2}} \\
\end{aligned}
$$

Adding this offset generator ensures that the two points being added have distinct $x$-coordinates during the addition operation in the Montgomery ladder.

> Note that we do not choose the offset generator to be dependent on the random scalar $\delta$ used for point randomization. This is safe when we are masking the points with random multiples of the generator, as a malicious prover cannot control the randomization applied to the masked points. However, this could be a vulnerability if the input points were not masked, as a malicious prover could potentially exploit knowledge of the offset generator to create points at infinity. In our usage of the `batch_mul` implementation in the recursive circuit, we always mask the input points, so using a fixed offset generator is secure. When using `scalar_mul` to aggregate pairing points in the recursive verifier, we do not apply masking to the input point. However, since the pairing points themselves are derived using verifier-chosen randomness, there is no risk of a malicious prover exploiting the offset generator in this context.

In summary, the modified MSM computation becomes:

$$
\begin{aligned}
A &= \sum_{j=1}^{m} a_j \cdot (\textcolor{olive}{P_j} + 2^{j} \cdot \textcolor{olive}{\delta G}) - \left(\sum_{j=1}^{m} 2^{j} \cdot a_j \right) \cdot \textcolor{olive}{\delta G} \\
&= \sum_{j=1}^{m} a_j \cdot \underbrace{(\textcolor{olive}{P_j} + 2^{j} \cdot \textcolor{olive}{\delta G})}_{=: \ \textcolor{olive}{P'_j}} - \underbrace{\left(\sum_{j=1}^{m} \frac{2^{j} \cdot a_j}{2^{m+1}} \right)}_{=: \ a_{m+1}} \cdot \underbrace{(2^{m+1} \cdot \textcolor{olive}{\delta G})}_{=: \ \textcolor{olive}{P'_{m+1}}} \\
&= \sum_{j=1}^{m+1} a_j \cdot \textcolor{olive}{P'_j}
\end{aligned}
$$

Substituting the NAF representation of each scalar $a_j, j \in [1, m+1]$ into the MSM computation, we get:

$$
\begin{aligned}
A &= \sum_{j=1}^{m+1} \left( -\mathfrak{s}_{j} + \sum_{i=0}^{n-1} \windex{2^{i}} \cdot a_{j, n-1-i} \right) \cdot \textcolor{olive}{P'_j} \\
&= \sum_{j=1}^{m+1} \left( \sum_{i=0}^{n-1} \windex{2^{i}} \cdot a_{j, n-1-i} \right) \cdot \textcolor{olive}{P'_j} - \sum_{j=1}^{m+1} \mathfrak{s}_{j} \cdot \textcolor{olive}{P'_j} \\
&= \windex{2^{n - 1}} \cdot \underbrace{\left(\sum_{j=1}^{m+1}  a_{j, 0} \cdot \textcolor{olive}{P'_j}\right)}_{=: \ \textcolor{violet}{Q_1}} + \sum_{i=1}^{n-1} \windex{2^{i}} \cdot \underbrace{\left( \sum_{j=1}^{m+1} a_{j, n-1-i} \cdot \textcolor{olive}{P'_j} \right)}_{\textcolor{violet}{Q_i}} - \sum_{j=1}^{m+1} \mathfrak{s}_{j} \cdot \textcolor{olive}{P'_j} \\
&= \windex{2^{n-1}} \cdot \left( \textcolor{violet}{Q_1} + \windex{G_{\textsf{offset}}} \right) - \windex{2^{n-1}} \cdot \windex{G_{\textsf{offset}}} + \left(\sum_{i=1}^{n-1} \windex{2^{i}} \cdot \textcolor{violet}{Q_i}\right) - \left(\sum_{j=1}^{m+1} \mathfrak{s}_{j} \cdot \textcolor{olive}{P'_j}\right). \\
\end{aligned}
$$

Thus, we need to subtract the term $\windex{2^{n-1}} \cdot \windex{G_{\textsf{offset}}}$ from the final MSM result to account for the offset generator added to the first NAF column output. This ensures that the final MSM result is correct and unaffected by the offset generator used to prevent points at infinity during intermediate computations.
