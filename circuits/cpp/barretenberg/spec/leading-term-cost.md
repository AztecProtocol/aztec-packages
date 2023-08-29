$$
\newcommand{\BE}{\text{BE}}
\newcommand{\LT}{\text{LT}}
\newcommand{\bB}{\mathbb{B}}
\newcommand{\bF}{\mathbb{F}}
\newcommand{\bin}{\text{bin}}
\newcommand{\MAX}{\text{MAX}}
\newcommand{\dMAX}{d_\MAX}
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
\newcommand{\pow}{\text{pow}}
\newcommand{\lookup}{\text{lookup}}
\newcommand{\Trace}{\text{Trace}}
\newcommand{\Polys}{\text{Polys}}
\newcommand{\NumPolys}{N_\Polys}
\newcommand{\ProtoGalaxy}{\text{ProtoGalaxy}}
\newcommand{\Honk}{\text{Honk}}
$$

# ProtoGalaxy folding prover costs
## Background
We will use [ProtoGalaxy](https://eprint.iacr.org/archive/2023/1106/1690490682.pdf) to fold [UltraGoblinHonk](https://github.com/AztecProtocol/aztec-packages/blob/master/circuits/cpp/barretenberg/cpp/src/barretenberg/honk/flavor/goblin_ultra.hpp) claims. The UltraGoblinHonk (UGH) proving system construct proofs for satisfying assignments for circuits built using [UltraCircuitBuilder](https://github.com/AztecProtocol/aztec-packages/blob/master/circuits/cpp/barretenberg/cpp/src/barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp).

Using the Lagrange basis on the boolean hypercube $\bB^t$ of dimension $t = \log(\circuitsize)$, the circuit data and witnesses, along with the data of additional derived witnesses ($Z_\perm$ and $Z_\lookup$) and auxiliary polynomials (Lagrange polynomials e.g.), are stored in a `GoblinUltra::ProverPolynomials` instance $\Polys$, which we can model here as a tuple of $\NumPolys$-many polynomials. The claim of interest to the UGH prover is that the full aggregated UGH relation, a polynomial in variables 
$P_1,\ldots, P_{\NumPolys}$
$$
\begin{aligned}
\Rel_\UGH(P_1,\ldots, P_{\NumPolys}) = 
&\phantom{+ \alpha^{1} \cdot } \Rel_\Arith(P_1,\ldots, P_{\NumPolys}) \\
&+ \alpha^{1}\cdot\Rel_\Perm(P_1,\ldots, P_{\NumPolys}) \\
&+ \alpha^{2}\cdot\Rel_\Lookup(P_1,\ldots, P_{\NumPolys}) \\
&+ \alpha^{3}\cdot\Rel_\GenPerm(P_1,\ldots, P_{\NumPolys}) \\
&+ \alpha^{4}\cdot\Rel_\Elliptic(P_1,\ldots, P_{\NumPolys}) \\
&+ \alpha^{5}\cdot\Rel_\Aux(P_1,\ldots, P_{\NumPolys}) \\
&+ \alpha^{6}\cdot\Rel_\ECCOpQueue(P_1,\ldots, P_{\NumPolys}), \\
\end{aligned}
$$
when evaluated on $\Polys$, gives a polynomial that vanishes on $\bB^t$. A prover can argue this claim in $O(\circuitsize)$ time by allowing a verifier to generate a challenge $\beta$ and then using a sumcheck argument for the claim
$$
\sum_{i=0}^{n-1}\beta^i\Rel_\UGH(\bin(i)) = 0
$$
where $\bin(i)$ is the length-$t$ vector of binary digits of $i$.

For comparison, ProtoGalaxy uses the notation for $\omega$ for the data encoded in $\Polys$ regarded simly as a data of vectors. Roughly speaking, the relation $\Rel_\UGH$ gets the name $f$. More precisely, $f$ is a mapping
$$f: \bF^{\NumPolys}\to \bF^\circuitsize$$
whose image is defiend by $\circuitsize$ component functions $f_i$. In our earlier notation, $f_i(\omega)$ is defined by 
$$f_i(\omega) = \Rel_\UGH(\Polys_1(\bin(i)), \ldots, \Polys_{\NumPolys}(\bin(i))).$$

## The ProtoGalaxy Combiner Polynomial $G(Y)$

In our code and documentation, we have reserved $X$ for the names of the inputs to the prover polynomials, the variables on the boolean hypercube, e.g., $w_l = w_l(X_1, \ldots, X_d)$. So let's use $Y$ for the perturbation and combiner variables in PG. This agrees with the notation of Protostar. Let's use $P$ for the inputs to the relations.

How do we interpret the definition of $G(Y)$? Let $L_0,\ldots, L_k$ be the Lagrange basis on $\{0, \ldots, k\}$, each having degree $k$. In the paper it is written as 
$$G(Y) 
= \sum_{i=0}^{n-1}\pow_i(\beta^*)f_i\left(\sum_{j=0}^{k}L_j(Y)\omega_j\right),
$$

To rewrite this in our terms, the instances $\omega_0,\omega_1, \ldots, \omega_k$ correspond to `honk::flavor::Ultra::ProverPolynomials` instances $\Polys^{(0)}, \Polys^{(1)}, \ldots, \Polys^{(k)}$ and the polynomial $G$ becomes
$$
G(Y) 
= \sum_{i=0}^{n-1}\pow_i(\beta^*)\Rel_\UGH\left(\sum_{j=0}^{k}L_j(Y)\Polys^{(j)}(\bin(i))\right)
$$

Let's focus on the sub-term $\Rel_\Arith\left(\sum_{j=0}^{k}L_j(Y)\Polys^{(j)}(\bin(i))\right).$ Using the indexing of `honk::flavor::Ultra`, we have

$$\Rel_\UGH(P_1,\ldots, P_{\NumPolys}) = P_{5}P_{25}P_{26} + P_{1}P_{25} + P_{2}P_{26} + P_{3}P_{27} + P_{0}.$$
To be clear, if $\Polys$ is an instance of `honk::flavor::Ultra::ProverPolynomials`, then 

$$\Rel_\UGH(\Polys_1,\ldots, \Polys_{\NumPolys}) = q_{m}w_lw_r + q_{l}w_{l} + q_{r}w_{r} + q_{o}w_{o} + q_{c}.$$

Similarly, with the superscript $(j)$ used in the natural way,
$$\begin{aligned}
\Rel_\Arith&\left(\sum_{j=0}^{k}L_j(Y)\Polys^{(j)}\right) \\
&:= \Rel_\Arith\left(\sum_{j=0}^{k}L_j(Y)\Polys^{(j)}_{1},
                    \ldots, \sum_{j=0}^{k}L_j(Y)\Polys^{(j)}_{\NumPolys}\right) \\
&= \left(\sum_{j=0}^{k}L_j(Y)q^{(j)}_{m}\right)
   \left(\sum_{j=0}^{k}L_j(Y)w^{(j)}_{l}\right)
   \left(\sum_{j=0}^{k}L_j(Y)w^{(j)}_{r}\right) \\ 
&\hphantom{...}+ \left(\sum_{j=0}^{k}L_j(Y)q^{(j)}_{l}\right)
                 \left(\sum_{j=0}^{k}L_j(Y)w^{(j)}_{l}\right)\\ 
&\hphantom{...}+ \left(\sum_{j=0}^{k}L_j(Y)q^{(j)}_{r}\right)
                 \left(\sum_{j=0}^{k}L_j(Y)w^{(j)}_{r}\right)\\ 
&\hphantom{...}+ \left(\sum_{j=0}^{k}L_j(Y)q^{(j)}_{o}\right)
                 \left(\sum_{j=0}^{k}L_j(Y)w^{(j)}_{o}\right)\\ 
&\hphantom{...}+ \left(\sum_{j=0}^{k}L_j(Y)q^{(j)}_{c}\right)
\end{aligned}
$$
which is a polynomial in $Y$ of of degree $3k$.

## Our Setting
For simplicity of exposition, we focus on a highest-degree ($=d$) monomial term to be computed in the PG combiner polynomial $G(Y)$. We will set
$$
\Rel(P_1, \ldots, P_{\NumPolys}) = P_1P_2\cdots P_{d}
$$
and use this in place of $\Rel_\UGH.$ Then the combiner polynomials is 
$$
G(Y) 
= \sum_{i=0}^{n-1}\pow_i(\beta^*)\prod_{l=1}^{d}\left(\sum_{j=0}^{k}L_j(Y)\Polys_\ell^{(j)}(\bin(i))\right).
$$
Denote by $P_{\ell, i}^{j} = P_{\ell}^{j}(\bin(i))$. To be clear: For each $\ell=1,\ldots, d$ (indexing, various witness and circuit-defining polynomials) there are $k+1$ polynomials $P_\ell^{(0)},\ldots,\, P_\ell^{(k)}$ (from the different instances to be combined). For each value of $i$, we extract the $i$-th row from each of the $k+1$ execution traces. Using the first entry of each row, we compute a sum of Lagrange values 
$$
\sum_{j=0}^{k}L_j(Y)P_{\ell, i}^{(j)}
$$
which is a Lagrange-basis combined of a particular prover polynomial at a particular point of the hypercube. For instance, this might combine information about the selector $q_c$ in each of the instances to be folded. With these combined values in hand, we take the product over all values $\ell=1,\ldots, d$.
$$
\hat P_{\ell, i} := \sum_{j=0}^{k}L_j(Y)P_{\ell, i}^{(j)}
$$
We want to compute
$$
\Rel_i = \prod_{\ell=1}^d\hat P_{\ell, i}
$$

Our strategy is it to realize each $\hat P_{\ell, i}$ as the tuple $(P_{\ell, i}^{(0)}, \ldots, P_{\ell, i}^{(k)})$ of values and then barycentrically extend this over $\{0,\ldots, kd\}$. Let $\BE_{k, d}$ the the cost of an arbitrary barycentric extension of this sort. The leading of a single barycentric evaluation over $\{0, \ldots, k\}$ is about $6(k+1)$ multiplications, and so the worst case for $\BE_{k,d}$ is about
$ k(d-1)\cdot 6(k+1) $ multiplications. For small $k$ this cost can be improved dramatically using special formulas having many additions.

The cost of computing the relation is then 
 - Barycentrically extend $\hat P_{\ell,i}$ for $\ell=1,\ldots, d$: $d\cdot \BE_{k,d}$ 
 - Take the product of all $\hat P_{\ell,i}$: $(d-1)\cdot(kd+1)$ muls
 - Do this for all $i$: multiply the preceding by $n$.

So the total cost of executing the relation would be:
$$
n \cdot (d\cdot \BE_{k,d} + (d-1) \cdot (kd+1)).
$$

Using the worst-case formula for barycentric extension, in the case of $d=5$ this becomes
$$
n \cdot (d \cdot k(d-1)\cdot 6(k+1) + (d-1) \cdot (kd+1)).
$$


This gives 

| $k$ | time on `Fr` muls (s), $n=16384$, Worst case barycentric |
|-----|----------------------------------------------------------|
| 1   | 0.09                                                     |
| 3   | 0.49                                                     |
| 7   | 2.25                                                     |
| 15  | 9.54                                                     |


| $k$ | time on `Fr` muls (s), $n=32768$, Worst case barycentric |
|-----|----------------------------------------------------------|
| 1   | 0.17                                                     |
| 3   | 0.99                                                     |
| 7   | 4.5                                                      |
| 15  | 19.07                                                    |


| $k$ | time on `Fr` muls (s), $n=65536$, Worst case barycentric |
|-----|----------------------------------------------------------|
| 1   | 0.35                                                     |
| 3   | 1.97                                                     |
| 7   | 9.0                                                      |
| 15  | 38.15                                                    |


| $k$ | time on `Fr` muls (s), $n=131072$, Worst case barycentric |
|-----|-----------------------------------------------------------|
| 1   | 0.69                                                      |
| 3   | 3.94                                                      |
| 7   | 17.99                                                     |
| 15  | 76.29                                                     |



Let's now consider the special case of $k=1$, where we fold a single instance into an existing accmulator instance. In this case, we want to go from $k+1=2$ evaluations to $kd+1 = 6$ evaluations. As we wrote down when exploring sumcheck optimizations in 2022, this can be done with one subtraction and $6-2=4$ additions. Each of these operations costs about 2.5ns, so we're looking at 12.5ns to extend, which is less than the cost of a single multiplication (20ns), so in this case the cost is about
$$
n \cdot (d\cdot \BE_{k,d} + (d-1) \cdot (kd+1)) = 5n + 24n = 29n
$$
multiplications. This is about $580n$ nanoseconds.

Suppose we can fold a pair of instances of size $n$ in a single thread and we can spin up 8 threads in parallel. Then we can fold 16 instances of size $n$, arranged in a binary tree, in about $580n*\log(16)$ ns. To do 32 instances would cost an additional $2*580n$ ns, to do 64 instances would cost an additional $4*580n$ ns on top of the cost of 32, and to do 128 instances would cost an additional $8*580n$ ns on top of the cost of 64. For our target kernel circuit size $2^{17}$, folding 16 instances would cost about $4*580 n/1,000,000,000 = 0.3$ seconds and folding 128 instances would cost about $(4 + 2 + 4 + 8)*580 n/1,000,000,000 = 1.4$ seconds.

NB: We got sloppy with language just now--the true costs of folding will be higher, since we have only considered the cost of a single high-degree term in $G(Y)$ in the true Ultra Goblin Honk relation.

IOU: efficient formulas to allow folding more instances in a single go? Do we even care? What about a different choice of domain to give simpler extension formulas?
