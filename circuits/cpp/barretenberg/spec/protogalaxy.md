# ProtoGalaxy Implementation Spec

$$
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
\newcommand{\lookup}{\text{lookup}}
\newcommand{\Trace}{\text{Trace}}
\newcommand{\Polys}{\text{Polys}}
\newcommand{\NumPolys}{N_\Polys}
\newcommand{\ProtoGalaxy}{\text{ProtoGalaxy}}
\newcommand{\Honk}{\text{Honk}}
$$

TODO: names for the globals: 48; 26
TODO: max degree is 5 (right?) and max relation length is one greater than that.
# Background
We will use [ProtoGalaxy](https://eprint.iacr.org/archive/2023/1106/1690490682.pdf) to fold [UltraGoblinHonk](https://github.com/AztecProtocol/aztec-packages/blob/master/circuits/cpp/barretenberg/cpp/src/barretenberg/honk/flavor/goblin_ultra.hpp) claims. The UltraGoblinHonk (UGH) proving system construct proofs for satisfying assignments for circuits built using [UltraCircuitBuilder](https://github.com/AztecProtocol/aztec-packages/blob/master/circuits/cpp/barretenberg/cpp/src/barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp). The circuits built using this builder class encode application logic and witnesses in an execution trace $\Trace$:

| row | $w_0$ | $w_1$ | $w_2$ | $w_3$ | $w_l$ | $q_l$ | ... |
|-----|-------|-------|-------|-------|-------|-------|-----|
| 0   | *     | *     | *     | *     | *     | *     | *   |
| 1   | *     | *     | *     | *     | *     | *     | *   |
| ... | ...   | ...   | ...   | ...   | ...   | ...   | ... |
| n-1 | *     | *     | *     | *     | *     | *     | *   |
| n   | *     | *     | *     | *     | *     | *     | *   |

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
Each $X$ is a polynomial

# Mara's sketch work.

 We unroll the protocol presented in the paper.

 ### Relating Paper to Code
 * $\omega$ is the Honk polynomials $\Polys$, for UGH there are 48 of them found in the GoblinUltra flavor
    * these polynomials are represented in evaluation form over the boolean hypercube $\{0,1\}^t$ where $t = \log n$ and $n$ is the circuit size (note that the code and earlier Honk resources use $d$ instead of $t$).
 * $f$ in ProtoGalaxy is the full $\Rel_{UGH}$ itself
 * in Honk's sumcheck, each round constructs univariates over two consecutive rows in the table
    * the $i$-th row of the execution trace is filled with the evaluation of the Honk polynomials $\Polys$ at $i$, represented as a point of the hypercube
    * to represent each univariate we need $\dMAX + 1$ evaluations
* The value $f_i(\omega)$ in ProtoGalaxy is equal to $\Rel_{UGH}(\Trace_i)$, the evaluation of the full relation on the $i$-th row of the execution trace.

### Notation:

* $k$ is the number of instances we fold with our accumulator, the exact value of $k$ we will use is an open question as the paper presents various techniques with trade-offs

* $\log(n) = t$

* Define the vanishing polynomial as $Z(X) = \prod_{a \in \mathbb{H}}(X - a)$ where:
    * In our case $\mathbb{H} = {0,\ldots, k}$
    * Its Lagrange base is $L_0(X), \ldots, L_k(X)$ where
     $L_i(X) = \prod_{j\in \{0 \ldots k \},\,, j\neq i} \tfrac{(X-j)}{(i-j)}$

        * these polynomials have degree $k$



$$\ProtoGalaxy(\Phi = ((\phi, \vec{\beta}, e), (\phi_1,\ldots, \phi_k); (\omega, \omega_1,\ldots, \omega_k)))$$
(semicolumn separates public and private inputs)

1. $V \rightarrow P:\delta \in \mathbb{F}$
    * to achieve this noninteractively, we add ($k + 1$) public inputs corresponding to each instance, $e$ and $\vec{\beta}$ to the transcript
      * $\vec{\beta}$ has size aprox $\log(n)$ so in total we add to the transcript (i.e. hash) $log(n) + 1$ scalars and $Pub_{tot}$ group elements from all the instances $\phi$
      * $Pub_{tot} = 26k + \sum Pub_{\omega_i}$, where: 
        - $26$ is the number of selector polynomials whose commitments the verifier has as public inputs in $UGH$ 
        - $Pub_{\omega_i}$ is the number of public inputs of $\omega_i$ note that this can vary for each instance $\omega_i$ but in practice we will haave to bound $Pub_{tot}$.
2. $P, V$ compute $\vec{\delta} = (\delta, \delta^2, \ldots, \delta^{2^{t -1}})$ , which can be computed with $t-1$ squaring operations.
3. $P$ computes  $F(X) = \sum_{i \in [n]} pow_i(\vec{\beta} + X\vec{\delta})f_i(\omega)$
    * $i$ corresponds to the rows in the sumcheck matrix and $\omega$ is the full $\Honk$ relation 
        * this consists of 48 polynomials defined in flavor, the maximum degree among them being 6
        * unlike what happens in sumcheck, we will evaluate each full Honk relation at $i$ (we need code to do that) bu getting all the $f_i$ is a linear operation
    * Computing $pow_i(\vec{\beta} + X\vec{\delta})$ 
        * naively, the cost of computing this is $O(n \log n)$ but the paper provides a smart way to compute it in $O(n)$
            * TODO: unroll the linear algorithm in the paper
        * the current sumcheck code computes $pow_{\zeta}$, we need to modify/rewrite to compute $pow_{\vec{\beta} + X\vec{\gamma}}$ 
            * TODO: look at the code to understand what can be reused
        * following the paper notation, my understaing is 
            * $\vec{\beta} + X\vec{\gamma} = (\beta + X\gamma, \beta^2 + X\gamma^2, \ldots, \beta^{2^{t -1}} + X\gamma^{2^{t -1}})$ let's call this vector $\vec{v} = (v_1,..., v_t)$
                * so $pow_i(\vec{\beta} + X\vec{\gamma}) = pow_i(\vec{v}) = \prod_{j{}} v_j$ where $i = \sum_j 2^j$
            
       
            
* final $F$ will be a polynomial of degree $t = log(n)$
4. $P$ sends $F_1, \ldots,F_{t}$ to $V$
5. $V$ sends random challenge $\alpha \in \mathbb{F}$
    * In the noninteractive setting, this means adding another $logn$ scalars to the transcript 
6. $P, V$ compute $F(\alpha) = e + \sum_{i \in [t]}F_i \alpha^i$, this is $\log n$ scalar operations
7. $P, V$ compute $\beta^*_i = \beta_i  +\alpha \cdot \delta^{2^{i-1}}$ these are the elements of $\vec{\beta}^*$ and require another $\log n$ multiplication and additions of scalars
8. P computes $G(X) = \sum_{i \in [n]} pow_i(\vec{\beta^{*}})f_i(L_0(X)\omega + \sum_{j \in [k]} L_j(X)\omega_j)$ whose maximum degree is $dk$
    * where $d$ is the maximum degree of a relation, in our case 5 (`MAX_RELATION_LENGTH` - 1)
    * we can compute f_i($L_0(X)\omega + \sum_{j \in [k]} L_j(X)\omega_j$) by partially reusing the sumcheck code for computing univariates
        * the current sumcheck code, for $k \in \{0, 1\}$ computes $L_0(X)f_i(\omega) + L_1(X)f_{i+1}(\omega)$ which is obtained by computing $d+1$ evaluations
        * in our case we will need $dk + 1$ evaluation points for computing the polynomial and then apply $f_i$ for each row
9. P computes polynomial $K$ and sends its coefficients 
$G(X) = F(\alpha)L_0(X) + Z(X)K(X)$
    * if $G(X)$ has degree $dk$, so will $Z(X)K(X)$ (because $F(\alpha)L_0(X)$ has degree $k$)
    and given $Z(X)$ has degree $k+1$,$K(X)$ will have degree k(d-1)-1
    * We need to compute $K$ without FFTs (because we might want to work with Grumpkin and also we don't want to use FFTs in UGH)
        * Option 1: schoolbook polynomial division (moonmath, page 32)[https://github.com/LeastAuthority/moonmath-manual]
        * Option 2: Zac's idea:
            * recall the degree of $K$ is $k(d-1)-1$ and thus we need $k(d-1)$ evaluations to represent it
            * we can evaluate $G$, $Z$, $L_0$ at $k(d-1)$ points and compute the division in evaluation form to obtain $K$
             * note, all this points must be $\not\in \mathbb{H}$ where $\mathbb{H}$ is the vanishing set of $Z$
            * then we can convert $K$ to coefficient form and send the coefficients to the verifier
11. V sends $\gamma$ 
    * in the noninteractive setting we add $K$'s coefficients (scalars) to the transcript 
12. $P, V$ compute  $e^* = F(\alpha)L_0(\gamma) + Z(\gamma)K(\gamma)$ which is (d-1)k scalar operations
11. At the end of the protocol
    * $V: \phi^* = L_0(\gamma)\phi + \sum_{i \in [k]} L_i(\gamma)\phi_i$ 
        * as the public inputs are group elements, we require  $Pub_{tot}$ ecc scalar multiplication which are going to be offset  to the ECC VM
     * P: $\omega^* = L_0(\gamma)\omega + \sum_{i \in [k]} L_i(\gamma)\omega_i$

ProtoGalaxy requires 3 rather than  $2k\log n$ ($\log n$ for sumcheck and $\log n$ zeromorph + gemini) values from the random oracle.

## Estimations of computing K

(WARNING this are very hand wavy)

Option 2:
* for simplicity assume $G(X) =  X^{dk}, Z(X) = X^{k+1} -1, L_0(X) = X^k$ and look at multiplications
    * to get all the values we perform the following numbers of multiplications between scalars :
        * $k(d-1)dk$ for $G$
        * $k(d-1)(k+1)$ for $Z$
        * $k(d-1)k$ for $L_0$
        * in total this is $k(d-1)(dk+ 2k +1)$


Option 1:
* would be worst case $d^2k^2$ (?)
        





 

