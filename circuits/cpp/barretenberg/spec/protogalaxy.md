# ProtoGalaxy Implementation Spec

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

TODO: names for the globals: 48; 26
TODO: max degree is 5 (right?) and max relation length is one greater than that.
# Background
We will use [ProtoGalaxy](https://eprint.iacr.org/archive/2023/1106/1690490682.pdf) to fold [UltraGoblinHonk](https://github.com/AztecProtocol/aztec-packages/blob/master/circuits/cpp/barretenberg/cpp/src/barretenberg/honk/flavor/goblin_ultra.hpp) claims. The UltraGoblinHonk (UGH) proving system construct proofs for satisfying assignments for circuits built using [UltraCircuitBuilder](https://github.com/AztecProtocol/aztec-packages/blob/master/circuits/cpp/barretenberg/cpp/src/barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp). The circuits built using this builder class encode application logic and witnesses in an execution trace:

| row   | ... | $w_l$        | ... | $q_r$         | ... |
|-------|-----|--------------|-----|---------------|-----|
| $0$   | *   | $w_{l, 0}$   | *   | $q_{r, 0}$   | *   |
| $1$   | *   | $w_{l, 1}$   | *   | $q_{r, 1}$   | *   |
| ...   | ... | ...          | ... | ...          | ... |
| $n-1$ | *   | $w_{l, n-1}$ | *   | $q_{r, n-1}$ | *   |


Using the Lagrange basis on the boolean hypercube $\bB^t$ of dimension $t = \log(n)$, this data, along with the data of additional derived witnesses ($Z_\perm$ and $Z_\lookup$) and auxiliary polynomials (Lagrange polynomials e.g.) are stored in a `GoblinUltra::ProverPolynomials` instance $\Polys$, which we can model here as a tuple of $\NumPolys$-many polynomials. The claim of interest to the UGH prover is that the full aggregated UGH relation, a polynomial in variables 
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

### Efficient extension of Lagrange polynomials

Note: this is all done at compilation time, so it's less important to be efficient, but I write down the ideas nonetheless. We will need to compute  products of Lagrange polynomials of degree $\dMAX$. Each Lagrange polynomial has degree $k$, hence is determined by $k+1$ evaluations , hence a product of $\dMAX$ such polynomials will be represented by $k\dMAX+1$ values. To precompute all extensions of $L_0,\ldots, L_k$, we would have to store $k\cdot (\dMAX-1)\cdot(k+1)$ field elements. With values $\dMAX = 5$ and $k+1=128$, this is $127 * 5 * 4 * 128 * 32 = 10\_403\_840$ bytes of data. So probably we can just do this, but it will be important to be efficient at compilation time.

#### The formulas
Recall that the barycentric evaluation of polynomials represented by their values works as follows (cf [Vitalik's post](https://hackmd.io/@vbuterin/barycentric_evaluation)). I $P(X)$ is a polynomial represented by its evaluations $(y_1,\ldots, y_N)$ at points $(x_1, \ldots, x_N)$ , then $P(X) = \sum_i y_iL_i(X)$ where $L_i(X)$ is the Lagrange basis polynomial centered at $x_i$. By definition, 
$$
L_i(X) = \prod_{j\in\{0,\ldots, k\}\setminus\{i\}}\frac{X-x_j}{x_i-x_j}.
$$
Hence, defining $M(X) = \prod_{j\in\{1,\ldots, N\}}(X-x_j)$ and $d_i = \prod_{j\in\{1,\ldots, N\}\setminus\{i\}}x_i-x_j$, we have
$$P(X) 
= \sum_i y_iL_i(X)
= \sum_i y_i\prod_{j\in\{1,\ldots, N\}\setminus\{i\}}\frac{X-x_j}{x_i-x_j} 
= M(X)\sum_i \frac{y_i}{d_i(X-x_i)}.
$$
This means that, naively, one barycentric evaluation costs: $N$ subtractions and $N-1$ multiplications (to compute the value of $M$), $N$ multiplications (to divide $y_i/d_i$, assuming $d_i$ is inverted at compilation time), $N$ subtractions (to compute the $X-x_i$ values), $3N$ multiplications (amortized cost to batch invert the $X-x_i$ values), $N$ multiplications (to compute the summands), $N-1$ additions, and a final multiplication. The leading term here is $6N$ multiplications to get a single value. Hence, to extend to an additional set $x'_1, \ldots, x'_N$ of $N$ points costs about $6N^2$ operations.

However, with special structure we can do much better. We consider the case where $P(X)$ is _itself_ a Lagrange polynomial $L_i$, $N = k+1$ for some $k$, and $x_i = i-1$, so the domain of interest is,  $\{0, 1, \ldots, k\}$ and we extend to $\{0, 1, \ldots, 2k+1\}$ (so $x'_i = i+k$). In that case note that 
$$
L_i(k+1) = \prod_{j\in\{0,\ldots, k\}\setminus\{i\}}\frac{k+1-j}{i-j}
= \frac{\prod_{j\in\{0,\ldots, k\}\setminus\{i\}}k+1-j}
       {\prod_{j\in\{0,\ldots, k\}\setminus\{i\}} i-j}
= \frac{(k+1)!}{d_i\cdot (k+1-i) \cdot 0!},
$$
$$
L_i(k+2) = \prod_{j\in\{0,\ldots, k\}\setminus\{i\}}\frac{k+2-j}{i-j}
% = \frac{\prod_{j\in\{0,\ldots, k\}\setminus\{i\}}k+2-j}
%        {\prod_{j\in\{0,\ldots, k\}\setminus\{i\}} i-j}
= \frac{(k+2)!}{d_i\cdot (k+2-i) \cdot 1!}
= \frac{(k+2)(k+1-i)}{(k+2-i)1!} L_i(k+1),
$$
and in general, 
$$
L_i(k+s+1) = \frac{(k+s+1)(k+s-i)}{(k+s+1-i)s!} L_i(k+s).
$$
Hence we can compute the extension to an additional $N$ values more efficiently.

Moreover, note that the same recursive formula holds when $L_i$ is replaced by $cL_i$ for some constant $c$. This means enables the approach using 'successive extensions' we have taken elsewhere in the relations (or at least we used to? Maybe that optimization went away?).
### Comparison of cost models

With this new responsibility for execution of the relations comes a different cost model. Namely, before, it would have been efficient to compute part of the arithmetic relation as in
$$
q_m w_l w_r + q_{l} w_{l} = w_l\cdot (q_m w_r + q_l) \qquad 2\times,\, 1+ \text{ on values}
$$
Reusing the code path for the combiner polynomial combination, would likely look like this. We would want to compute
$$
\left(\sum_{j=0}^{k}L_j(Y)w^{(j)}_{l}\right)
\cdot \left(\left(\sum_{j=0}^{k}L_j(Y)q^{(j)}_{m}\right)
\left(\sum_{j=0}^{k}L_j(Y)w^{(j)}_{r}\right) 
+ \left(\sum_{j=0}^{k}L_j(Y)q^{(j)}_{l}\right)\right).
$$
Each $L_j$ is naturally represented by $k+1$ values, meaning the resulting expression would be represented by $3(k+1)$ values. Extending each $L_j$ requires $2\cdot 2(k+1)$ multiplications and $2(k+1)$ divisions (could batch invert, equivalent to about $3\cdot (2k+1) $ muls). Then each prover polynomial value would scale a Lagrange polynomial's value ($4 \cdot (2(k+1)+1)$ muls). Then we would assble the relation: $2\cdot 2(k+1)$ muls and $2(k+1)$ additions. So altogether we have: about $22k$ muls

Alternatively: compute the above as 
$$
\sum_{j_1, j_2, j_3 = 0}^{k}\Big(L_{j_1}(Y)L_{j_2}(Y)L_{j_3}(Y)\Big)
                         q^{(j)}_{m}w^{(j)}_{l}w^{(j)}_{r} 
+ \sum_{j_1, j_2 = 0}^{k}   \Big(L_{j_1}(Y)L_{j_2}(Y)\Big)
                         q^{(j)}_{l}w^{(j)}_{l}
$$

### Comparison of cost models take 2

Setting: we focus on the highest-degree ($=d$) monomial term in the PG combiner polynomial in the case where we are folding $k$ relations. Our target values we expect are $k=127$, $d=5$. 

For each $\ell=1,\ldots, d$ there are $k+1$ polynomials $P_\ell^{(0)},\ldots,\, P_\ell^{(k)}$ described by $n$ evaluations over $\bB^d$. Denote by $P_{\ell, i}^{j} = P_{\ell}^{j}(\bin(i))$. We will be interested in computing the terms 
$$
\prod_{\ell=1}^d L_{j_\ell}(Y)P_{\ell, i}^{(j_\ell)}
$$
for all $i=0,\ldots, n-1$, for every typle $(j_1, \ldots, j_d)\in \{0,\ldots, k\}^d$. Here each $L_j$ is the Lagrange polynomial on $\{0,\ldots, k\}$ centered at $j$, and extended over the set $\{0,\ldots, kd\}$ (i.e., it is regarded as the vector of its $kd+1$ values over that set). For now we ignore a small optmization of using the sparseness of the $L_j$ in the first $k+1$ terms in this representation.

#### Naive way
This is the way that would let us reuse our existing relations code:
$$
\prod_{\ell=1}^d \left(L_{j_\ell}(Y)P_{\ell, i}^{(j_\ell)}\right)
$$
- Each inner term: $kd+1$ muls, so computing all of them is $d\cdot (kd+1)$
- Multiplying the inner terms: $(d-1)(kd+1)$ muls
- Doing this for all $i$: multiply both of these preceding counts by $n$
- Do this for every index $j_*$: multiply both runnin counts by $(k+1)^d$.

Altogether the cost to compute these $n(k+1)^d$ terms is 
$$
(d(kd+1)+((d-1)(kd+1)))\cdot n\cdot (k+1)^d = n(2d-1)(k+1)^{d+1}
$$

If we could tolerate $(kd+1)\times$ as much memory usage, we could hold on to the inner terms $L_{j_\ell}(Y)P_{\ell, i}^{(j_\ell)}$. Using the target values, this factor is $636$. If each circuit had size $2^17$, our storage for the polynomials $P_\ell^{(j)}$ witness is $2^{17}*636*32 = 636*2^{22}$  $636*4 = 2544$ MiB. We dream of getting the circuit size down to $2^{15}$, which brings the storage for a polynomail down to 636 MiB. And this is just for one polynomial.

Alternatively, if we were to reduce $k+1$ to $32$, then then the $636$ factor becomes 156, and so we see a 75% reduction in the above numbers.

#### Isolating monomial terms
This way would require us isolating homogeneous components of the relations. We group terms as in
$$
\left(\prod_{\ell=1}^d L_{j_\ell}\right)\left(\prod_{\ell=1}^d P_{\ell, i}^{(j_\ell)}\right)
$$
- Taking the product of the Lagrange polynomials: $(d-1)(kd+1)$ muls.
- Multiplying the polynomial values $d-1$  muls
- Multiplying against the Lagrange term: $kd+1$  muls
- Doing the previous two steps for all $i$: multiply the counts by $n$
- Do this for every index $j_*$: multiply both of the preceding counts by $(k+1)^d$.

Altogether the cost to compute these $n(k+1)^d$ terms is 
$$
\begin{align*}
((d-1)(kd+1) + ((d-1) + (kd+1)) n) (k+1)^d \\
= nd(k+1)^{d+1} + (d-1)(kd+1)(k+1)^d
\end{align*}
$$

Asymptotically in $n$, this is a $\frac{d}{2d-1} = \frac{5}{9}$ reduction in costs. The total cost of storing all of the Lagrange polynomial products is $(kd+1)(k+1)^d$ field elements, which for our target values is $636\cdot 2^{7*5}$ bytes, or $636 \cdot 2^{5} = 20352$ GiB of information. If we were to reduce $k$ to $32$, then we would see $156\cdot 2^{5*5}$ bytes, or $156 \cdot 2^{5} = 4992$ MiB of information.

### Interfaces
* we will fold `CircuitBuilder`s in bberg
* open question:
    * can the PG implementation take a bunch of `CircuitBuilder`, fold them and produce another `CircuitBuilder` which has similar structure or will the structure slightly change?

 
---

## Plan for interfaces
