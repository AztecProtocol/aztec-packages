# BN254 pairing

Write $E$ for the BN254 curve, defined by the equation $E: y^2 = x^3 + 3$. Write $\mathbb{F}_{q}$ and $\mathbb{F}_r$ for the base field and scalar field of $E$.

Write:
1. $\mathbb{F}_{q^2} = \mathbb{F}_q[u] \left/ (u^2 + 1) \right.$
2. $\mathbb{F}_{q^6} = \mathbb{F}_{q^2}[v] \left/ (w^3 - \xi) \right.$, $\xi = 9 + u$
3. $\mathbb{F}_{q^{12}} = \mathbb{F}_{q^6}[w] \left / (w^2 - v) \right.$

Write $E'$ for the twist of the BN254 curve defined by the equation $E' : y^2 = x^3 + 3 / \xi$, and $\Psi \colon E' \rightarrow E, (x, y) \mapsto (w^2 x, w^3 y)$ for the untwisting isomorphism.

Write $\mathbb{G}_1 = E(\mathbb{F}_q)$ and $\mathbb{G}_2 \subset E'(\mathbb{F}_{q^2})$ for the source groups of the optimal Ate pairing, and $\mathbb{G}_{T} \subset \mathbb{F}_{q^{12}}^{\times}$ for the target group
$$
    e \colon \mathbb{G}_1 \times \mathbb{G}_2 \rightarrow \mathbb{G}_T
$$

Write $\phi_q \colon E \rightarrow E, (x, y) \mapsto (x^q, y^q)$ for the Frobenius morphism, and $\phi_q := \Psi^{-1} \circ \phi_q \circ \Psi$ for the lift to the twist.

Given $(P, Q) \in \mathbb{G}_1 \times \mathbb{G}_2$, the optimal Ate pairing is defined as
$$
    e(P,Q) = \left( f_{6x + 2, Q}(P) \cdot l_{(6x + 2)Q, \phi_q(Q)}(P) \cdot l_{(6x + 2)Q + \phi_q(Q), -\phi^2_q(Q)} \right)^{\frac{q^{12}-1}{r}}
$$
where:
- $f_{6x + 2, Q}(P)$ is the Miller function with parameters $6x + 2$ and $Q$ evaluated at $P$
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
        result *= line_eval(running_point, Q, P);
        running_point += P;
    elif (i == -1):
        result *= line_eval(running_point, -Q, P);
        running_point -= Q;
    else:
        pass

```
where `signed_bit_decomposition_m` is binary signed bit decomposition of `m`, and `line_eval(Q_1, Q_2, P)` is the function that evaluates the line passing through `Q_1` and `Q_2` at `P`.

To compute the line function we bring $P$ to $E'$ and then evaluate there:
$$
\begin{aligned}
    l_{Q_1, Q_2}(P) &\;= l_{Q_1, Q_2}(\Psi^{-1}(P)) \\
    &\;= y_p \cdot w^3 - y_{Q_2} - \lambda_{Q_1, Q_2} (x_P \cdot w^2 - x_{Q_2})\\
    &\;= \lambda_{Q_1, Q_2} x_{Q_2} - y_{Q_2} - \lambda_{Q_1, Q_2} x_P \cdot v + y_p \cdot wv
\end{aligned}
$$

Finally, we compute the exponentiation by splitting the exponent in two parts:
$$
\begin{aligned}
    \frac{q^{12}-1}{r} &\;= \frac{q^{12}-1}{q^4 - q^2 + 1} \cdot \frac{q^4 - q^2 + 1}{r}\\
    &\;= (q^2 + 1) (q^6 - 1) \cdot \frac{q^4 - q^2 + 1}{r}
\end{aligned}
$$

The first part: $(q^2 + 1) (q^6 - 1)$ can be computed by means of the Frobenius morphism. The second part is known as the hard part and for it we use the algorithm described in Section 4.2 [here](https://eprint.iacr.org/2010/354.pdf).
