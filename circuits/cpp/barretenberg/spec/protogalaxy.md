# ProtoGalaxy Implementation Spec

$$
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

TODO: names for the globals: 48; 26
TODO: max degree is 5 (right?) and max relation length is one greater than that.
# Background
We will use [ProtoGalaxy](https://eprint.iacr.org/archive/2023/1106/1690490682.pdf) to fold [UltraGoblinHonk](https://github.com/AztecProtocol/aztec-packages/blob/master/circuits/cpp/barretenberg/cpp/src/barretenberg/honk/flavor/goblin_ultra.hpp) claims. The UltraGoblinHonk (UGH) proving system construct proofs for satisfying assignments for circuits built using [UltraCircuitBuilder](https://github.com/AztecProtocol/aztec-packages/blob/master/circuits/cpp/barretenberg/cpp/src/barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp). The circuits built using this builder class encode application logic and witnesses in an execution trace $\Trace$:

| row   | ... | $w_l$        | ... | $q_r$         | ... |
|-------|-----|--------------|-----|---------------|-----|
| $0$   | *   | $w_{l, 0}$   | *   | $q_{r, 0}$   | *   |
| $1$   | *   | $w_{l, 1}$   | *   | $q_{r, 1}$   | *   |
| ...   | ... | ...          | ... | ...          | ... |
| $n-1$ | *   | $w_{l, n-1}$ | *   | $q_{r, n-1}$ | *   |


Using the Lagrange basis on the boolean hypercube of dimension $\log(n)$, this data, along with the data of additional derived witnesses ($Z_\perm$ and $Z_\lookup$) and auxiliary polynomials (Lagrange polynomials e.g.) are stored in a `GoblinUltra::ProverPolynomials` instance $\Polys$, which we can model here as a tuple of $\NumPolys$-many polynomials. The claim of interest to the UGH prover is that the full aggregated UGH relation, a polynomial in variables
$$
\begin{aligned}
\Rel_\UGH(P_1,\ldots, P_{\NumPolys}) = 
&\phantom{+ \alpha^{1} \cdot } \Rel_\Arith(P_1,\ldots, P_{\NumPolys}) \\
&+ \alpha^{1}\cdot\Rel_\Perm(P_1,\ldots, P_{\NumPolys}) \\
&+ \alpha^{2}\cdot\Rel_\Lookup(P_1,\ldots, P_{\NumPolys}) \\
&+ \alpha^{3}\cdot\Rel_\GenPerm(P_1,\ldots, P_{\NumPolys}) \\
&+ \alpha^{4}\cdot\Rel_\Elliptic(P_1,\ldots, P_{\NumPolys}) \\
&+ \alpha^{5}\cdot\Rel_\Aux(P_1,\ldots, P_{\NumPolys}) \\
&+ \alpha^{6}\cdot\Rel_\ECCOpQueue(P_1,\ldots, P_{\NumPolys})\\
\end{aligned}
$$

evaluates to 0 on $\Polys_i$ for $i=0,\ldots,\circuitsize-1$, where $n$ is the circuit size. Generically, a prover can argue this claim in linear time by allowing a verifier to generate a challenge $\beta$ and then using a sumcheck argument for the claim
$$
\sum_{i=0}^{n-1}\beta^i\Rel_\UGH(\bin(i)) = 0
$$
where $\bin(i)$ is the length-$\log(n)$ vector of binary digits of $i$.

For comparison, ProtoGalaxy uses the notation for $\omega$ for the data encoded in $\Polys$ regarded simly as a data of vectors. The relation $\Rel_\UGH$ gets 

# Mara's sketch work.

 We unroll the protocol presented in the paper.

 ### Relating Paper to Code
 * $\omega$ is the Honk polynomials $\Polys$, for UGH there are 48 of them found in the GoblinUltra flavor
    * these polynomials are represented in evaluation form over the boolean hypercube $\{0,1\}^t$ where $t = \log n$ and $n$ is the circuit size (note that the code and earlier Honk resources use $d$ instead of $t$).
    * Honk polynomials = how we represent a circuit
 * $f$ in ProtoGalaxy is the full $\Rel_{UGH}$ itself
 * in Honk's sumcheck, each round constructs univariates over two consecutive rows in the table
    * the $i$-th row of the execution trace is filled with the evaluation of the Honk polynomials $\Polys$ at $i$, represented as a point of the hypercube
    * to represent each univariate we need $\dMAX + 1$ evaluations
* The value $f_i(\omega)$ in ProtoGalaxy is equal to $\Rel_{UGH}(\Trace_i)$, the evaluation of the full relation on the $i$-th row of the execution trace.

## How folding transforms Aztec's architecture:
### Current Structure
* a Noir contract is a collection of functions, where each function corresponds to a seperate circuit
* assume a Noir contract has a function `foo` which then calls a function `bar`
* if the user calls `foo`, executing that Noir code will produce a proof `P_foo` for `foo` and a proof `P_bar` for `bar`. `P_foo` will be accompanied, among other stuff, by a public input which specifies that `foo` calls `bar`
    * we think of this user action as a transaction and the private kernel circuit is responsible for proving it's validity; this entails recursively checking whatever functions `foo` calls
* in the example above, the private kernel will have two iterations to prove this private transaction is valid
    * first iteration is `K_foo` (this is a circuit): it will recursively verify `P_foo`, take most of `foo`'s public inputs (remember `foo` is actually a circuit) and transfer them to `K_foo`, add some constraints and finally, generate `P_K_foo`
        * so the structure of the `K_foo` circuit is as follows:
            * public inputs are (more or less) `foo`'s public inputs as well as "bar comes after foo"
            * `P_foo` also corresponds to inputs (not sure if public or private)
            * the `K_foo` circuit will have a Honk verifier subcircuit for `P_foo` and some other constraints
    * second iteration is `K_bar`: it recursively verifies `P_K_foo`, ensures that as part of `K_foo`s public_inputs we have "`foo` comes after `bar`", afterwards it recursively verifies `P_bar`, creates `K_bar`s public inputs from `K_foo` and `bar` and finally generates `P_K_bar`
         *  the structure of `K_bar` circuit is:
            * public inputs of `K_foo` and `bar` more or less
            * `P_bar` passed as input 
            * the circuit will have:
                * subcircuits for verifying `P_bar` and `P_k_bar` with Honk
                * constraints for verifying `bar` comes after `foo`
                * and some other constraints
If `bar` was to call a function `baz` there would be another kernel iteration `K_baz` with a similar structure to `K_bar`

### What Changes with folding
So instead of recursively proving these circuits, we fold them. This doesn't change anything in the structure of first kernel iteration but eliminates the need to have a Honk verifier circuit at iteration $i$ for recursively verifying the kernel proof from iteration $i-1$. However, each kernel iteration still Honk verifies the Noir proof of the corresponding function or otherwise we need to fold app kernel circuits as well.

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
3. $P$ computes  $F(X) = \sum_{i = 0..n-1} pow_i(\vec{\beta} + X\vec{\delta})f_i(\omega)$ where $pow_0(\vec{\beta} + X\vec{\delta}) = 1$
    * $i$ corresponds to the rows in the sumcheck matrix and $\omega$ is the full $\Honk$ relation 
        * this consists of 48 polynomials defined in flavor, the maximum degree among them being 5
        * unlike what happens in sumcheck, we will evaluate each full Honk relation at $i$ (we need code to do that) bu getting all the $f_i$ is a linear operation
    * Computing $pow_i(\vec{\beta} + X\vec{\delta})$ 
        * naively, the cost of computing this is $O(n \log n)$ but the paper provides a smart way to compute it in $O(n)$
            * binary tree trick (*insert drawing*)
        * following the paper notation, my understaing is 
            * $\vec{\beta} + X\vec{\gamma} = (\beta + X\gamma, \beta^2 + X\gamma^2, \ldots, \beta^{2^{t -1}} + X\gamma^{2^{t -1}})$ let's call this vector $\vec{v} = (v_1,..., v_t)$
                * so $pow_i(\vec{\beta} + X\vec{\gamma}) = pow_i(\vec{v}) = \prod_{j{}} v_j$ where $i = \sum_j 2^j$
            
       
            
* final $F$ will be a polynomial of degree $t = log(n)$
4. $P$ sends $F_1, \ldots,F_{t}$ to $V$
5. $V$ sends random challenge $\alpha \in \mathbb{F}$
    * In the noninteractive setting, this means adding another $logn$ scalars to the transcript 
6. $P, V$ compute $F(\alpha) = e + \sum_{i  = 0..t-1}F_i \alpha^i$, this is $\log n$ scalar operations
7. $P, V$ compute $\beta^*_i = \beta_i  +\alpha \cdot \delta^{2^{i-1}}$ these are the elements of $\vec{\beta}^*$ and require another $\log n$ multiplication and additions of scalars
8. P computes $G(X) = \sum_{i = 0..n-1} pow_i(\vec{\beta^{*}})f_i(L_0(X)\omega + \sum_{j \in [k]} L_j(X)\omega_j)$ whose maximum degree is $dk$
    * where $d$ is the maximum degree of a relation, in our case 5 (`MAX_RELATION_LENGTH` - 1)
    * the problem with the $pow_i(\vec{\beta^*})$ polynomial is that it's not preserving the nice structure presented on page 7 and we will probably have to use the binary tree trick here as well
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
11. At the end of the pr
    * $V: \phi^* = L_0(\gamma)\phi + \sum_{i \in [k]} L_i(\gamma)\phi_i$ 
        * as the public inputs are group elements, we require  $Pub_{tot}$ ecc scalar multiplication which are going to be offset  to the ECC VM
     * P: $\omega^* = L_0(\gamma)\omega + \sum_{i \in [k]} L_i(\gamma)\omega_i$

ProtoGalaxy requires 3 rather than  $2k\log n$ ($\log n$ for sumcheck and $\log n$ zeromorph + gemini) values from the random oracle.


---
## Scratch work on computation of $G(Y)$
We have reserved $X$ for the names of the inputs to the prover polynomials, the variables on the boolean hypercube, e.g., $w_l = w_l(X_1, \ldots, X_d)$. So let's use $Y$ for the perturbation and combiner variables in PG. This agrees with the notation of Protostar. Let's use $P$ for the inputs to the relations.

How do we interpret the definition of $G(Y)$? In the paper we write
$$G(Y) 
= \sum_{i=0}^{n-1}\pow_i(\beta^*)f_i\left(\sum_{j=0}^{k}L_j(Y)\omega_j\right)
= \sum_{i=0}^{n-1}\pow_i(\beta^*)\Rel_\UGH\left(\sum_{j=0}^{k}L_j(Y)\Polys^{(j)}_{i}\right)
$$

To rewrite this in our terms, the instances $\omega_0,\omega_1, \ldots, \omega_k$ correspond to `honk::flavor::Ultra::ProverPolynomials` instances $\Polys^{(0)}, \Polys^{(1)}, \ldots, \Polys^{(k)}$ and the polynomial $G$ becomes
$$G(Y) 
= \sum_{i=0}^{n-1}\pow_i(\beta^*)\Rel_\UGH\left(\sum_{j=0}^{k}L_j(Y)\Polys^{(j)}_{i}\right)
$$

Let's focus on the sub-term $\Rel_\Arith\left(\sum_{j=0}^{k}L_j(Y)\Polys^{(j)}_{i}\right).$ Using the indexing of `honk::flavor::Ultra`, we have

$$\Rel_\UGH(P_1,\ldots, P_{\NumPolys}) = P_{5}P_{25}P_{26} + P_{1}P_{25} + P_{2}P_{26} + P_{3}P_{27} + P_{0}.$$
To be clear, if $\Polys$ is an instance of `honk::flavor::Ultra::ProverPolynomials`, then 

$$\Rel_\UGH(\Polys) := \Rel_\UGH(\Polys_1,\ldots, \Polys_{\NumPolys}) = q_{m}w_lw_r + q_{l}w_{l} + q_{r}w_{r} + q_{o}w_{o} + q_{c}.$$

Similarly, with the superscript $(j)$ used in the natural way,
$$\begin{aligned}
\Rel_\Arith\left(\sum_{j=0}^{k}L_j(Y)\Polys^{(j)}\right) 
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
which is a polynomial of degree $3\circuitsize$ (in general, $G$ has degree $\dMAX\circuitsize$ where $\dMAX=5$ is one less than the maximum `RELATION_LENGTH` over the relations in  `honk::flavor::Ultra::Relations`).

Let's focus on the term
$$
\left(\sum_{j=0}^{k}L_j(Y)q^{(j)}_{l}\right)
                 \left(\sum_{j=0}^{k}L_j(Y)w^{(j)}_{l}\right)
    = \sum_{j,m=0}^{k}  L_j(Y)L_m(Y)q^{(j)}_{l}w^{(m)}_{l}
$$

### Interfaces
* we will fold `CircuitBuilder`s in bberg
* open question:
    * can the PG implementation take a bunch of `CircuitBuilder`, fold them and produce another `CircuitBuilder` which has similar structure or will the structure slightly change?

 
---

## Plan for interfaces
