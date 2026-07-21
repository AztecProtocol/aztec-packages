# BN254 pairing

Write $E$ for the BN254 curve, defined by the equation $E: y^2 = x^3 + 3$. Write $\mathbb{F}_{q}$ and $\mathbb{F}_r$ for the base field and scalar field of $E$.

Write:
1. $\mathbb{F}_{q^2} = \mathbb{F}_q[u] \left/ (u^2 + 1) \right.$
2. $\mathbb{F}_{q^6} = \mathbb{F}_{q^2}[v] \left/ (v^3 - \xi) \right.$, $\xi = 9 + u$
3. $\mathbb{F}_{q^{12}} = \mathbb{F}_{q^6}[w] \left / (w^2 - v) \right.$

Write $E'(\mathbb{F}_{q^2})$ for the twist of the BN254 curve defined by the equation $E'(\mathbb{F}_{q^2}) : y^2 = x^3 + 3 / \xi$ over the field $\mathbb{F}_{q^2}$, and
$$\Psi \colon E'(\mathbb{F}_{q^2}) \rightarrow E(\mathbb{F}_{q^{12}}), (x, y) \mapsto (w^2 x, w^3 y)$$
for the untwisting morphism (which is an isomorphism on $E'(\mathbb{F}_{q^{12}})$).

Write $\mathbb{G}_1 = E(\mathbb{F}_q)$ and $\mathbb{G}_2 \subset E'(\mathbb{F}_{q^{12}})$ for the source groups of the optimal Ate pairing, and $\mathbb{G}_{T} \subset \mathbb{F}_{q^{12}}^{\times}$ for the target group
$$
    e \colon \mathbb{G}_1 \times \mathbb{G}_2 \rightarrow \mathbb{G}_T
$$ As $\Psi^{-1}(\mathbb{G}_2) \subset E'(\mathbb{F}_{q^2})$, see [The Eta pairing revisited, § 5](https://eprint.iacr.org/2006/110.pdf), we replace $\mathbb{G}_2$ with its preimage under $\Psi$ but we keep referring to it as $\mathbb{G}_2$.

Write $\phi_q \colon E \rightarrow E, (x, y) \mapsto (x^q, y^q)$ for the Frobenius morphism, and $$
\phi_q(x,y) := \left( \Psi^{-1} \circ \phi_q \circ \Psi \right)(x,y) = (\xi^{\frac{q-1}{3}}x, \xi^{\frac{q-1}{2}}y)
$$
for the lift to the twist $E'(\mathbb{F}_{q^2})$.

Given $(P, Q) \in \mathbb{G}_1 \times \mathbb{G}_2$, the optimal Ate pairing is defined as (more on $\gamma$ later)
$$
    e(P,Q) = \left( f_{6z + 2, Q}(P) \cdot l_{(6z + 2)Q, \phi_q(Q)}(P) \cdot l_{(6z + 2)Q + \phi_q(Q), -\phi^2_q(Q)} \right)^{\frac{q^{12}-1}{r} \gamma}
$$
where:
- $z = 4965661367192848881$ is the parameter generating the primes $q$ and $r$ via the formulas
$$
q = 36z^6 + 36z^3 + 24z^2 + 6z + 1 \quad \quad r = 36z^6 + 36z^3 + 18z^2 + 6z + 1
$$
- $f_{6z + 2, Q}(P)$ is the Miller function with parameters $6z + 2$ and $Q$ evaluated at $P$
- $l_{Q_1, Q_2}(P)$ is the line through $Q_1$ and $Q_2$ evaluated at $P$

The Miller loop function $f_{m, Q}(P)$ is calculated as follows:
```
std::vector<uint8_t> signed_bit_decomposition_m;
GT result;
G2 running_point = signed_bit_decomposition_m[0] == 1 ? Q : -Q;

for i in signed_bit_decomposition[:-1].revert():
    result = result.pow(2);
    result *= line_eval(running_point, running_point, P)
    running_point = running_point + running_point;
    if (i == 1):
        result *= line_eval(Q, running_point, P);
        running_point += Q;
    elif (i == -1):
        result *= line_eval(-Q, running_point, P);
        running_point -= Q;
    else:
        pass

```
where `signed_bit_decomposition_m` is binary signed bit decomposition of `m`:
$$\sum_{i} b_i 2^{i} = m \quad \quad b_i = \text{signed\_bit\_decomposition[i]}$$
and `line_eval(Q_1, Q_2, P)` is the function that evaluates the line passing through $Q_1$ and $Q_2$ at $P$.

To compute the line function:
- we map $Q_1, Q_2$ from $E'(\mathbb{F}_{q^2})$ to $E'(\mathbb{F}_{q^{12}})$ and then apply $\Psi$ to transport them to $E(\mathbb{F_{q^{12}}})$
- we compute in projective coordinates to avoid inversions
- we rescale the equations to optimize the calculations: we rescale the line equation of the doubling by $-2Y_{Q_1}Z_{Q_1}$, while we rescale the one of the addition by $X_{Q_2} - X_{Q_1}Z_{Q_2}$

Below we write down the line equation in affine coordinates, from which the ones in projective coordinates can be derived
$$
\begin{aligned}
    l_{Q_1, Q_2}(P) &\;= l_{\Psi(Q_1), \Psi(Q_2)}(P) \\
    &\;= y_P - y_{Q_1} \cdot w^3 - \lambda_{Q_1, Q_2} (x_P - x_{Q_1} \cdot w^2) \cdot w\\
    &\;= y_P - \lambda_{Q_1, Q_2} x_P \cdot w + (\lambda_{Q_1, Q_2} x_{Q_1} - y_{Q_1}) \cdot w^3
\end{aligned}
$$

Finally, we compute the exponentiation by splitting the exponent in two parts:
$$
\begin{aligned}
    \frac{q^{12}-1}{r} \gamma &\;= \frac{q^{12}-1}{q^4 - q^2 + 1} \cdot \frac{q^4 - q^2 + 1}{r} \gamma\\
    &\;= (q^2 + 1) (q^6 - 1) \cdot \frac{q^4 - q^2 + 1}{r} \gamma
\end{aligned}
$$

The first part: $(q^2 + 1) (q^6 - 1)$ can be computed by means of the Frobenius morphism. The second part is known as the hard part and for it we use the algorithm described in Section 3.3 [here](https://cacr.uwaterloo.ca/techreports/2012/cacr2012-17.pdf).

The reason why we add $\gamma$ to the fraction is that we can write the exponent of the hard part as
$$
    \frac{q^4 - q^2 + 1}{r} \gamma = \mu_0 + \mu_1 q + \mu_2 q^2 + \mu_3 q^3
$$
which is efficiently computable by means of the Frobenius morphism. The values of $\gamma$ and $\mu_0, \mu_1, \mu_2, \mu_3$ are:
$$
    \begin{aligned}
        \gamma &\; = 2z (6z^2 + 3z + 1)\\
        \mu_0 &\;= 1 + 6z + 12z^2 + 12z^3\\
        \mu_1 &\;= 4z + 6z^2 + 12 z^3\\
        \mu_2 &\;= 6z + 6z^2 + 12 z^3\\
        \mu_3 &\; -1 + 4z + 6z^2 + 12z^3\\
    \end{aligned}
$$
