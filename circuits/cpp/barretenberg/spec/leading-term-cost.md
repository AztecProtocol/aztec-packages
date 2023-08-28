$$
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
which is a Lagrange-basis combined of a particular prover polynomial at a particular point of the hypercube. For instance, this might combine information about the selector $q_c$ in each of the instances to be folded.

With these combined values in hand, we take the product over all values $\ell=1,\ldots, d$. That is, we want to compute
$$
\prod_{\ell=1}^d\left(\sum_{j=0}^{k}L_j(Y)P_{\ell, i}^{(j)}\right)
= \sum_{j\in \{0,\ldots, k\}^d}\prod_{\ell=1}^{d}L_{j_\ell}(Y)P_{\ell, i}^{(j_\ell)}
$$
This constitutes most of the work of computing $G(Y)$.

Here each $L_{j_\ell}$ is the Lagrange polynomial on $\{0,\ldots, k\}$ centered at $j_\ell$, and extended over the set $\{0,\ldots, kd\}$ (i.e., it is regarded as the vector of its $kd+1$ values over that set). For now we ignore a smallish optmization of using the sparseness of the $L_j$ in the first $k+1$ terms in this representation.

### Naive approach
This is a very inefficient way of computing  that would let us reuse our existing relations code: group terms as in
$$
\prod_{\ell=1}^d \left(L_{j_\ell}(Y)P_{\ell, i}^{(j_\ell)}\right)
$$
- Each inner term: $kd+1$ muls, so computing all of them is $d\cdot (kd+1)$
- Multiplying the inner terms: $(d-1)(kd+1)$ muls
- Doing this for all $i$: multiply both of these preceding counts by $n$
- Do this for every vector index $j$: multiply both running counts by $(k+1)^d$.

Altogether, the cost cost of the above multiplication is
$$
(d(kd+1)+((d-1)(kd+1)))\cdot n\cdot (k+1)^d
= (2d^2k-(2-k)d-1)n(k+1)^{d}
$$

## Isolating monomial terms
This way would require us isolating homogeneous components of the relations. We group terms as in:
$$
\left(\prod_{\ell=1}^d L_{j_\ell}\right)\left(\prod_{\ell=1}^d P_{\ell, i}^{(j_\ell)}\right)
$$
Let's suppose we can precompute the Lagrange product at compile time (this is infeasible for some of our target parameter values). Then we can ignore:
- Taking the product of the Lagrange polynomials: $(d-1)(kd+1)$ muls.

Then, counting multiplications in the monomial products goes as follows:
- Multiplying the polynomial values: $d-1$  muls
- Multiplying against the Lagrange term: $kd+1$  muls
- Doing the previous two steps for all $i$: multiply the counts by $n$
- Do this for every vector index $j$: multiply both of the preceding counts by $(k+1)^d$.

Altogether, the optimistic cost is
$$
\begin{align*}
((d-1) + (kd+1)) \cdot n \cdot (k+1)^d
=d\cdot (k+1) \cdot n \cdot (k+1)^d
\end{align*}
$$

The middle path cost where we recompute the Lagrange product (assuming we already have the Lagrange polynomials, which are easily precomputed) adds a new dominant term $(d-1)(kd+1)\cdot n\cdot (k+1)^d$, so the middle path cost becomes
$$
\begin{align*}
((d-1) + d(kd+1)) \cdot n \cdot (k+1)^d  
= (d^2k+2d-1) \cdot n \cdot (k+1)^d  
\end{align*}
$$


## Concrete numbers

