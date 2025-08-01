$\newcommand{\radd}{{\ \textcolor{lightgreen}{+} \ }}$
$\newcommand{\rsub}{{\ \textcolor{lightgreen}{-} \ }}$
$\newcommand{\rmul}{{\ \textcolor{lightgreen}{*} \ }}$
$\newcommand{\padd}{{\ \textcolor{red}{+} \ }}$
$\newcommand{\pmul}{{\ \textcolor{red}{*} \ }}$
$\newcommand{\const}[1]{\textcolor{gray}{#1}}$
$\renewcommand{\prime}[1]{#1_{\textsf{prime}}}$
$\newcommand{\fq}{\mathbb F_q}$
$\newcommand{\fr}{\mathbb F_r}$
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

Importantly, $2r>q>r$ and $C(\fr)$ is a cyclic group of order $q$.

## Bird's eye overview/motivation

In a nutshell, the ECCVM is a simple virtual machine to facilitate the verification native elliptic curve computations. In our setting, this means that given an `op_queue` of BN-254 operations, the ECCVM compiles the execution of these operations into an _execution trace representation_ over $\fq$, the _field of definition_ (a.k.a. base field) of BN-254 and the _scalar field_ of Grumpkin.

In a bit more detail, the ECCVM is an compiler that takes a sequence of operations (in BN-254) and produces a table of numbers, such that the correct evaluation of the sequence of operations precisely corresponds to polynomial constraints vanishing on the rows of this table of numbers. Moreover, this polynomial constraints are independent of the specific sequence of operations. The core complication in the ECCVM comes from the _efficient_ handling of multi-scalar multiplications (MSMs).

In fact, due to our MSM optimizations, we produce _three_ tables, where each table has it's own set of multivariate polynomials, such that the correct evaluation of the operations corresponds to each table's multivariates evaluating to zero on each row. These tables will "communicate" with each other via lookup arguments.

TODO(RAJU): add brief description of Goblin plonk.

TODO(RAJU) edit the following: The motivation for the ECCVM is the following. We use BN-254 for our (KZG) commitments; hence, for most parts of our stack, we build "arithmetic circuits" (and their variants) over $\fr$. For various purposes (folding, recursion, user-defined apps), we would like to encode/arithmetize BN-254 operations themselves. As the field-of-definition of BN-254 is $\fq$, a long MSM would involve many non-native field operations (i.e., $\fq$ operations arithmetized in $\fr$).

## VM operations and op codes

To understand what the `op-queue` is, we first need to understand `EccOpCode` and what the VM operations are.

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

On the level of selectors, `EccOpCode.value()`=$8\qadd + 4 \qmul + 2 \qeq + \qreset$.

#### Description of operations.

- `add` will take in a single argument: a point $P$ of my curve, and the accumulator is updated $A\leftarrow A+ P$.
- `mul` takes in two arguments: $P$, $s$, where $s\in\fr$ (i.e., $s$ is a "scalar" for our curve), and the accumulator is updated $A\leftarrow A + sP$
- `eq` takes in an argument, $P$, and "checks" that $A == P$.
- `reset` sets the accumulator to $\mathcal O$, the neutral element of the group.
- `eq_and_reset` takes in an argument, $P$, "checks" that $A == P$, and then resets the accumulator to the neutral element.

### decomposing scalars

Note that both $\fr$ and $\fq$ have a non-trivial cube roots of unity. We fix these from now and forever, and abusing notation, write these fixed field elements (in different fields) as $\zeta$.

We may uniquely decompose $s$ as $s:=z_1 + \zeta z_2\in \fr$. $s$ is less than 256 bits, and $z_1$ and $z_2$ are each less than 128 bits. For scalar multiplications, we of course have that $sP = z_1$
TODO(RAJU): make this, um, not garbage?

### VM operations

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

## Op Queue

Our o

## Tables

The three tables are:
