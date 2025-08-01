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

In fact, due to our MSM optimizations, we produce _three_ tables, where each table has it's own set of multivariate polynomials, such that the correct evaluation of the operations corresponds to each table's multivariates evaluating to zero on each row. These tables will "communicate" with each other via lookup arguments.

TODO(RAJU): add brief description of Goblin plonk.

TODO(RAJU) edit the following: The motivation for the ECCVM is the following. We use BN-254 for our (KZG) commitments; hence, for most parts of our stack, we build "arithmetic circuits" (and their variants) over $\fr$. For various purposes (folding, recursion, user-defined apps), we would like to encode/arithmetize BN-254 operations themselves. As the field-of-definition of BN-254 is $\fq$, a long MSM would involve many non-native field operations (i.e., $\fq$ operations arithmetized in $\fr$).

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

Note that both $\fr$ and $\fq$ have a non-trivial cube roots of unity. (Their orders are both $1\mod(3)$.) We fix $\beta\in\fq$ to be a primitive cube root of unity. Note that $\beta$ induces an order 6 automorphism $\varphi$ of BN-254, defined on the level of points as:
$$\varphi\colon (x, y)\mapsto (\beta x, -y).$$

As $E(\fq)\cong \zr$, and the natural map $\fr\rightarrow \text{End}_{\text{ab. gp}}(\zr)$ is an isomorphism, it follows that $\varphi$ corresponds to an element $\lambda\in \fr$. Then $\lambda$ satisfies a quadratic equation: $$\lambda^2 - \lambda + 1,$$
(and indeed $\varphi$ satisfies the same equation when considered as an endomorphism). In particular, $\lambda^2$ is a cube root of unity in $\fr$.

Now, given $s\in \zr$, we wish to write $s = z_1 + \lambda z_2$ where $z_i$ are "small". This follows from some lattice theory. Indeed, we consider the lattice $L:=\text{ker} \mathbb Z^2 \rightarrow \zr$, given by $(a, b)\mapsto a + \lambda b$. The discriminant of this lattice is $3r$; then there is a unique choice of $z_1$ and $z_2$ in any given fundamental domain. The fundamental domain around the origin lies in the box (a.k.a. Babai cell) with side length $B:=\frac{\sqrt{3r}}{2}$. Plugging in numbers, we see $B< 2^{128}$, and the result follows.

### Column representation (a.k.a. the Input Trace)

An operation in the OpQueue may be entered into a table as follows:

| `op` | `X` | `Y` | `z_1` | `z_2` | `mul_scalar_full` |

Here, `op` is the value of the operation, $(X, Y)$ are the _affine_ coordinates of $P$, `mul_full_scalar` stands for "full scalar if the operation is `mul`" (so is an element of $\fr$), and `z_1` and `z_2` are a decomposition of `mul_scalar_ful` as explained above. In particular, `z_1` and `z_2` may each be represented by 128 bits.

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

As explained in the introduction, the ECCVM takes in an `ECCOpQueue`, which corresponds to the execution of a list of operations in BN-254, and constructs three tables, together with a collection of multivariate polynomials for each table. (The number of variables of a polynomial associated with a table is precisely the number of columns of that table.) Then the key claim is that if for each table, the polynomials associated to that table vanish on every row, then the table corresponds to the correct execution of the `ECCOpQueue`, i.e., to the correct execution of the one-register elliptic curve state machine.

The `mul` opcode is the only one that is non-trivial to evaluate, especially efficieintly. One straightforward way to encode the `mul` operation is to break up the scalar into its bit representation and use a double-and-add procedure. We opt for the Straus MSM algorithm with $w=4$, which requires more precomputing but is significantly more efficient.

### Straus Algorithm.

Recall, our goal is to compute $\sum_i s_i P_i$, where $s_i\in \fr$ and $P_i$ are points on BN-254. We set $w=4$, as this is our main use-case. We have seen about that, setting $P'_i:=\varphi(P_i) = \lambda P_i$, we may write $s_iP_i = z_{i, 1}P_i + z_{i, 2}P'_i$, where $z_{i,j}$ has no more than 128 bits. We therefore assume that our scalars have no greater than 128 bits.

#### wNAF

The first thing to specify is our windowed non-adjacent form (wNAF). This is an optimization for computing scalar multiplication. Moreover, the fact that we are working with an elliptic curve in Weierstrauss form effectively halves the number of precomputes we need to perform.

Before starting, we emphasize that our implementation is _not_ what is usually called wNAF. To avoid confusion, we simply avoid discussion on traditional (w)NAF.

The claim is that we can uniquely write:
$$s = \sum_{i=0}^{31} a_i 2^{4i} + \text{skew},$$
where

- each $a_i\in \{-2^{4}+1, -2^{4}+3,\ldots, 2^{4}-1\}$
- $\text{skew}\in\{0, 1\}$.

In our implementation, we force $a_{31}>0$ to guarantee that $s$ is positive.

The above decomposition is referred to in the code as the wNAF representation. Each $a_i$ is referred to either as a wNAF slice or digit.

We will come shortly to the algorithm, but as for the motivation: in our implementation, the neutral point (i.e., point-at-infinity) poses some technical challenges. It is therefore advantageous to avoid having to extraneously perform operations involving it, especially when we are implementing the recursive ECCVM verifier.

### Straus

### Tables
