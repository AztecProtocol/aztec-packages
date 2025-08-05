$\newcommand{\radd}{{\ \textcolor{lightgreen}{+} \ }}$
$\newcommand{\rsub}{{\ \textcolor{lightgreen}{-} \ }}$
$\newcommand{\rmul}{{\ \textcolor{lightgreen}{*} \ }}$
$\newcommand{\padd}{{\ \textcolor{red}{+} \ }}$
$\newcommand{\pmul}{{\ \textcolor{red}{*} \ }}$
$\newcommand{\const}[1]{\textcolor{gray}{#1}}$
$\renewcommand{\prime}[1]{#1_{\textsf{prime}}}$
$\newcommand{\fq}{\mathbb F_q}$
$\newcommand{\fr}{\mathbb F_r}$
$\newcommand{\zr}{\mathbb Z/r\mathbb Z}$
$\newcommand{\zq}{\mathbb Z/q\mathbb Z}$
$\newcommand{\NeutralElt}{\mathcal{O}}$
$\newcommand{\qadd}{q_{\text{add}}}$
$\newcommand{\qmul}{q_{\text{mul}}}$
$\newcommand{\qeq}{q_{\text{eq}}}$
$\newcommand{\qreset}{q_{\text{reset}}}$

# ECCVM (ElliptiC Curve Virtual Machine) in Barretenberg

> $\textcolor{orange}{\textsf{Warning}}$: This document is intended to provide an overview of the ECCVM in barretenberg. It is not a complete specification and does not cover all edge cases or optimizations. The source code should be consulted for a complete understanding of the implementation.

## Notation

- $\fq$ is the prime field of size $q= 21888242871839275222246405745257275088696311157297823662689037894645226208583$.
- $\fr$ is the prime field of size $r = 21888242871839275222246405745257275088548364400416034343698204186575808495617$.
- $E/\fq$ is the elliptic curve whose Weierstrauss equation is: $y^2 = x^3 + 3$. This is known as the _BN-254_ curve.
- $C/\fr$ is the elliptic curve whose Weierstrauss equation is: $y^2 = x^3 - 17$. This is known as the _Grumpkin_ curve.

We have the following facts:

- $2r>q>r$
- $C(\fr)$ is a cyclic group of order $q$, i.e., is isomorphic to $\zq$
- $E(\fq)$ is a cyclic group of order $r$, i.e., is isomorphic to $\zr$.

In general, the notation $\zq$ and $\zr$ refers to the additive abelian groups; we use $\fq$ and $\fr$ when we require the multiplicative structure. We unfortunately do not strictly abide by this convention, as this is indeed not usual in cryptography, but we think it is nonetheless helpful for disambiguating what we are using.

## Bird's eye overview/motivation

In a nutshell, the ECCVM is a simple virtual machine to facilitate the verification native elliptic curve computations. In our setting, this means that given an `op_queue` of BN-254 operations, the ECCVM compiles the execution of these operations into an _execution trace representation_ over $\fq$, the _field of definition_ (a.k.a. base field) of BN-254 and the _scalar field_ of Grumpkin.

In a bit more detail, the ECCVM is an compiler that takes a sequence of operations (in BN-254) and produces a table of numbers, such that the correct evaluation of the sequence of operations precisely corresponds to polynomial constraints vanishing on the rows of this table of numbers. Moreover, this polynomial constraints are independent of the specific sequence of operations. The core complication in the ECCVM comes from the _efficient_ handling of multi-scalar multiplications (MSMs).

In fact, due to our MSM optimizations, we produce _three_ tables, where each table has it's own set of multivariate polynomials, such that the correct evaluation of the operations corresponds to each table's multivariates evaluating to zero on each row. These tables will "communicate" with each other via lookup arguments and multiset-equality checks.

## Op Queue

To understand what the OpQueue is, we first need to understand `EccOpCode` and what the VM operations are. Loosely, the OpQueue is a list of operations on a fixed elliptic curve, which in particular admit an accumulator which propages from instruction to instruction. It may therefore be seen as a finite state machine with a single register.

### Operations

At any moment, we have an accumulated value $A$, and the potential operations are:
`add`, `mul`, `eq`, `reset`, `eq_and_reset`. There are four selectors: $\qadd$, $\qmul$, $\qeq$, and $\qreset$, so all the operations except for `eq_and_reset` correspond to a unique selector being on. Given an operation, we have an associated op code value.
| `EccOpCode` | Op Code Value |
|-----------|---------|
| `add` | $8$ |
| `mul` | $4$ |
| `eq_and_reset` | $3$ |
| `eq` | $2$ |
| `reset` | $1$ |

On the level of selectors, `opcode_value`=$8\qadd + 4 \qmul + 2 \qeq + \qreset$.

#### Description of operations.

- `add` will take in a single argument: a point $P$ of my curve, and the accumulator is updated $A\leftarrow A+ P$.
- `mul` takes in two arguments: $P$, $s$, where $s\in\fr$ (i.e., $s$ is a "scalar" for our curve), and the accumulator is updated $A\leftarrow A + sP$
- `eq` takes in an argument, $P$, and "checks" that $A == P$.
- `reset` sets the accumulator to $\mathcal O$, the neutral element of the group.
- `eq_and_reset` takes in an argument, $P$, "checks" that $A == P$, and then resets the accumulator to the neutral element.

### Decomposing scalars

_Decomposing scalars_ is an important optimization for (multi)scalar multiplications that is especially helpful if we are doing scalar multiplications where the scalar has 128 bits, i.e., is small.

Note that both $\fr$ and $\fq$ have a non-trivial cube roots of unity. (Their orders are both $1\mod(3)$.) We fix $\beta\in\fq$ to be a primitive cube root of unity. Note that $\beta$ induces an order 6 automorphism $\varphi$ of BN-254, defined on the level of points as:
$$\varphi\colon (x, y)\mapsto (\beta x, -y).$$

As $E(\fq)\cong \zr$, and the natural map $\fr\rightarrow \text{End}_{\text{ab. gp}}(\zr)$ is an isomorphism, it follows that $\varphi$ corresponds to an element $\lambda\in \fr$. Then $\lambda$ satisfies a quadratic equation: $$\lambda^2 - \lambda + 1,$$
(and indeed $\varphi$ satisfies the same equation when considered as an endomorphism). In particular, $\lambda^2$ is a cube root of unity in $\fr$.

Now, given $s\in \zr$, we wish to write $s = z_1 + \lambda z_2$ where $z_i$ are "small". This follows from some lattice theory. Indeed, we consider the lattice $L:=\text{ker}\big( \mathbb Z^2 \rightarrow \zr\big)$, given by $(a, b)\mapsto a + \lambda b$. The discriminant of this lattice is $3r$; then there is a unique choice of $z_1$ and $z_2$ in any given fundamental domain. The fundamental domain around the origin lies in the box (a.k.a. Babai cell) with side length $B:=\frac{\sqrt{3r}}{2}$. Plugging in numbers, we see $B< 2^{128}$, and the result follows.

### Column representation (a.k.a. the Input Trace)

An operation in the OpQueue may be entered into a table as follows:

| `op` | `X` | `Y` | `z_1` | `z_2` | `mul_scalar_full` |

Here, `op` is the value of the operation, $(X, Y)$ are the _affine_ coordinates of $P$, `mul_scalar_full` stands for "full scalar if the operation is `mul`" (so is an element of $\fr$), and `z_1` and `z_2` are a decomposition of `mul_scalar_full` as explained above. In particular, `z_1` and `z_2` may each be represented by 128 bits.

### VM operations

The column representation is naturally equivalent to the representation as a VM operation.

```
struct ECCVMOperation {
    using Curve = curve::BN254;
    using AffineElement = Curve::Group::affine_element;
    using Fr = Curve::ScalarField;
    EccOpCode op_code = {};
    AffineElement base_point = { 0, 0 };
    uint256_t z1 = 0;
    uint256_t z2 = 0;
    Fr mul_scalar_full = 0;
    bool operator==(const ECCVMOperation& other) const = default;
};
```

### Op Queue

From the perspective of the ECCVM, the `ECCOpQueue` just contains a list of `ECCVMOperation`s, i.e., it is just an Input Trace. It is worth noting that the `ECCOpQueue` class indeed contains more moving parts, to link together the ECCVM with the rest of the Goblin protocol.

## Tables and the Straus algorithm

As explained in the introduction, the ECCVM takes in an `ECCOpQueue`, which corresponds to the execution of a list of operations in BN-254, and constructs three tables, together with a collection of multivariate polynomials for each table, along with some lookup constraints. (The number of variables of a polynomial associated with a table is precisely the number of columns of that table.) Then the key claim is that if (1) the polynomials associated to each table vanish on every row, (2) the lookups are satisfied, and some multi-set equivalences hold (which mediate _between_ tables), then the tables corresponds to the correct execution of the `ECCOpQueue`, i.e., to the correct execution of the one-register elliptic curve state machine.

The `mul` opcode is the only one that is non-trivial to evaluate, especially efficieintly. One straightforward way to encode the `mul` operation is to break up the scalar into its bit representation and use a double-and-add procedure. We opt for the Straus MSM algorithm with $w=4$, which requires more precomputing but is significantly more efficient.

### Straus Algorithm.

Recall, our goal is to compute $$\displaystyle \sum_{i=0}^{m-1} s_i P_i,$$ where $s_i\in \fr$ and $P_i$ are points on BN-254, i.e., we want to evaluate a multi-scalar multiplication of length $m$. We set $w=4$, as this is our main use-case. (In the code, this is represented as `static constexpr size_t NUM_WNAF_DIGIT_BITS = 4;`.) We have seen about that, setting $P'_i:=\varphi(P_i) = \lambda P_i$, we may write $s_iP_i = z_{i, 1}P_i + z_{i, 2}P'_i$, where $z_{i,j}$ has no more than 128 bits. We therefore assume that our scalars have no greater than 128 bits.

#### wNAF

The first thing to specify is our windowed non-adjacent form (wNAF). This is an optimization for computing scalar multiplication. Moreover, the fact that we are working with an elliptic curve in Weierstrauss form effectively halves the number of precomputes we need to perform.

$\textcolor{orange}{\textsf{Warning}}$: our implementation is _not_ what is usually called wNAF. To avoid confusion, we simply avoid discussion on traditional (w)NAF.

Here is the key mathematical claim: for a 128-bit positive number $s$, we can uniquely write:
$$s = \sum_{j=0}^{31} a_j 2^{4j} + \text{skew},$$
where

- each $a_j\in \{-2^{4}+1, -2^{4}+3,\ldots, 2^{4}-1\}$
- $\text{skew}\in\{0, 1\}$.

In our implementation, we force $a_{31}>0$ to guarantee that $s$ is positive.

The above decomposition is referred to in the code as the wNAF representation. Each $a_i$ is referred to either as a wNAF slice or digit.

We will come shortly to the algorithm, but as for the motivation: in our implementation, the neutral point of the group (i.e., point-at-infinity) poses some technical challenges for us. $\textcolor{red}{\text{explain why?}}$ It is therefore advantageous to avoid having to extraneously perform operations involving this, especially when we are implementing the recursive ECCVM verifier.

#### Straus

Here is the problem: efficiently compute $$\displaystyle \sum_i s_i P_i,$$ where the $s_i$ are 128-bit numbers and $P_i$ are points in BN-254. (Recall that we reduce to the case of 128-bit scalars by decomposing, as explained above.)

To do this, we break up our computation into steps.

##### Precomputation

For each $s_i$, we expand it in wNAF form:$s_i = \sum_{j=0}^{31} a_{i, j} 2^{4j} + \text{skew}_i$.

For every $P_i$, precompute and store the multiples: $$\{-15P_i, -13P_i, \ldots, 13P_i, 15P_i\}$$
as well as $2P_i$. Note that, $E$ is represented in Weierstrauss form, $nP$ and $-nP$ have the same affine $y$-coordinate and the $x$-coordinates differ by a sign.

##### Algorithm

There is one important static variable we require: `static constexpr size_t ADDITIONS_PER_ROW = 4;`. This says that we can do 4 primitive EC additions per "row" of the virtual machine. It is a happy convenience that `ADDITIONS_PER_ROW == NUM_WNAF_DIGIT_BITS`, i.e., that both are 4.

1. Set $A = \NeutralElt$ to be the neutral element of the group.
2. For $j\in [0, \ldots, 31]$, do:
   1. Set $A\leftarrow 2^w A= 16 A$
   2. For $k\in [0,\ldots, \lceil \frac{m}{4}\rceil]$ (here, $k$ is the "row" in the VM), do:
      1. Set $A\leftarrow A + a_{4k, j}P_{4k} + a_{4k+1, j}P_{4k+1} + a_{4k+2, j}P_{4k+2} + a_{4k+3, j}P_{4k+3}$, where the individual scalar multiples are _looked up_.
3. For $j = 32$, do:
   1. For $k\in [0,\ldots, \lceil \frac{m}{4}\rceil]$, do:
      1. Set $A\leftarrow A + \text{skew}_{4k, j}P_{4k} + \text{skew}_{4k+1, j}P_{4k+1} + \text{skew}_{4k+2, j}P_{4k+2} + \text{skew}_{4k+3, j}P_{4k+3}$, where the individual scalar multiples are _looked up_.
4. Return $A$.

### Tables

We have three tables that mediate the computation. As explained above, all of the computations are easy except for scalar multiplications. We process the computation and chunk what looks like scalar multiplications into MSMs. Here is the brief outline.

- `transcript_builder`. The transcript columns organize and process all of the computations _except for the scalar multiplications_. In particular, the Transcript Columns _do not bear witness_ to the intermediate computations necessary for MSMs. However, they still "access" the results of these computations.
- `precomputed_tables_builder`. The precomputed columns are: for every $P$ that occurs in an MSM (which was syntactically pulled out by the `transcript_builder`)
- `msm_builder` actually computes/constrains the MSMs.

A final note: apart from three Lagrange columns, all columns are either 1. part of the input trace; or 2. witness columns committed to by the Prover.

In the following tables, each column has a defined "value range". If the range is not
$\fq$, the column must be range constrained, either with an explicit range check or implicitly through range constraints placed on other columns that define relations over the target column.

#### Transcript Columns

| column name                                | builder name                    | value range        | computation                                                                                                                          | description                                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|                                            |                                 |                    | $\textcolor{blue}{\textbf{Populated in the first loop}}$                                                                             |                                                                                                                                                                                                                    |
| transcript_msm_infinity                    | transcript_msm_infinity         | $\{0, 1 \}$        | `msm_output.is_point_at_infinity();`                                                                                                 | are we at the end of an MSM \_and\* is the output the point at infinity?                                                                                                                                           |
| transcript_accumulator_not_empty           | accumulator_not_empty           | $\{0, 1 \}$        | `row.accumulator_not_empty = !state.is_accumulator_empty;`, `final_row.accumulator_not_empty = !updated_state.is_accumulator_empty;` | not(is the accumulator either empty or point-at-infinity?)                                                                                                                                                         |
| transcript_add                             | q_add                           | $\{0, 1 \}$        |                                                                                                                                      | is opcode                                                                                                                                                                                                          |
| transcript_mul                             | q_mul                           | $\{0, 1 \}$        |                                                                                                                                      | is opcode                                                                                                                                                                                                          |
| transcript_eq                              | q_eq                            | $\{0, 1\}$         |                                                                                                                                      | is opcode                                                                                                                                                                                                          |
| transcript_reset_accumulator               | q_reset_accumulator             | $\{0, 1 \}$        |                                                                                                                                      | does opcode reset accumulator?                                                                                                                                                                                     |
| transcript_msm_transition                  | msm_transition                  | $\{0, 1\}$         | `msm_transition = is_mul && next_not_msm && (state.count + num_muls > 0);`                                                           | are we at the end of an msm? i.e., is current transcript row the final `mul` opcode of a MSM                                                                                                                       |
| transcript_pc                              | pc                              | $\mathbb{F}_q$     | `updated_state.pc = state.pc - num_muls;`                                                                                            | _decreasing_ program counter                                                                                                                                                                                       |
| transcript_msm_count                       | msm_count                       | $\mathbb{F}_q$     | `updated_state.count = current_ongoing_msm ? state.count + num_muls : 0;`                                                            | Number of muls so far in the \*current\* MSM (NOT INCLUDING the current step)                                                                                                                                      |
| transcript_msm_count_zero_at_transition    | msm_count_zero_at_transition    | $\{0, 1\}$         | `((state.count + num_muls) == 0) && entry.op_code.mul && next_not_msm;`                                                              | is the number of scalar muls we have completed at the end of our "MSM block" zero?                                                                                                                                 |
| transcript_Px                              | base_x                          | $\mathbb{F}_q$     |                                                                                                                                      | (input trace) x-coordinate of base point $P$                                                                                                                                                                       |
| transcript_Py                              | base_y                          | $\mathbb{F}_q$     |                                                                                                                                      | (input trace) y-coordinate of base point $P$                                                                                                                                                                       |
| transcript_base_infinity                   | base_infinity                   | $\{0, 1\}$         |                                                                                                                                      | is $P=\NeutralElt$?                                                                                                                                                                                                |
| transcript_z1                              | z1                              | $[0,2^{128})$      |                                                                                                                                      | (input trace) first part of decomposed scalar                                                                                                                                                                      |
| transcript_z2                              | z2                              | $[0,2^{128})$      |                                                                                                                                      | (input trace) second part of decomposed scalar                                                                                                                                                                     |
| transcript_z1zero                          | z1_zero                         | $\{0, 1\}$         |                                                                                                                                      | is z1 zero?                                                                                                                                                                                                        |
| transcript_z2zero                          | z2_zero                         | $\{0, 1\}$         |                                                                                                                                      | is z2 zero?                                                                                                                                                                                                        |
| transcript_op                              | op_code                         | $\in \mathbb{F}_q$ | `entry.op_code.value();`                                                                                                             | 8 `q_add` + 4 `q_mul` + 2 `q_eq` + `q_reset`                                                                                                                                                                       |
|                                            |                                 |                    | $\textcolor{blue}{\textbf{Populated after converting from projective to affine coordinates}}$                                        |                                                                                                                                                                                                                    |
| transcript_accumulator_x                   | accumulator_x                   | $\in \mathbb{F}_q$ |                                                                                                                                      | x-coordinate of accumulator $A$                                                                                                                                                                                    |
| transcript_accumulator_y                   | accumulator_y                   | $\in \mathbb{F}_q$ |                                                                                                                                      | y-coordinate of accumulator $A$                                                                                                                                                                                    |
| transcript_msm_x                           | msm_output_x                    | $\in \mathbb{F}_q$ |                                                                                                                                      | if we are at the end of an MSM, (output of MSM) + `offset_generator()` = `(msm_output_x, msm_output_y)`, else 0                                                                                                    |
| transcript_msm_y                           | msm_output_y                    | $\in \mathbb{F}_q$ |                                                                                                                                      | if we are at the end of an MSM, (output of MSM) + `offset_generator()` = `(msm_output_x, msm_output_y)`, else 0                                                                                                    |
| transcript_msm_intermediate_x              | transcript_msm_intermediate_x   | $\in \mathbb{F}_q$ |                                                                                                                                      | if we are at the end of an MSM, (output of MSM) = `(transcript_msm_intermediate_x, transcript_msm_intermediate_y)`, else 0                                                                                         |
| transcript_msm_intermediate_y              | transcript_msm_intermediate_y   | $\in \mathbb{F}_q$ |                                                                                                                                      | if we are at the end of an MSM, (output of MSM) = `(transcript_msm_intermediate_x, transcript_msm_intermediate_y)`, else 0                                                                                         |
| transcript_msm_intermediate_y              | transcript_msm_intermediate_y   | $\in \mathbb{F}_q$ |                                                                                                                                      | if we are at the end of an MSM, (output of MSM) = `(transcript_msm_intermediate_x, transcript_msm_intermediate_y)`, else 0                                                                                         |
| transcript_add_x_equal                     | transcript_add_x_equal          | $\{0, 1\}$         | `(vm_x == accumulator_x) or (vm_infinity && accumulator_infinity);`                                                                  | do the accumulator and the point we are adding have the same $x$-value? (here, the two point we are adding is either part of an `add` instruction or the output of an MSM). 0 if we are not accumulating anything. |
| transcript_add_y_equal                     | transcript_add_y_equal          | $\{0, 1\}$         | `(vm_y == accumulator_y) or (vm_infinity && accumulator_infinity);`                                                                  | do the accumulator and the point we are adding have the same $y$-value? 0 if we are not accumulating anything.                                                                                                     |
| transcript_base_x_inverse                  | base_x_inverse                  | $\in \mathbb{F}_q$ |                                                                                                                                      | if adding a point to the accumulator and the $x$ values are not equal, the inverse of the difference of the $x$ values. (witnesses `transcript_add_x_equal == 0`                                                   |
| transcript_base_y_inverse                  | base_y_inverse                  | $\in \mathbb{F}_q$ |                                                                                                                                      | if adding a point to the accumulator and the $y$ values are not equal, the inverse of the difference of the $y$ values. (witnesses `transcript_add_y_equal == 0`                                                   |
| transcript_add_lambda                      | transcript_add_lambda           | $\in \mathbb{F}_q$ |                                                                                                                                      | if adding a point into the accumulator, contains the lambda gradient                                                                                                                                               |
| transcript_msm_x_inverse                   | transcript_msm_x_inverse        | $\in \mathbb{F}_q$ |                                                                                                                                      | used to validate transcript_msm_infinity correct $\textcolor{red}{\text{TODO:??}}$                                                                                                                                 |
| transcript_msm_count_at_transition_inverse | msm_count_at_transition_inverse | $\in \mathbb{F}_q$ |                                                                                                                                      | used to validate transcript_msm_count_zero_at_transition                                                                                                                                                           |

#### Precomputed Columns

As the set of precomputed columns is smaller, we include the code snippet.

```
    struct PointTablePrecomputationRow {
        int s1 = 0;
        int s2 = 0;
        int s3 = 0;
        int s4 = 0;
        int s5 = 0;
        int s6 = 0;
        int s7 = 0;
        int s8 = 0;
        bool skew = false;
        bool point_transition = false;
        uint32_t pc = 0;
        uint32_t round = 0;
        uint256_t scalar_sum = 0;
        AffineElement precompute_accumulator{
            0, 0
        }; // contains a precomputed element, i.e., something in {P, 3P, ..., 15P}.
        AffineElement precompute_double{ 0, 0 };
    };

```

As discussed ($\textcolor{red}{\text{TODO}}$(RAJU): ADD HYPERLINK), our scalars have 128 bits and we may expand them in $w=4$ wNAF:

$$s = \sum_{j=0}^{31} a_j 2^{4j} + \text{skew},$$
where

- each $a_j\in \{-2^{4}+1, -2^{4}+3,\ldots, 2^{4}-1\}$
- $\text{skew}\in\{0, 1\}$.

Given a wNAF digit $\in \{-15, -13, \ldots, 15\}$, we $\text{compress}$ it via the map:
$$\text{compress}\colon d\mapsto \frac{d+15}{2},$$
which is of course a bijection $\{-15, -13, \ldots, 15\}\rightarrow \{0,\ldots, 15\}$

The following is one row in the Precomputed table; there are `NUM_WNAF_DIGITS_PER_SCALAR / WNAF_DIGITS_PER_ROW == 32/4 = 8` rows. The row index is `i`; it is also witnessed as `round`.
| column name | builder name | value range | computation | description |
| ----------- | ---------------------- | ----------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| precompute_s1hi | s1 | $[0, 4)$ | | first two bits of $\text{compress}(a*{31 - 4i})$ |
| precompute_s1lo | s2 | $[0, 4)$ | | second two bits of $\text{compress}(a*{31 - 4i})$ |
| precompute_s2hi | s3 | $[0, 4)$ | | first two bits of $\text{compress}(a*{31 - (4i + 1)})$ |
| precompute_s2lo | s4 | $[0, 4)$ | | second two bits of $\text{compress}(a*{31 - (4i + 1)})$ |
| precompute_s3hi | s5 | $[0, 4)$ | | first two bits of $\text{compress}(a*{31 - (4i + 2)})$ |
| precompute_s3lo | s6 | $[0, 4)$ | | second two bits of $\text{compress}(a*{31 - (4i + 2)})$ |
| precompute_s4hi | s7 | $[0, 4)$ | | first two bits of $\text{compress}(a*{31 - (4i + 3)})$ |
| precompute_s4lo | s8 | $[0, 4)$ | | second two bits of $\text{compress}(a*{31 - (4i + 3)})$ |
| precompute_skew | skew | $\{0,1\}$ | | skew bit |
| precompute_point_transition | point_transition | $\{0,1\}$ | | are we at the last row corresponding to this scalar? |
| precompute_pc | pc | $\fq$ | | value of the program counter of this EC operation |
| precompute_round | round | $\fq$ | | "row" of the computation, i.e., `i`. |
| precompute_scalar_sum | scalar_sum | $\fq$ | | sum up-to-now of the digits |
| precompute_tx, precompute_ty | precompute_accumulator | $E(\fq)\subset \fq\times \fq$ | | $(15-2i)P$ |
| precompute_dx, precompute_dy | precompute_double | $E(\fq)\subset \fq\times \fq$ | | $2P$ |

#### MSM columns

This table is the most complicated and responsible for the efficiently handling of MSMs.

```
struct alignas(64) MSMRow {
        uint32_t pc = 0;        // counter over all half-length (128 bit) scalar muls used to compute the required MSMs
        uint32_t msm_size = 0;  // the number of points that will be scaled and summed
        uint32_t msm_count = 0; // number of multiplications processed so far in current MSM round
        uint32_t msm_round = 0; // current "round" of MSM, in {0, ..., 32}. (final round deals with the `skew` bit.)
                                // here, 32 = `NUM_WNAF_DIGITS_PER_SCALAR`.
        bool msm_transition = false; // is 1 if the *current* row starts the processing of a different MSM, else 0.
        bool q_add = false;
        bool q_double = false;
        bool q_skew = false;

        // Each row in the MSM portion of the ECCVM can handle (up to) 4 point-additions.
        // For each row in the VM we represent the point addition data via a size-4 array of
        // AddState objects.
        struct AddState {
            bool add = false; // are we adding a point at this location in the VM?
                              // e.g if the MSM is of size-2 then the 3rd and 4th AddState objects will have this set
                              // to `false`.
            int slice = 0; // wNAF slice value. This has values in {0, ..., 15} and corresponds to an odd number in the
                           // range {-15, -13, ..., 15} via the monotonic bijection.
            AffineElement point{ 0, 0 }; // point being added into the accumulator
            FF lambda = 0; // when adding `point` into the accumulator via Affine point addition, the value of `lambda`
                           // (i.e., the slope of the line). (we need this as a witness in the circuit.)
            FF collision_inverse = 0; // collision_inverse` is used to validate we are not hitting point addition edge
                                      // case exceptions, i.e., we want the VM proof to fail if we're doing a point
                                      // addition where (x1 == x2). to do this, we simply provide an inverse to x1 - x2.
        };
        std::array<AddState, 4> add_state{ AddState{ false, 0, { 0, 0 }, 0, 0 },
                                           AddState{ false, 0, { 0, 0 }, 0, 0 },
                                           AddState{ false, 0, { 0, 0 }, 0, 0 },
                                           AddState{ false, 0, { 0, 0 }, 0, 0 } };
        FF accumulator_x = 0;
        FF accumulator_y = 0;
    };
```

| column name       | builder name                   | value range    | computation                          | description                                                                                                                                                                              |
| ----------------- | ------------------------------ | -------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| msm_pc            | pc                             | $\mathbb{F}_q$ |                                      | counter over all half-length (128 bit) scalar muls used to compute the required MSMs                                                                                                     |
| msm_size_of_msm   | msm_size                       | $\mathbb{F}_q$ |                                      | the number of points that will be scaled and summed                                                                                                                                      |
| msm_count         | msm_count                      | $\mathbb{F}_q$ |                                      | number of multiplications processed so far in current MSM round                                                                                                                          |
| msm_round         | msm_round                      | $[0, 32]$      |                                      | current "round" of MSM, in $\{0, \ldots, 32\}$, which corresponds to the wNAF digit being processed. (final round deals with the `skew` bit.)                                            |
| msm_transition    | msm_transition                 | $\{0, 1\}$     | `(digit_idx == 0) && (row_idx == 0)` | is 1 if the current row starts the processing of a different MSM, else 0                                                                                                                 |
| msm_add           | q_add                          | $\{0, 1\}$     |                                      | 1 if we are adding points in the Straus MSM algorithm at current row                                                                                                                     |
| msm_double        | q_double                       | $\{0, 1\}$     |                                      | 1 if we are doubling accumulator in the Straus MSM algorithm at current row                                                                                                              |
| msm_skew          | q_skew                         | $\{0, 1\}$     |                                      | 1 if we are incorporating skew points in the Straus MSM algorithm at current row                                                                                                         |
| msm_x1            | add_state[0].point.x           | $\mathbb{F}_q$ |                                      | $x$-coordinate of first potential point (corresponding to add_state[0]) to add in Straus MSM round                                                                                       |
| msm_y1            | add_state[0].point.y           | $\mathbb{F}_q$ |                                      | $y$-coordinate of first potential point (corresponding to add_state[0]) to add in Straus MSM round                                                                                       |
| msm_x2            | add_state[1].point.x           | $\mathbb{F}_q$ |                                      | $x$-coordinate of second potential point (corresponding to add_state[1]) to add in Straus MSM                                                                                            |
| msm_y2            | add_state[1].point.y           | $\mathbb{F}_q$ |                                      | $y$-coordinate of second potential point (corresponding to add_state[1]) to add in Straus MSM                                                                                            |
| msm_x3            | add_state[2].point.x           | $\mathbb{F}_q$ |                                      | x-coordinate of third potential point (corresponding to add_state[2]) to add in Straus MSM round                                                                                         |
| msm_y3            | add_state[2].point.y           | $\mathbb{F}_q$ |                                      | y-coordinate of third potential point (corresponding to add_state[2]) to add in Straus MSM round                                                                                         |
| msm_x4            | add_state[3].point.x           | $\mathbb{F}_q$ |                                      | x-coordinate of fourth potential point (corresponding to add_state[3]) to add in Straus MSM round                                                                                        |
| msm_y4            | add_state[3].point.y           | $\mathbb{F}_q$ |                                      | y-coordinate of fourth potential point (corresponding to add_state[3]) to add in Straus MSM round                                                                                        |
| msm_add1          | add_state[0].add               | $\{0, 1\}$     |                                      | are we adding msm_x1/msm_y1 (resp. add_state[0]) into accumulator at current round?                                                                                                      |
| msm_add2          | add_state[1].add               | $\{0, 1\}$     |                                      | are we adding msm_x2/msm_y2 (resp. add_state[1]) into accumulator at current round?                                                                                                      |
| msm_add3          | add_state[2].add               | $\{0, 1\}$     |                                      | are we adding msm_x3/msm_y3 (resp. add_state[2]) into accumulator at current round?                                                                                                      |
| msm_add4          | add_state[3].add               | $\{0, 1\}$     |                                      | are we adding msm_x4/msm_y4 (resp. add_state[3]) into accumulator at current round?                                                                                                      |
| msm_slice1        | add_state[0].slice             | $[0, 15]$      |                                      | wNAF slice value (a.k.a. digit) for first point (corresponds to odd number in $\{-15, -13, \ldots, 15\}$ via the monotonic bijection)                                                    |
| msm_slice2        | add_state[1].slice             | $[0, 15]$      |                                      | wNAF slice value (a.k.a. digit) for second point                                                                                                                                         |
| msm_slice3        | add_state[2].slice             | $[0, 15]$      |                                      | wNAF slice value (a.k.a. digit) for third point                                                                                                                                          |
| msm_slice4        | add_state[3].slice             | $[0, 15]$      |                                      | wNAF slice value (a.k.a. digit) for fourth point                                                                                                                                         |
| msm_lambda1       | add_state[0].lambda            | $\mathbb{F}_q$ |                                      | if add_state[0].add==1 (eqiv. if msm_add1 == 1), slope of the line between the two points being added. else 0.                                                                           |
| msm_lambda2       | add_state[1].lambda            | $\mathbb{F}_q$ |                                      | if add_state[1].add==1 (eqiv. if msm_add2 == 1), slope of the line between the two points being added. else 0.                                                                           |
| msm_lambda3       | add_state[2].lambda            | $\mathbb{F}_q$ |                                      | if add_state[2].add==1 (eqiv. if msm_add3 == 1), slope of the line between the two points being added. else 0.                                                                           |
| msm_lambda4       | add_state[3].lambda            | $\mathbb{F}_q$ |                                      | if add_state[3].add==1 (eqiv. if msm_add3 == 1), slope of the line between the two points being added. else 0.                                                                           |
| msm_collision_x1  | add_state[0].collision_inverse | $\mathbb{F}_q$ |                                      | if add_state[0].add == 1, the difference of the $x$ values of the accumulator and the point being added. used to ensure incomplete ecc addition exceptions not triggered if msm_add1 = 1 |
| msm_collision_x2  | add_state[1].collision_inverse | $\mathbb{F}_q$ |                                      | if add_state[1].add == 1, the difference of the $x$ values of the accumulator and the point being added.                                                                                 |
| msm_collision_x3  | add_state[2].collision_inverse | $\mathbb{F}_q$ |                                      | if add_state[2].add == 1, the difference of the $x$ values of the accumulator and the point being added.                                                                                 |
| msm_collision_x4  | add_state[3].collision_inverse | $\mathbb{F}_q$ |                                      | if add_state[3].add == 1, the difference of the $x$ values of the accumulator and the point being added.                                                                                 |
| msm_accumulator_x | accumulator_x                  | $\mathbb{F}_q$ |                                      | (accumulator_x, accumulator_y) = $A$ is the accumulated point                                                                                                                            |
| msm_accumulator_y | accumulator_y                  | $\mathbb{F}_q$ |                                      | (accumulator_x, accumulator_y) = $A$ is the accumulated point                                                                                                                            |

## Multiset Equality Checks

As explained, the multiset equality checks allow us to check compatibility between the different tables.

## Relations

We explain first the relations that must be satisfied _inside_ each table, and then the relations that must be satisfied _between_ tables. We will finally specify lookups.

### Inside Transcript Columns

For convenience, here are the column names. The purple names are those constrained to be boolean.

- $\textcolor{purple}{\text{transcript\_msm\_infinity}}$
- $\textcolor{purple}{\text{transcript\_accumulator\_not\_empty}}$
- $\textcolor{purple}{\text{transcript\_add}}$
  - $\textcolor{purple}{\text{transcript\_add}}()$ blah
  - REPEAT: check `op` is valid
- $\textcolor{purple}{\text{transcript\_mul}}$
  - REPEAT: check `op` is valid
- $\textcolor{purple}{\text{transcript\_eq}}$
  - REPEAT: check `op` is valid
- $\textcolor{purple}{\text{transcript\_reset\_accumulator}}$
  - REPEAT: check `op` is valid
- $\textcolor{purple}{\text{transcript\_msm\_transition}}$
- $\text{transcript\_pc}$
  - Decrement `transcript_pc` correctly (via `z1zero` and `z2zero`):
    $$\text{transcript\_pc} - \textbf{shift}(\text{transcript\_pc}) = 2 - \textcolor{purple}{\text{transcript\_z1zero}} - \textcolor{purple}{\text{transcript\_z2zero}}$$
- $\text{transcript\_msm\_count}$
- $\textcolor{purple}{\text{transcript\_msm\_count\_zero\_at\_transition}}$
- $\text{transcript\_Px}$
- $\text{transcript\_Py}$
- $\textcolor{purple}{\text{transcript\_base\_infinity}}$
- $\text{transcript\_z1}$
  - check (weak) compatibility of `z1zero` and `z1`:
    $$\textcolor{purple}{\text{transcript\_z1zero}} \times \text{transcript\_z1} == 0$$
- $\text{transcript\_z2}$
  - check (weak) compatibility of `z2zero` and `z2`:
    $$\textcolor{purple}{\text{transcript\_z2zero}} \times \text{transcript\_z2} == 0$$
- $\textcolor{purple}{\text{transcript\_z1zero}}$
  - REPEAT: check (weak) compatibility of `z1zero` and `z1`
  - REPEAT: Decrement `transcript_pc` correctly (via `z1zero` and `z2zero`)
- $\textcolor{purple}{\text{transcript\_z2zero}}$
  - REPEAT: check (weak) compatibility of `z2zero` and `z2`
  - REPEAT: Decrement `transcript_pc` correctly (via `z1zero` and `z2zero`)
- $\text{transcript\_op}$
  - check `op` is valid:
    $$\text{transcript\_op} = \textcolor{purple}{\text{transcript\_reset\_accumulator}} + 2 \textcolor{purple}{\text{transcript\_eq}} + 4\textcolor{purple}{\text{transcript\_add}} + 8 \textcolor{purple}{\text{transcript\_mul}}$$
- $\text{transcript\_accumulator\_x}$
- $\text{transcript\_accumulator\_y}$
- $\text{transcript\_msm\_x}$
- $\text{transcript\_msm\_y}$
- $\text{transcript\_msm\_intermediate\_x}$
- $\text{transcript\_msm\_intermediate\_y}$
- $\textcolor{purple}{\text{transcript\_add\_x\_equal}}$
- $\textcolor{purple}{\text{transcript\_add\_y\_equal}}$
- $\text{transcript\_base\_x\_inverse}$
- $\text{transcript\_base\_y\_inverse}$
- $\text{transcript\_add\_lambda}$
- $\text{transcript\_msm\_x\_inverse}$
- $\text{transcript\_msm\_count\_at\_transition\_inverse}$
