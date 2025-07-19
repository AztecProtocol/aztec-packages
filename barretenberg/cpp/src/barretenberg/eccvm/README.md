$\newcommand{\radd}{{\ \textcolor{lightgreen}{+} \ }}$
$\newcommand{\rsub}{{\ \textcolor{lightgreen}{-} \ }}$
$\newcommand{\rmul}{{\ \textcolor{lightgreen}{*} \ }}$
$\newcommand{\padd}{{\ \textcolor{red}{+} \ }}$
$\newcommand{\pmul}{{\ \textcolor{red}{*} \ }}$
$\newcommand{\const}[1]{\textcolor{gray}{#1}}$
$\renewcommand{\prime}[1]{#1_{\textsf{prime}}}$
$\newcommand{\fq}{\mathbb F_q}$
$\newcommand{\fr}{\mathbb F_r}$

# ECCVM (ElliptiC Curve Virtual Machine) in Barretenberg

> $\textcolor{orange}{\textsf{Warning}}$: This document is intended to provide an overview of the ECCVM in barretenberg. It is not a complete specification and does not cover all edge cases or optimizations. The source code should be consulted for a complete understanding of the implementation.

## Notation

- $\fq$ is the prime field of size $q= 21888242871839275222246405745257275088696311157297823662689037894645226208583$.
- $\fr$ is the prime field of size $r = 21888242871839275222246405745257275088548364400416034343698204186575808495617$.
- $C/\fr$ is the elliptic curve whose Weierstrauss equation is: $y^2 = x^3 - 17$. This is known as the _Grumpkin_ curve.

Importantly, $q>r$ and $C(\fr)$ is a cyclic group of order $q$.

## Bird's eye overview/motivation

In a nutshell, the ECCVM is a virtual machine to allow for efficient verification of native elliptic curve computations. In our setting, this means that given an `op-queue` of Grumpkin operations, the ECCVM compiles the execution of these operations into an arithmetic circuit over $\fr$, the _field of definition_ (a.k.a. base field) of Grumpkin and the _scalar field_ of BN-254.

The motivation for this is the following. We use BN-254 for our (KZG) commitments; hence, for most parts of our stack, we build "arithmetic circuits" (and their variants) over $\fr$. For various purposes (folding, recursion, user-defined apps), we would like to encode/arithmetize BN-254 operations themselves. As the field-of-definition of BN-254 is $\fq$, a long MSM would involve many non-native field operations (i.e., $\fq$ operations arithmetized in $\fr$). Instead, Goblin plonk provides a protocol to defer operations and "reduce" (or _translate_) the computation into a computation on Grumpkin. Arithmetizing Grumpkin operations over $\fr$ is significantly more efficient, as point addition can be represented natively.