The total cost of storing all of the Lagrange polynomial products is $(kd+1)\cdot \binom{k+d}{d}$ field elements; here we use the standard formula for the "number of choices of $d$ things from a set of k things WITH replacement" see [Wikipedia](https://en.wikipedia.org/wiki/Multiset#Counting_multisets). 

| k   | count     | size (MiB)  |
|-----|-----------|-------------|
| 1   | 6         | 0.001       |
| 3   | 56        | 0.027       |
| 7   | 792       | 0.87        |
| 15  | 15504     | 35.959      |
| 31  | 376992    | 1794.762    |
| 63  | 10424128  | 100525.648  |
| 127 | 309319296 | 6003633.797 |

So possibly we can get some mileage out of storing these tables for $k+1\leq 16$ (...but in the hot loop?).



### n = 16384

| $k$ | time on `Fr` muls (s), $n=16384$, Naive |
|-----|-----------------------------------------|
| 1   | 0.51                                    |
| 3   | 43.49                                   |
| 7   | 3131.03                                 |
| 15  | 211518.55                               |
| 31  | 13893428.93                             |
| 63  | 900579187.99                            |
| 127 | 58001859600.9                           |

| $k$ | time on `Fr` muls (s), $n=16384$, Optimistic |
|-----|----------------------------------------------|
| 1   | 0.09                                         |
| 3   | 6.04                                         |
| 7   | 386.55                                       |
| 15  | 24739.01                                     |
| 31  | 1583296.74                                   |
| 63  | 101330991.62                                 |
| 127 | 6485183463.41                                |

| $k$ | time on `Fr` muls (s), $n=16384$, Middle Path |
|-----|-----------------------------------------------|
| 1   | 0.32                                          |
| 3   | 25.37                                         |
| 7   | 1778.12                                       |
| 15  | 118747.26                                     |
| 31  | 7758154.05                                    |
| 63  | 501588408.5                                   |
| 127 | 32263787730.48                                |


### n = 32768

| $k$ | time on `Fr` muls (s), $n=32768$, Naive |
|-----|-----------------------------------------|
| 1   | 1.02                                    |
| 3   | 86.97                                   |
| 7   | 6262.06                                 |
| 15  | 423037.1                                |
| 31  | 27786857.86                             |
| 63  | 1801158375.97                           |
| 127 | 116003719201.81                         |

| $k$ | time on `Fr` muls (s), $n=32768$, Optimistic |
|-----|----------------------------------------------|
| 1   | 0.19                                         |
| 3   | 12.08                                        |
| 7   | 773.09                                       |
| 15  | 49478.02                                     |
| 31  | 3166593.49                                   |
| 63  | 202661983.23                                 |
| 127 | 12970366926.83                               |

| $k$ | time on `Fr` muls (s), $n=32768$, Middle Path |
|-----|-----------------------------------------------|
| 1   | 0.64                                          |
| 3   | 50.73                                         |
| 7   | 3556.23                                       |
| 15  | 237494.51                                     |
| 31  | 15516308.09                                   |
| 63  | 1003176817.0                                  |
| 127 | 64527575460.96                                |


### n = 65536

| $k$ | time on `Fr` muls (s), $n=65536$, Naive |
|-----|-----------------------------------------|
| 1   | 2.04                                    |
| 3   | 173.95                                  |
| 7   | 12524.12                                |
| 15  | 846074.2                                |
| 31  | 55573715.71                             |
| 63  | 3602316751.94                           |
| 127 | 232007438403.62                         |

| $k$ | time on `Fr` muls (s), $n=65536$, Optimistic |
|-----|----------------------------------------------|
| 1   | 0.38                                         |
| 3   | 24.16                                        |
| 7   | 1546.19                                      |
| 15  | 98956.05                                     |
| 31  | 6333186.98                                   |
| 63  | 405323966.46                                 |
| 127 | 25940733853.65                               |

| $k$ | time on `Fr` muls (s), $n=65536$, Middle Path |
|-----|-----------------------------------------------|
| 1   | 1.28                                          |
| 3   | 101.47                                        |
| 7   | 7112.47                                       |
| 15  | 474989.02                                     |
| 31  | 31032616.18                                   |
| 63  | 2006353633.99                                 |
| 127 | 129055150921.93                               |


### n = 131072

| $k$ | time on `Fr` muls (s), $n=131072$, Naive |
|-----|------------------------------------------|
| 1   | 4.08                                     |
| 3   | 347.89                                   |
| 7   | 25048.25                                 |
| 15  | 1692148.4                                |
| 31  | 111147431.43                             |
| 63  | 7204633503.89                            |
| 127 | 464014876807.24                          |

| $k$ | time on `Fr` muls (s), $n=131072$, Optimistic |
|-----|-----------------------------------------------|
| 1   | 0.75                                          |
| 3   | 48.32                                         |
| 7   | 3092.38                                       |
| 15  | 197912.09                                     |
| 31  | 12666373.95                                   |
| 63  | 810647932.93                                  |
| 127 | 51881467707.31                                |

| $k$ | time on `Fr` muls (s), $n=131072$, Middle Path |
|-----|------------------------------------------------|
| 1   | 2.57                                           |
| 3   | 202.94                                         |
| 7   | 14224.93                                       |
| 15  | 949978.05                                      |
| 31  | 62065232.36                                    |
| 63  | 4012707267.99                                  |
| 127 | 258110301843.86                                |

## Conclusions
Folding $k$ instances for large $k$ is infeasible regardless of the strategy. It seems that we should execute foldings in a binary tree. This increases the verifier MSM cost over a strategy of folding many instances at once, since the verifier will not benefit from using larger MSMs lengths. 

From the above numbers, let's say we can fold one instance into a base instance in 8s (perhaps this is pessimistic, but recall these numbers are just for a single monomial term in a much more complex relation and don't include any additions or other Protogalaxy prover work!). Let's say we can execute 8 such operations in parallel in the client. Then we could fold 16 instances in $8*\log(16)=32$ s. We could do 32 instances at the cost of an additional $2*8$ s to deal with the base layer, and so on.

To move forward, we should:
 - Check my work here and incorporate realistic improvements.
 - Think about how much mileage we can get out of a Goblin-only strategy and ask how much PG improves on that.
 - Ask how much additional mileage we could get out of a WebGPU implementation. My sense is this is all extremely parallel.
 - Consider the high cost of witness construction. and include that in our overall client proving time cost.