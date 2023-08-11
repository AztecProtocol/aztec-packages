# ProtoGalaxy Implementation Spec

$$
\newcommand{\circuitsize}{n}
\newcommand{\Rel}{\text{Rel}}
\newcommand{\UGH}{\text{UGH}}
\newcommand{\Arith}{\text{Arith}}
\newcommand{\Perm}{\text{Perm}}
\newcommand{\Lookup}{\text{Lookup}}
\newcommand{\GenPerm}{\text{GenPerm}}
\newcommand{\Aux}{\text{Aux}}
\newcommand{\Elliptic}{\text{Elliptic}}
\newcommand{\ECCOpQueue}{\text{ECCOpQueue}}
\newcommand{\perm}{\text{perm}}
\newcommand{\lookup}{\text{lookup}}
\newcommand{\Trace}{\text{Trace}}
\newcommand{\Polys}{\text{Polys}}
\newcommand{\NumPolys}{N_\Polys}
$$

# Background
We will use [ProtoGalaxy](https://eprint.iacr.org/archive/2023/1106/1690490682.pdf) to fold [UltraGoblinHonk](https://github.com/AztecProtocol/aztec-packages/blob/master/circuits/cpp/barretenberg/cpp/src/barretenberg/honk/flavor/goblin_ultra.hpp) claims. The UltraGoblinHonk (UGH) proving system construct proofs for satisfying assignments for circuits built using [UltraCircuitBuilder](https://github.com/AztecProtocol/aztec-packages/blob/master/circuits/cpp/barretenberg/cpp/src/barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp). The circuits built using this builder class encode application logic and witnesses in an execution trace $\Trace$:

| row | $w_0$ | $w_1$ | $w_2$ | $w_3$ | $w_l$ | $q_l$ | ... |
|-----|-------|-------|-------|-------|-------|-------|-----|
| 0   | *     | *     | *     | *     | *     | *     | *   |
| 1   | *     | *     | *     | *     | *     | *     | *   |
| 2   | *     | *     | *     | *     | *     | *     | *   |
| 3   | *     | *     | *     | *     | *     | *     | *   |
| 4   | *     | *     | *     | *     | *     | *     | *   |

Additional witnesses ($Z_\perm$ and $Z_\lookup$) and auxiliary polynomials (Lagrange polynomials e.g.) are derived and stored alongside the polynomials in the execution trace in a `GoblinUltra::ProverPolynomials` instance $\Polys$, which we can model here as a tuple of $\NumPolys$-many polynomials. The claim of interest to the UGH prover is that the full aggregated UGH relation, a polynomial in variables
$$
\begin{aligned}
\Rel_\UGH(X_1,\ldots, X_{\NumPolys}) = 
&\phantom{+ \alpha^{1} \cdot } \Rel_\Arith(X_1,\ldots, X_{\NumPolys}) \\
&+ \alpha^{1}\cdot\Rel_\Perm(X_1,\ldots, X_{\NumPolys}) \\
&+ \alpha^{2}\cdot\Rel_\Lookup(X_1,\ldots, X_{\NumPolys}) \\
&+ \alpha^{3}\cdot\Rel_\GenPerm(X_1,\ldots, X_{\NumPolys}) \\
&+ \alpha^{4}\cdot\Rel_\Elliptic(X_1,\ldots, X_{\NumPolys}) \\
&+ \alpha^{5}\cdot\Rel_\Aux(X_1,\ldots, X_{\NumPolys}) \\
&+ \alpha^{6}\cdot\Rel_\ECCOpQueue(X_1,\ldots, X_{\NumPolys})\\
\end{aligned}
$$
evaluates to 0 on $\Polys_i$ for $i=0,\ldots,\circuitsize-1$, where $n$ is the circuit size. This claim gets repackaged as the claim...
