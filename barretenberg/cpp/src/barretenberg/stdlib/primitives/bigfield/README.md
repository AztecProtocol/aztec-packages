$\newcommand{\radd}{{\ \textcolor{lightgreen}{+} \ }}$
$\newcommand{\rsub}{{\ \textcolor{lightgreen}{-} \ }}$
$\newcommand{\rmul}{{\ \textcolor{lightgreen}{*} \ }}$
$\newcommand{\padd}{{\ \textcolor{red}{+} \ }}$
$\newcommand{\pmul}{{\ \textcolor{red}{*} \ }}$
$\newcommand{\const}[1]{\textcolor{gray}{#1}}$
$\renewcommand{\prime}[1]{#1_{\textsf{prime}}}$

# Bigfield in Barretenberg

> $\textcolor{orange}{\textsf{Warning}}$: This document is intended to provide an overview of the bigfield multiplication and addition operations in barretenberg. It is not a complete specification and does not cover all edge cases or optimizations. The source code should be consulted for a complete understanding of the implementation.

### Notation

A table that summarizes the notation used in this document:
| Symbol | Description |
|---------------|-----------------------------------------------------------------------------------------------|
| $n$ | Modulus of the native field |
| $p$ | Modulus of the non-native field (bigfield) |
| $L$ | Bit size of each limb (fixed as 68 bits) |
| $T$ | Bit size of the integer representation of bigfield elements defined as: $T := 4L$ |
| $2^T$ | Modulus for integer representation of bigfield elements |
| $M$ | The CRT product $M := 2^T \cdot n$ |
| $\rmul, \radd, \rsub$ | Native field multiplication, addition, and subtraction respectively |
| $\pmul$ | Non-native (bigfield) multiplication |

### Overview of Bigfield Multiplication with CRT

Given $a, b$ bigfield elements, we want to compute $r := a \ \pmul \ b$, that is $r = a \cdot b \textsf{ mod }p$. This is done by computing the quotient $q$ and remainder $r$ such that

$$
a \cdot b = q \cdot p + r. \tag{1}
$$

We can compute $q$ and $r$ natively (using integer arithmetic) as follows:

$$
\begin{aligned}
q &= \left\lfloor \frac{a \cdot b}{p} \right\rfloor, \\
r &= a \cdot b \ \textsf{ mod } \ p.
\end{aligned}
$$

Using the Chinese Remainder Theorem (CRT), we know that if equation $(1)$ holds modulo $2^T$ and modulo $n$, then it must also hold modulo $M = 2^T \cdot n$. Further, if it holds modulo $M$ and both sides of the equation are less than $M$, then it must also hold over integers. This means that the quotient $q$ and the remainder $r$ were computed correctly, and hence we can conclude that $a \cdot b = r \textsf{ mod } p$. In other words, $r$ is the correct multiplication result of $a$ and $b$ in the bigfield $\mathbb{F}_p$. Mathematically, this can be expressed as follows:

$$
\begin{aligned}
(a \cdot b - q \cdot p - r) \ \textsf{ mod } \ 2^T &\equiv 0, \\
(a \cdot b - q \cdot p - r) \ \textsf{ mod } \ n &\equiv 0.
\end{aligned}
\quad \overset{{\tiny \textsf{CRT}}}{\implies} \quad
\begin{aligned}
(a \cdot b - q \cdot p - r) &\equiv 0 \ \textsf{ mod } \ M
\quad \overset{\substack{a \cdot b \ < \ M, \\[3pt] q \cdot p + r \ < \ M}}{\implies} \quad
a \cdot b \equiv r \ \textsf{ mod } \ p.
\end{aligned}
$$

To summarize, if we can compute the quotient $q$ and the remainder $r$ as per equation $(1)$, and we enforce the following conditions:

$$
\begin{aligned}
a \cdot b - q \cdot p - r &= 0 \ \textsf{mod} \ 2^T, \tag{C1}
\end{aligned}
$$

$$
\begin{aligned}
a \cdot b - q \cdot p - r &= 0 \ \textsf{mod} \ n, \tag{C2}
\end{aligned}
$$

$$
\begin{aligned}
(q \cdot p + r) &< M \quad \text{and} \quad a \cdot b < M. \tag{C3}
\end{aligned}
$$

then we can conclude that $a \ \pmul \ b = r$.

### Representation of Bigfield Elements

Bigfield elements are represented as 4 limbs of size $L$ bits each, where $L = 68$ bits. The limbs are denoted as $a_0, a_1, a_2, a_3$, and the bigfield element $a$ is represented as:

$$
a \equiv (
\underbrace{ \qquad a_3 \qquad }_{\color{orange}{L \textsf{ or } |p| - 3L}} \|
\underbrace{ \qquad a_2 \qquad }_{\color{orange}{L}} \|
\underbrace{ \qquad a_1 \qquad }_{\color{orange}{L}} \|
\underbrace{ \qquad a_0 \qquad }_{\color{orange}{L}}
).
$$

The orange values indicate the default maximum bit sizes of the limbs. The most-significant limb $a_3$ can be either have $L$ bits or $|p| - 3L$ bits, depending on whether overflow is allowed or not. The other limbs $a_2, a_1, a_0$ always start with $L$ bits each.

We allow overflow in these limbs to enable efficient multiplication and addition operations. To ensure that the bigfield elements are within the permissible limits, we track the maximum values of the limbs. Let $\textcolor{orange}{A_0}, \textcolor{orange}{A_1}, \textcolor{orange}{A_2}, \textcolor{orange}{A_3}$ be the maximum values of the limbs $a_0, a_1, a_2, a_3$ respectively:

$$
a \equiv (\underbrace{\qquad a_3 \qquad}_{\textcolor{orange}{< \ A_3}} \ \| \ \underbrace{\qquad a_2 \qquad}_{\textcolor{orange}{< \ A_2}} \ \| \ \underbrace{\qquad a_1 \qquad}_{\textcolor{orange}{< \ A_1}} \ \| \ \underbrace{\qquad a_0 \qquad}_{\textcolor{orange}{< \ A_0}}).
$$

where each $a_i$ is a limb of size $L$ bits and $a_i < \textcolor{orange}{A_i}$. The maximum value of $a$ is given by:

$$
\textcolor{orange}{A} = \textcolor{orange}{A_0} + \const{2^L} \cdot \textcolor{orange}{A_1} + \const{2^{2L}} \cdot \textcolor{orange}{A_2} + \const{2^{3L}} \cdot \textcolor{orange}{A_3}
\quad \implies \quad a < \textcolor{orange}{A}.
$$

As mentioned before, the default maximum values of the limbs $a_0, a_1, a_2$ is $(2^{L} - 1)$ as the default bit-sizes of these limbs are all $L$ bits. For the most-significant limb $a_3$, the default maximum value is either $(2^{L} - 1)$ or $(2^{|p| - 3L} - 1)$ depending on whether overflow is allowed or not.

In addition to the integer-limb representation of bigfield elements, we also define the prime-limb representation of bigfield elements. The prime-limb is basically the value of the bigfield element modulo the native field modulus $n$. The prime-limb representation of a bigfield element $a$ is given by:

$$
a_{\textsf{prime}} = (a_0 \ \radd \ \const{2^L} \rmul a_1 \ \radd \ \const{2^{2L}} \rmul a_2 \ \radd \ \const{2^{3L}} \rmul a_3) \textsf{ mod } n.
$$

Hereafter, we represent a bigfield element $a$ as a tuple of its integer-limb representation and its prime-limb representation:

$$
a = (a_0, \ a_1, \ a_2, \ a_3, \ a_{\textsf{prime}}).
$$

### Bigfield Reduction

Given a bigfield element $a \in [0, 2^T)$ we would like to reduce it to $r \in [0, p)$ such that

$$

a \equiv r \ \textsf{mod} \ p.


$$

This is known as full reduction. We need to check the following conditions in the circuit:

1. Compute quotient $q$ and remainder $r$ such that $a = q \cdot \const{p} + r$ natively:
   - $q := \left\lfloor \frac{a}{\const{p}} \right\rfloor$,
   - $r := a \ \textsf{mod} \ p$,
2. Check if $q \cdot \const{p} + r - a = 0$ in the circuit,
3. Enforce range constraint on quotient $q < 2^L$ (must fit in one limb)
4. Enforce range constraint on remainder $r < \const{p}$

The last step of checking $r < \const{p}$ is very expensive in circuits. Instead, we perform a relaxed condition on $r < 2^s$ where $s := |\const{p}|$. This is enough for operations where you care more about not overflowing rather than getting an exact value mod $p$. Checking $r < 2^s$ is much cheaper in circuits because it simply implies clearing higher bits.

This relaxed check is knowns as _lazy reduction_. It suffices because in addition chains, if we keep reducing intermediate values to lie within a safe range above $p$ (like $2^s$), then the final result can be reduced mod $p$ at the end.

### Details on Bigfield Addition

Given two bigfield elements $a, b \in [0, 2^T)$

$$
\begin{aligned}
a =&\ (a_0, \ a_1, \ a_2, \ a_3, \ a_{\textsf{prime}}) \\
b =&\ (b_0, \ b_1, \ b_2, \ b_3, \ b_{\textsf{prime}})
\end{aligned}
$$

we wish to compute sum $z = a \padd b := (a + b) \ \textsf{mod} \ p$ in the circuit with native field $\mathbb{F}_n$. To do so, we can simply compute field additions of the respective limbs.

$$
c \equiv (c_0, \ c_1, \ c_2, \ c_3, \ c_{\textsf{prime}}) := ((a_0 \radd b_0), \ (a_1 \radd b_1), \ (a_2 \radd b_2), \ (a_3 \radd b_3), \ (a_{\textsf{prime}} \radd b_{\textsf{prime}})).
$$

If $a$ and $b$ both are circuit witnesses, then the above addition can be performed using 5 addition gates in the circuit. However, we can optimize this further by defining a custom bigfield addition that uses 4 gates. The custom bigfield addition gate performs two limb additions in one gate and rest of the three limb additions in the other three gates.

$$
\begin{aligned}
\textsf{gate 1:} \quad c_0 &= a_0 \radd b_0 \ \textsf{ and } \ c_{\textsf{prime}} = a_{\textsf{prime}} \radd b_{\textsf{prime}} \\
\textsf{gate 2:} \quad c_1 &= a_1 \radd b_1, \\
\textsf{gate 3:} \quad c_2 &= a_2 \radd b_2, \\
\textsf{gate 4:} \quad c_3 &= a_3 \radd b_3.
\end{aligned}
$$

It is worth noting that we cannot do better than 4 gates because we have a total of 15 witnesses (5 each for $x, y$ and $z$) that can fit in $\lceil 15/4 \rceil = 4$ gates (4 wires per gate).

#### Tracking Maximum Values due to Addition

When we add two bigfield elements $a$ and $b$, we need to track the maximum values of the limbs of the result. Suppose $a$ and $b$ are two bigfield elements represented as:

$$
\begin{aligned}
a &\equiv (\underbrace{\qquad a_3 \qquad}_{\textcolor{orange}{< \ A_3}} \ \| \ \underbrace{\qquad a_2 \qquad}_{\textcolor{orange}{< \ A_2}} \ \| \ \underbrace{\qquad a_1 \qquad}_{\textcolor{orange}{< \ A_1}} \ \| \ \underbrace{\qquad a_0 \qquad}_{\textcolor{orange}{< \ A_0}}), \\
b &\equiv (\underbrace{\qquad b_3 \qquad}_{\textcolor{orange}{< \ B_3}} \ \| \ \underbrace{\qquad b_2 \qquad}_{\textcolor{orange}{< \ B_2}} \ \| \ \underbrace{\qquad b_1 \qquad}_{\textcolor{orange}{< \ B_1}} \ \| \ \underbrace{\qquad b_0 \qquad}_{\textcolor{orange}{< \ B_0}}).
\end{aligned}
$$

When we add $a$ and $b$, the maximum value of the sum $c = a + b$ is given by:

$$
\textcolor{orange}{C} = \textcolor{orange}{\underbrace{(A_0 + B_0)}_{C_0}} + 2^L \cdot \textcolor{orange}{\underbrace{(A_1 + B_1)}_{C_1}} + 2^{2L} \cdot \textcolor{orange}{\underbrace{(A_2 + B_2)}_{C_2}} + 2^{3L} \cdot \textcolor{orange}{\underbrace{(A_3 + B_3)}_{C_3}}.
$$

Adding two bigfield elements with default maximum values of the limbs, each limb would overflow by 1 bit. As a result, the resulting bigfield element $c$ would have the following maximum values of the limbs:

$$
\begin{aligned}
\textcolor{orange}{C_i} &= (2^L - 1) + (2^L - 1) = 2^{L+1} - 2 \ \implies \ \textsf{overflow by 1 bit} \\
\end{aligned}
$$

for $i = 0, 1, 2, 3$. The maximum value of the most-significant limb $\textcolor{orange}{C_3}$ would depend on whether overflow is allowed or not.
The overflow bit is carried over to the next limb, so the maximum value of the resulting bigfield element $c$ would be affected by the overflow of the most significant limb. Thus, the resulting bigfield element $c$ would also overflow by 1 bit.

### Details on Bigfield Multiplication

Given two bigfield elements $a, b \in [0, 2^T)$ (as described in the previous section), we wish to compute product $r = a \pmul b := (a \cdot b) \ \textsf{mod} \ p$ in the circuit with native field $\mathbb{F}_n$. To do so, we find integers $q$ and $r$ such that

$$a \cdot b = q \cdot p + r$$

where $q$ is the quotient and $r$ is the remainder when we divide $(a \cdot b)$ by $p$. We define

$$X := a \cdot b - q \cdot p - r.$$

As per the conditions $(\text{C1}), (\text{C2})$ and $(\text{C3})$, we know that

$$
\boxed{
\begin{aligned}
X &= 0 \ \ \textsf{mod} \ \ 2^T \\
X &= 0 \ \ \textsf{mod} \ \ n \\
\end{aligned}
\quad \textsf{and} \quad
\begin{aligned}
a \cdot b &< M \\
q \cdot p + r &< M
\end{aligned}
}
\ \implies \
X = 0 \ \ \textsf{mod} \ \ p.
$$

Effectively, this means $a \pmul b = r$. Recall that $\pmul$ is used to denote multiplication in the non-native field $\mathbb{F}_p$. We describe the checks: [modulo 2^T](#checking-x--0-textsf-mod--2t), [modulo n](#checking-x--0-textsf-mod--n), and [CRT modulus](#checking-crt-modulus).

#### Checking $X = 0 \textsf{ mod } 2^T$

We proceed to compute $X$ as follows:

$$
\begin{aligned}
X &= a \cdot b - q \cdot \const{p} - r \\
&= \underbrace{a \cdot b}_{\textsf{term 1}} + \underbrace{q \cdot (\const{-p})}_{\textsf{term 2}} - r
\end{aligned}
$$

To compute the first term, we look at the integer multiplication of $a$ and $b$ (using schoolbook multiplication):

$$
\begin{aligned}
a \cdot b =&\ (a_0 \rmul b_0) \ \radd \ \\
&\ (a_0 \rmul b_1 \ \radd \ a_1 \rmul b_0) \rmul \const{2^{L}} \ \radd \ \\
&\ (a_0 \rmul b_2 \ \radd \ a_2 \rmul b_0 \ \radd \ a_1 \rmul b_1) \rmul \const{2^{2L}} \ \radd \ \\
&\ (a_0 \rmul b_3 \ \radd \ a_3 \rmul b_0 \ \radd \ a_1 \rmul b_2 \ \radd \ a_2 \rmul b_1) \rmul \const{2^{3L}} \ \radd \ \\
&\ (a_1 \rmul b_3 \ \radd \ a_3 \rmul b_1 \ \radd \ a_2 \rmul b_2) \rmul \const{2^{4L}} \ \radd \ \\
&\ (a_2 \rmul b_3 \ \radd \ a_3 \rmul b_2) \rmul \const{2^{5L}} \ \radd \ \\
&\ (a_3 \rmul b_3) \rmul \const{2^{6L}}.
\end{aligned}
$$

Since we want to compute $X \ \textsf{mod} \ 2^T$ and $T = 4L$, the last three terms would be $0 \ \textsf{mod} \ 2^{T}$. Hence, we have

$$
\begin{aligned}
(a \cdot b) \ \textsf{mod} \ 2^T =&\ (a_0 \rmul b_0) \ \radd \ \\
&\ (a_0 \rmul b_1 \ \radd \ a_1 \rmul b_0) \rmul \const{2^{L}} \ \radd \ \\
&\ (a_0 \rmul b_2 \ \radd \ a_2 \rmul b_0 \ \radd \ a_1 \rmul b_1) \rmul \const{2^{2L}} \ \radd \ \\
&\ (a_0 \rmul b_3 \ \radd \ a_3 \rmul b_0 \ \radd \ a_1 \rmul b_2 \ \radd \ a_2 \rmul b_1) \rmul \const{2^{3L}}.
\tag{\textsf{term 1}}
\end{aligned}
$$

Next, we want to compute $(q \cdot (\const{-p})) \ \textsf{mod} \ 2^T$ given the limb representation of $q \equiv (q_3 \ \| \ q_2 \ \| \ q_1 \ \| \ q_0)$ and circuit constant $(\const{-p}) \ \textsf{mod} \ 2^T := \const{(2^T - p)} \equiv (\ \const{p_3'} \ \| \ \const{p_2'} \ \| \ \const{p_1'} \ \| \ \const{p_0'} \ )$. Thus, we get

$$
\begin{aligned}
(q \cdot \const{(-p)}) \ \textsf{mod} \ 2^T = (q \cdot \const{(2^T - p)}) \ \textsf{mod} \ 2^T =&\ (q_0 \rmul \const{p_0'}) \ \radd \ \\
&\ (q_0 \rmul \const{p_1'} \ \radd \ q_1 \rmul \const{p_0'}) \rmul \const{2^{L}} \ \radd \ \\
&\ (q_0 \rmul \const{p_2'} \ \radd \ q_2 \rmul \const{p_0'} \ \radd \ q_1 \rmul \const{p_1'}) \rmul \const{2^{2L}} \ \radd \ \\
&\ (q_0 \rmul \const{p_3'} \ \radd \ q_3 \rmul \const{p_0'} \ \radd \ q_1 \rmul \const{p_2'} \ \radd \ q_2 \rmul \const{p_1'}) \rmul \const{2^{3L}}.
\tag{\textsf{term 2}}
\end{aligned}
$$

With the limb representation of the remainder $r \equiv (r_3 \ \| \ r_2 \ \| \ r_1 \ \| \ r_0)$, we finally get

$$
\begin{aligned}
X \ \textsf{mod} \ 2^T :=&\ \left((a \cdot b) + (q \cdot \const{(-p)}) - r\right) \ \textsf{mod} \ 2^T \\[5pt]
=&\ \underbrace{(a \cdot b) \ \textsf{mod} \ 2^T}_{\textsf{term 1}} + \underbrace{(q \cdot \const{(-p)}) \ \textsf{mod} \ 2^T}_{\textsf{term 2}} - (r \ \textsf{mod} \ 2^T).
\end{aligned}
$$

So far, we have figured out how to compute the first two terms of $X \ \textsf{mod} \ 2^T$. We now need to subtract remainder $r \equiv (r_3 \ \| \ r_2 \ \| \ r_1 \ \| \ r_0) \in [0, 2^T)$ from the sum of the first two terms. We need to be a bit careful here because the subtraction of $r$ from the sum of the first two terms can cause a borrow in the limbs. We will handle this borrow later, but for now, we proceed with subtracting $r$ from the sum of the first two terms as follows:

$$
\begin{aligned}
X \ \textsf{mod} \ 2^T =&\ \overset{X_{\textsf{low}}}{\boxed{\begin{aligned}
&(a_0 \rmul b_0 \ \radd \ q_0 \rmul \const{p_0'} \ \rsub \ r_0) \ \radd \\
&(a_0 \rmul b_1 \ \radd \ a_1 \rmul b_0 \ \radd \ q_0 \rmul \const{p_1'} \ \radd \ q_1 \rmul \const{p_0'} \ \rsub \ r_1) \rmul \const{2^{L}}
\end{aligned}}} \ \radd \ \\
&\ \const{2^{2L}} \cdot \underset{X_{\textsf{high}}}{\boxed{\begin{aligned}
&(a_0 \rmul b_2 \ \radd \ a_2 \rmul b_0 \ \radd \ a_1 \rmul b_1 \ \radd \ q_0 \rmul \const{p_2'} \ \radd \ q_2 \rmul \const{p_0'} \ \radd \ q_1 \rmul \const{p_1'} \ \rsub \ r_2) \ \radd \\
&(a_0 \rmul b_3 \ \radd \ a_3 \rmul b_0 \ \radd \ a_1 \rmul b_2 \ \radd \ a_2 \rmul b_1 \ \radd \ q_0 \rmul \const{p_3'} \ \radd \ q_3 \rmul \const{p_0'} \ \radd \ q_1 \rmul \const{p_2'} \ \radd \ q_2 \rmul \const{p_1'} \ \rsub \ r_3) \rmul \const{2^{L}}
\end{aligned}}}.
\end{aligned}
$$

As $X \ \textsf{mod} \ 2^T$ is a $4L$-bit integer (i.e., 272 bits), we cannot represent it as a single native field element. Instead, we split it into two parts: $X_{\textsf{low}}$ and $X_{\textsf{high}}$, each of size $2L$ bits (as shown above). The first part $X_{\textsf{low}}$ contains the lower 136 bits of the result, while the second part $X_{\textsf{high}}$ contains the higher 136 bits. We write the expression of the two parts as follows:

$$
\begin{aligned}
X_{\textsf{low}} :=&\ (a_0 \rmul b_0 \ \radd \ q_0 \rmul \const{p_0'} \ \rsub \ r_0) \ \radd \ \\ \tag{X}
&\ (a_0 \rmul b_1 \ \radd \ a_1 \rmul b_0 \ \radd \ q_0 \rmul \const{p_1'} \ \radd \ q_1 \rmul \const{p_0'} \ \rsub \ r_1) \rmul \const{2^{L}}, \\[5pt]
\textcolor{skyblue}{C_{\textsf{low}}} :=&\ \left\lfloor\frac{X_{\textsf{low}}}{\const{2^{2L}}} \right\rfloor, \qquad {\small \color{grey}{\textsf{// carry due to the low limb}}} \\[5pt]
X_{\textsf{high}} :=&\ \textcolor{skyblue}{C_{\textsf{low}}} + (a_0 \rmul b_2 \ \radd \ a_2 \rmul b_0 \ \radd \ a_1 \rmul b_1 \ \radd \ q_0 \rmul \const{p_2'} \ \radd \ q_2 \rmul \const{p_0'} \ \radd \ q_1 \rmul \const{p_1'} \ \rsub \ r_2) \ \radd \\
&\ (a_0 \rmul b_3 \ \radd \ a_3 \rmul b_0 \ \radd \ a_1 \rmul b_2 \ \radd \ a_2 \rmul b_1 \ \radd \ q_0 \rmul \const{p_3'} \ \radd \ q_3 \rmul \const{p_0'} \ \radd \ q_1 \rmul \const{p_2'} \ \radd \ q_2 \rmul \const{p_1'} \ \rsub \ r_3) \rmul \const{2^{L}}, \\[5pt]
\textcolor{skyblue}{C_{\textsf{high}}} :=&\ \left\lfloor\frac{X_{\textsf{high}}}{\const{2^{2L}}}\right\rfloor. \qquad {\small \color{grey}{\textsf{// carry due to the high limb}}}
\end{aligned}
$$

Note that we have defined two circuit witnesses $\textcolor{skyblue}{C_{\textsf{low}}}$ and $\textcolor{skyblue}{C_{\textsf{high}}}$ that represent the carries due to the low and high limbs respectively. Considering these carries are necessary as the limbs $X_{\textsf{low}}$ and $X_{\textsf{high}}$ can overflow.
Recall that we wanted to show that $X \equiv 0 \ \textsf{mod} \ 2^T$ which implies

$$
X_{\textsf{low}} \equiv 0 \ \textsf{mod} \ 2^{T/2} \quad \textsf{and} \quad X_{\textsf{high}} \equiv 0 \ \textsf{mod} \ 2^{T/2}.
$$

This means that the carries $\textcolor{skyblue}{C_{\textsf{low}}}$ and $\textcolor{skyblue}{C_{\textsf{high}}}$ must be small positive integers. We can enforce this by range-constrainting them to be less $\textcolor{skyblue}{b_{\textsf{low}}}$ and $\textcolor{skyblue}{b_{\textsf{high}}}$ bits respectively. To determine these bit sizes of the carries, we need to analyze the maximum values of the limbs involved in the computation of $X_{\textsf{low}}$ and $X_{\textsf{high}}$. Before we do that, we take a quick detour to describe the gate constraints for multiplication.

> .
>
> #### Gate constraints for multiplication:
>
> As per the analysis, $X_{\textsf{low}}$ requires 3 witness-witness multiplications and $X_{\textsf{high}}$ requires 7 witness-witness multiplications. A simple Plonk gate can perform 1 witness-witness multiplication. Using this naive gate would require a total of at least 10 gates (ignoring any extra additions which will cost additional gates). We define two custom gates that can each perform 4 and 3 witness-witness multiplications respectively, so we would need just 3 such gates for multiplications. We rearrange the above equations to use these custom gates as follows:
>
> $$
> \begin{aligned}
> X_{\textsf{low}} = C_{\textsf{low}} \rmul \const{2^{2L}}
> =&\ \color{brown}{\boxed{
> (a_0 \rmul b_0 \ \rsub \ r_0) \ \radd \ (a_0 \rmul b_1 \ \radd \ a_1 \rmul b_0) \rmul \const{2^L}
> }}
> \longleftarrow \ell_0 \\
> &\ \ \radd \ \color{violet}{\boxed{
> q_0 \rmul \const{(p_0' + 2^L \cdot p_1')} \ \radd \ q_1 \rmul \const{(2^L \cdot p_0')} \ \rsub \ r_1 \rmul \const{2^{L}}
> }}
> \\[10pt]
> X_{\textsf{high}} = C_{\textsf{high}} \rmul \const{2^{2L}}
> =&\ C_{\textsf{low}} \ \radd \
> \color{brown}{\boxed{
> (a_0 \rmul b_2 \ \radd \ a_2 \rmul b_0 - r_2) \ \radd \ (a_0 \rmul b_3 \ \radd \ a_3 \rmul b_0 \ \rsub \ r_3) \rmul \const{2^L}
> }}
> \longleftarrow h_0
> \\
> &\ \ \radd \
> \color{brown}{\boxed{
> (a_1 \rmul b_1) \ \radd \ (a_1 \rmul b_2 \ \radd \ a_2 \rmul b_1) \rmul \const{2^L}
> }}
> \\
> &\ \ \radd \
> \color{violet}{\boxed{
> q_3 \rmul \const{(2^L \cdot p_0')} \ \radd \ q_2 \rmul \const{(p_0' + 2^L \cdot p_1')}
> }}
> \\
> &\ \ \radd \
> \color{violet}{\boxed{
> (q_0 \rmul \const{(p_2' + 2^L \cdot p_3')} \ \radd \ q_1 \rmul \const{(p_1' + 2^L \cdot p_2')})
> }}
> \end{aligned}
> $$
>
> The $\color{brown}{\textsf{maroon}}$ boxes represent computation that uses the custom bigfield multiplication gate while the $\color{violet}{\textsf{violet}}$ boxes represent computation with typical width-4 addition gates. The $\const{\textsf{grey}}$ terms are circuit constants (that are set as selector values). We enlist the gate constraints as follows.
>
> | Gate type     | Constraint                                                                                                                                                                                                 |
> | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | bigfield mult | $\ell_0 = \color{brown}{(a_0 \rmul b_0 \ \rsub \ r_0) \ \radd \ (a_0 \rmul b_1 \ \radd \ a_1 \rmul b_0) \rmul \const{2^L}}$                                                                                |
> | add           | $C_{\textsf{low}} \rmul \const{2^{2L}} = \color{brown}{\ell_0} + \color{violet}{q_0 \rmul \const{(p_0' + 2^L \cdot p_1')} \ \radd \ q_1 \rmul \const{(2^L \cdot p_0')} \ \rsub \ r_1 \rmul \const{2^{L}}}$ |
> | bigfield mult | $h_0 = \color{brown}{(a_0 \rmul b_2 \ \radd \ a_2 \rmul b_0 - r_2) \ \radd \ (a_0 \rmul b_3 \ \radd \ a_3 \rmul b_0 \ \rsub \ r_3) \rmul \const{2^L}}$                                                     |
> | bigfield mult | $h_1 = \color{brown}{h_0 + (a_1 \rmul b_1) \ \radd \ (a_1 \rmul b_2 \ \radd \ a_2 \rmul b_1) \rmul \const{2^L}}$                                                                                           |
> | add           | $h_2 = h_1 \ \radd \ C_{\textsf{low}} \ \radd \  \color{violet}{q_3 \rmul \const{(2^L \cdot p_0')} \ \radd \ q_2 \rmul \const{(p_0' + 2^L \cdot p_1')}}$                                                   |
> | add           | $C_{\textsf{high}} \rmul \const{2^{2L}} = h_2 \ \radd \  \color{violet}{q_0 \rmul \const{(p_2' + 2^L \cdot p_3')} \ \radd \ q_1 \rmul \const{(p_1' + 2^L \cdot p_2')}}$                                    |
>
> The output of this custom multiplication function is the two carry outputs $C_{\textsf{low}}$ and $C_{\textsf{high}}$.
> Note that we need to range-constrain these carries $C_{\textsf{low}}$ and $C_{\textsf{high}}$ to appropriate number of bits (max allowed bits - $2L$). These range constraints (if any) need to be applied outside the custom multiplication function.
>
> .

#### Tracking Maximum Values due to Multiplication

Suppose $a$ and $b$ are two bigfield elements represented, along with the maximum values of their limbs, as:

$$
\begin{aligned}
a &\equiv (\underbrace{\qquad a_3 \qquad}_{\textcolor{orange}{< \ A_3}} \ \| \ \underbrace{\qquad a_2 \qquad}_{\textcolor{orange}{< \ A_2}} \ \| \ \underbrace{\qquad a_1 \qquad}_{\textcolor{orange}{< \ A_1}} \ \| \ \underbrace{\qquad a_0 \qquad}_{\textcolor{orange}{< \ A_0}}), \\
b &\equiv (\underbrace{\qquad b_3 \qquad}_{\textcolor{orange}{< \ B_3}} \ \| \ \underbrace{\qquad b_2 \qquad}_{\textcolor{orange}{< \ B_2}} \ \| \ \underbrace{\qquad b_1 \qquad}_{\textcolor{orange}{< \ B_1}} \ \| \ \underbrace{\qquad b_0 \qquad}_{\textcolor{orange}{< \ B_0}}).
\end{aligned}
$$

When we multiply $a$ and $b$, we represent the output $d = a \cdot b$ as two field elements: $d = (d_{\textsf{hi}} \ \| \ d_{\textsf{lo}})$. We track the maximum values of the low and high parts separately in $\textcolor{orange}{D_{\textsf{lo}}}$ and $\textcolor{orange}{D_{\textsf{hi}}}$ respectively. Thus, we have

$$
\begin{aligned}
\textcolor{orange}{D_{\text{lo}}} = &\ \textcolor{orange}{\underbrace{(A_0 \cdot B_0)}_{D_0}} + \textcolor{orange}{\underbrace{(A_0 \cdot B_1 + A_1 \cdot B_0)}_{D_1}} \cdot \const{2^L},
\\ \tag{D}
\textcolor{orange}{D_{\text{hi}}} = &\ \textcolor{orange}{\underbrace{(A_0 \cdot B_2 + A_2 \cdot B_0 + A_1 \cdot B_1)}_{D_2}} + \textcolor{orange}{\underbrace{(A_0 \cdot B_3 + A_3 \cdot B_0 + A_1 \cdot B_2 + A_2 \cdot B_1)}_{D_3}} \cdot \const{2^L}.
\end{aligned}
$$

> **Upper Bound on Limb Sizes**:
>
> We need to ensure that the maximum value of the limbs of the result of multiplication, $\textcolor{orange}{D_{\textsf{lo}}}$ and $\textcolor{orange}{D_{\textsf{hi}}}$, do not exceed the native field modulus $n$.
> The question is: how large can the limbs of the bigfield multiplicands be such that the maximum values of the limbs of the product do not exceed $n$?
> If we allow the limbs to grow to a maximum of $Q$ bits, then the maximum values of the product would be given by:
>
> $$
> \begin{aligned}
> \textcolor{orange}{D_{\textsf{lo}}} &= (2^{Q} - 1)^2 + 2 \cdot (2^{Q} - 1)^2 \cdot 2^L \ < \ 2^{2Q + L + 1}, \\
> \textcolor{orange}{D_{\textsf{hi}}} &= 3 \cdot (2^{Q} - 1)^2 + 4 \cdot (2^{Q} - 1)^2 \cdot 2^L \ < \ 2^{2Q + L + 2}.
> \end{aligned}
> $$
>
> Clearly, maximum value of $\textcolor{orange}{D_{\textsf{hi}}}$ determines the overall maximum of the two outputs of multiplication:
>
> $$
> \textsf{max}(\textcolor{orange}{D_{\textsf{lo}}}, \textcolor{orange}{D_{\textsf{hi}}}) < 2^{2Q + L + 2}.
> $$
>
> This is the maximum value of the resulting limbs of a single product $d = a \cdot b$. Suppose we have $2^k$ such products, then the maximum value of the limbs of the sum of these products would be:
>
> $$
> \begin{aligned}
> \sum_{i=1}^{2^k} \textcolor{orange}{D_{\textsf{hi}, i}} & \ < \ 2^{k + 2Q + L + 2}.
> \end{aligned}
> $$
>
> We require that this value must not exceed the native field modulus $n$. Hence, we need to ensure that:
>
> $$
> \begin{aligned}
> 2^{k + 2Q + L + 2} &< n \quad \implies \quad \boxed{Q < \frac{\text{log}_2(n) - L - k - 2}{2}}.
> \end{aligned}
> $$
>
> This means that the maximum limb size that must be allowed is $Q = \left\lfloor\frac{253.5 - 68 - 10 - 2}{2}\right\rfloor = 86$.
>
> .

#### Range Constraints on Carry Outputs

We need to determine the range constraints on the carry outputs $\textcolor{skyblue}{C_{\textsf{low}}}$ and $\textcolor{skyblue}{C_{\textsf{high}}}$ based on the maximum values of the resulting limbs $X_{\textsf{low}}$ and $X_{\textsf{high}}$. Recall:

$$
\begin{aligned}
X \ \textsf{mod} \ 2^T =&\ \underbrace{(a \cdot b) \ \textsf{mod} \ 2^T}_{\textsf{term 1}} + \underbrace{(q \cdot \const{(-p)}) \ \textsf{mod} \ 2^T}_{\textsf{term 2}} - (r \ \textsf{mod} \ 2^T).
\end{aligned}
$$

Let the maximum values of the first term be $\textcolor{orange}{D_{\textsf{lo}}}$ and $\textcolor{orange}{D_{\textsf{hi}}}$ as defined above. Let the maximum values of the second term be $\textcolor{orange}{E_{\textsf{lo}}}$ and $\textcolor{orange}{E_{\textsf{hi}}}$. We know how to compute these as described in the previous section. Let the maximum values of the limbs of the remainder term be $\textcolor{orange}{R_{\textsf{lo}}}$ and $\textcolor{orange}{R_{\textsf{hi}}}$.
The third term is to be subtracted from the sum of the first two terms, so we need to ensure that the overall result is non-negative (i.e., never underflows).

$$
\begin{aligned}
\left((a \cdot b) \ \textsf{mod} \ 2^T + (q \cdot \const{(-p)}) \ \textsf{mod} \ 2^T\right)
&\equiv \ell_{\textsf{low}} + \const{2^L} \cdot \ell_{\textsf{high}}, \\
(r \ \textsf{mod} \ 2^T)
&\equiv r_{\textsf{low}} + \const{2^L} \cdot r_{\textsf{high}}.
\end{aligned}
$$

First, we argue that underflow in the higher limb is not possible. This is because the remainder $r$ is restricted to be in the range $[0, 2^{|p|})$ while $\ell_{\textsf{high}} \in [0, 2^T)$. For the lower limb, we we must protect against underflow in an extreme case where $h_{\textsf{lo}} = 0$. In that case, we must borrow $\textcolor{orange}{R_{\textsf{low}}}$ from the higher limb to ensure that the result is non-negative. We can write the result $X$ in terms of borrowed value as follows:

$$
\begin{aligned}
X_{\textsf{low}} &= 0 + \textcolor{orange}{R_{\textsf{lo}}} - r_{\textsf{low}},\\
X_{\textsf{high}} &= h_{\textsf{high}} - \left\lfloor\frac{\textcolor{orange}{R_{\textsf{lo}}}}{\const{2^{2L}}}\right\rfloor - r_{\textsf{high}}.
\end{aligned}
$$

This works because we know $r_{\textsf{low}} < \textcolor{orange}{R_{\textsf{lo}}}$ which ensures that $X_{\textsf{low}}$ is non-negative. Naturally, we need to adjust the higher limb by removing the borrowed value from it.

Finally, the maximum values of the limbs of the result $X$ are given by:

$$
\begin{aligned}
X_{\textsf{low}} &< \textcolor{orange}{D_{\textsf{lo}}} + \textcolor{orange}{E_{\textsf{lo}}} + \textcolor{orange}{R_{\textsf{lo}}}, \\
X_{\textsf{high}} &< \textcolor{orange}{D_{\textsf{hi}}} + \textcolor{orange}{E_{\textsf{hi}}}.
\end{aligned}
$$

and thus the carry outputs (in terms of bits) are bounded by:

$$
\begin{aligned}
\textcolor{skyblue}{C_{\textsf{low}}} &< \left\lfloor\frac{\textcolor{orange}{D_{\textsf{lo}}} + \textcolor{orange}{E_{\textsf{lo}}} + \textcolor{orange}{R_{\textsf{lo}}}}{\const{2^{2L}}}\right\rfloor, \\
\textcolor{skyblue}{C_{\textsf{high}}} &< \left\lfloor\frac{\textcolor{orange}{D_{\textsf{hi}}} + \textcolor{orange}{E_{\textsf{hi}}}}{\const{2^{2L}}}\right\rfloor.
\end{aligned}
$$

Note that we do not include the term $(\textcolor{orange}{R_{\textsf{lo}}} / \const{2^{2L}})$ in the carry output bound of $\textcolor{skyblue}{C_{\textsf{high}}}$ as it is unlikely to contribute to the underflow of $X_{\textsf{high}}$.

#### Checking $X = 0 \textsf{ mod } n$

Checking $X$ modulo the native field modulus $n$ is straightforward because we track prime limb representations of the bigfield elements. Thus we can express $X$ as follows:

$$
\begin{aligned}
X &= \left((a \cdot b) + (q \cdot \const{(-p)}) - r\right) \textsf{ mod } n \\
&= (a \textsf{ mod } n) \cdot (b \textsf{ mod } n) + (q \textsf{ mod } n) \cdot (\const{(-p)} \textsf{ mod } n) - (r \textsf{ mod } n) \\
&= a_{\textsf{prime}} \rmul b_{\textsf{prime}} + q_{\textsf{prime}} \rmul \const{(n - p)} - r_{\textsf{prime}},
\end{aligned}
$$

To check that $X \equiv 0 \textsf{ mod } n$, we can use the following constraint:

$$
\begin{aligned}
a_{\textsf{prime}} \rmul b_{\textsf{prime}} + q_{\textsf{prime}} \rmul \const{(n - p)} - r_{\textsf{prime}} = 0.
\end{aligned}
$$

This can be enforced in the circuit by adding a simple multiplication gate.

#### Checking CRT Modulus

We need to ensure both sides of the original multiplication are less than the CRT modulus $M$:

$$
\begin{aligned}
a \cdot b &< M, \\
q \cdot \const{p} + r &< M.
\end{aligned}
$$

To check the first condition, we compute the maximum value of the product $(a \cdot b)$ as $\textcolor{orange}{D_{\textsf{lo}}}$ and $\textcolor{orange}{D_{\textsf{hi}}}$ (see equation $(D)$).

$$
\begin{aligned}
\textsf{max}(a \cdot b) = \textcolor{orange}{D_{\textsf{lo}}} + \const{2^{2L}} \cdot \textcolor{orange}{D_{\textsf{hi}}} < M. \tag{\textsf{check 1}}
\end{aligned}
$$

The second condition can be used to find the maximum permissible quotient as follows:

$$
\begin{aligned}
q \cdot \const{p} + r &< M \quad \implies \quad q  < \frac{M - r}{\const{p}} \quad \implies \quad q_{\textsf{max}} = \left\lfloor \frac{M - \textcolor{orange}{R}}{\const{p}} \right\rfloor.
\end{aligned}
$$

where $\textcolor{orange}{R}$ is the maximum value of the remainder $r$. Now, let maximum value of the quotient $q$ that we compute natively be $\textcolor{orange}{Q_{\textsf{max}}}$, which must obey the following range constraint:

$$
0 \leq \textcolor{orange}{Q_{\textsf{max}}} \leq q_{\textsf{max}} \quad \textsf{where} \quad \textcolor{orange}{Q_{\textsf{max}}} := \left\lfloor \frac{\textsf{max}(a \cdot b)}{\const{p}} \right\rfloor
= \left\lfloor \frac{\textcolor{orange}{D_{\textsf{lo}}} + \const{2^{2L}} \cdot \textcolor{orange}{D_{\textsf{hi}}}}{\const{p}} \right\rfloor.
\tag{check 2}
$$

If both $\textsf{check 1}$ and $\textsf{check 2}$ are satisfied, then we can conclude that the multiplication is valid under the CRT modulus $M$. If either of these checks fail, then we must reduce one of the inputs ($a$ or $b$ depending on which one has a higher maximum value) to ensure that the multiplication is valid under the CRT modulus. If after reducing one of the inputs, the checks still fail, then we reduce the second input as well. Once both inputs are reduced, both checks must pass.

### Handling Multiple Multiplications and Additions

We want to compute the sum of multiple bigfield products and additions while ensuring that the result is still valid under the CRT modulus $M$. In this case, we want to avoid modular reductions of the inputs as much as possible.

Suppose we have $(m + 1)$ bigfield products $a_j \cdot b_j$ for $j = 0, \ldots, m$, and we also want to add $k$ bigfield elements $c_i$ for $i = 1, \ldots, k$. We want to compute the sum:

$$
\begin{aligned}
\left(a_0 \cdot b_0 + \sum_{j=1}^{m} a_j \cdot b_j + \sum_{i=1}^{k} c_i\right) \textsf{ mod } p.
\end{aligned}
$$

Following the same approach as simple multiplication, we compute the quotient $q$ and the remainder $r$ natively as follows:

$$
\begin{aligned}
q &= \left\lfloor \frac{a_0 \cdot b_0 + \sum_{j=1}^{m} a_j \cdot b_j + \sum_{i=1}^{k} c_i}{\const{p}} \right\rfloor, \\
r &= \left(a_0 \cdot b_0 + \sum_{j=1}^{m} a_j \cdot b_j + \sum_{i=1}^{k} c_i\right) \textsf{ mod } p.
\end{aligned}
$$

We then want to ensure that the following condition holds (in circuit):

$$
\begin{aligned}
\left(a_0 \cdot b_0 + \sum_{j=1}^{m} a_j \cdot b_j + \sum_{i=1}^{k} c_i\right) = q \cdot \const{p} + r, \\
\implies a_0 \cdot b_0 = q \cdot \const{p} + \underbrace{\left( r - \sum_{j=1}^{m} a_j \cdot b_j - \sum_{i=1}^{k} c_i \right)}_{=: \ r'}.
\end{aligned}
$$

This form is similar to the one we used for simple multiplication, except for two things:

1. We need to define the net remainder $r'$ that accumulates the contributions from all the products (except $a_0 \cdot b_0$) and additions. This will cost additional constraints in the circuit (using efficient field accumulation).
2. We need to ensure that the maximum values of the limbs of the products and sums do not exceed the CRT modulus $M$.

For the second condition, we need to adjust the maximum values of the limbs to account for the additional products and sums. As a result, the carry outputs will also need to be adjusted accordingly:

$$
\begin{aligned}
\textcolor{skyblue}{C_{\textsf{low}}} &< \left\lfloor\frac{
  \left(\textcolor{orange}{D_{\textsf{lo}}} + \sum_{j=1}^{m} \textcolor{orange}{D_{j, \textsf{lo}}}\right) +
  \left(\sum_{i=1}^{k} \textcolor{orange}{C_{i, \textsf{lo}}}\right) +
  \textcolor{orange}{E_{\textsf{lo}}} +
  \textcolor{orange}{R_{\textsf{lo}}}
  }{\const{2^{2L}}}
  \right\rfloor, \\
\textcolor{skyblue}{C_{\textsf{high}}} &< \left\lfloor\frac{
  \left(\textcolor{orange}{D_{\textsf{hi}}} + \sum_{j=1}^{m} \textcolor{orange}{D_{j, \textsf{hi}}}\right) +
  \left(\sum_{i=1}^{k} \textcolor{orange}{C_{i, \textsf{hi}}}\right) +
  \textcolor{orange}{E_{\textsf{hi}}}
  }{\const{2^{2L}}}
  \right\rfloor.
\end{aligned}
$$

where $\textcolor{orange}{D_{i, \textsf{lo}}}$ and $\textcolor{orange}{D_{i, \textsf{hi}}}$ are the maximum values of the limbs of the products $a_j \cdot b_j$ for $j = 1, \ldots, m$, and $\textcolor{orange}{C_{i, \textsf{lo}}}$ and $\textcolor{orange}{C_{i, \textsf{hi}}}$ are the maximum values of the limbs of the summands $c_i$ for $i = 1, \ldots, k$. We also need to update the maximum value of the quotient $q$ to account for the additional products and sums:

$$
\begin{aligned}
\textcolor{orange}{Q_{\textsf{max}}} =
\left\lfloor
\frac{
  \left(\textcolor{orange}{D_{\textsf{lo}}} + \sum_{j=1}^{m} \textcolor{orange}{D_{j, \textsf{lo}}}\right) +
  \const{2^{2L}} \left(\textcolor{orange}{D_{\textsf{hi}}} + \sum_{j=1}^{m} \textcolor{orange}{D_{j, \textsf{hi}}}\right) +
\sum_{i=1}^{k} \left( \textcolor{orange}{C_{i, \textsf{lo}}} + \const{2^{2L}} \cdot \textcolor{orange}{C_{i, \textsf{hi}}} \right)
}{\const{p}}
\right\rfloor.
\end{aligned}
$$

This ensures that the sum of the products and additions does not exceed the CRT modulus $M$.

### Details on Bigfield Subtraction

Let $a, b \in [0, 2^T)$ be two bigfield elements and we want to compute modular subtraction $a - b \textsf{ mod } p$. Let $c$ be the result of the subtraction. We can compute $c$:

$$
c = (a - b) \textsf{ mod } p
$$

If $a > b$, then we would not need to worry about underflows and we can compute $c$ directly. If $a < b$, then we need to ensure that the subtraction does not lead to underflows. To do this, we introduce a constant term $\const{s \cdot p}$ such that:

$$
\begin{aligned}
a + \const{s \cdot p} - b \geq 0,
\end{aligned}
$$

where $s$ is the smallest integer such that the above condition holds. This ensures that we do not have any underflows when we subtract $b$ from $(a + \const{s \cdot p})$. Note that the result of the modular subtraction remains $c$ because we are adding a multiple of the modulus $\const{p}$ to $a$ before subtracting $b$.

> .
>
> **Computing the multiple $s$:**
>
> To compute the multiple $s$, we first look at the subtraction formula:
>
> $$
> \begin{aligned}
> \begin{array}{c|c|c|c}
> a_3 & a_2 & a_1 & a_0 \\[5pt]
> b_3 & b_2 & b_1 & b_0 \\[5pt]
> \hline \\[-4pt]
> & & a_1 - \beta_0 & \textcolor{olive}{a_0 + \beta_0 \cdot 2^L - b_0} \\[5pt]
> \hline \\[-4pt]
>  & a_2 - \beta_1 & \textcolor{olive}{(a_1 - \beta_0) + \beta_1 \cdot 2^L - b_1} & \\[5pt]
> \hline \\[-4pt]
> a_3 - \beta_2 & \textcolor{olive}{(a_2 - \beta_1) + \beta_2 \cdot 2^L - b_2} & & \\[5pt]
> \hline \\[-4pt]
> \textcolor{olive}{(a_3 - \beta_2) + \beta_3 \cdot 2^L - b_3} & & & \\[5pt]
> \end{array}
> \end{aligned}
> $$
>
> where limb $i$ borrows $\beta_i$ bits from the next limb. To compute $s$, we must consider the maximum value of the borrow-chain $\beta_i$, which happens in the extreme case when $a_i = 0$ for all $i$.
> In other words, if we add maximum possible borrow bits to each limb, we can never underflow the subtraction operation. Thus, we compute the borrows as follows:
>
> $$
> \begin{aligned}
> \textcolor{olive}{\overset{0}{\cancel{a_0}} + \beta_0 \cdot 2^L - b_0} > 0
> \quad \implies \quad
> \textcolor{olive}{\beta_0} &= \left\lceil\frac{\textcolor{orange}{B_0}}{\const{2^L}}\right\rceil, \\
> \textcolor{olive}{(\overset{0}{\cancel{a_1}} - \beta_0) + \beta_1 \cdot 2^L - b_1} > 0
> \quad \implies \quad
> \textcolor{olive}{\beta_1} &= \left\lceil\frac{\textcolor{orange}{B_1} + \textcolor{olive}{\beta_0}}{\const{2^L}}\right\rceil, \\
> \textcolor{olive}{(\overset{0}{\cancel{a_2}} - \beta_1) + \beta_2 \cdot 2^L - b_2} > 0
> \quad \implies \quad
> \textcolor{olive}{\beta_2} &= \left\lceil\frac{\textcolor{orange}{B_2} + \textcolor{olive}{\beta_1}}{\const{2^L}}\right\rceil, \\
> \textcolor{olive}{(\overset{0}{\cancel{a_3}} - \beta_2) + \beta_3 \cdot 2^L - b_3} > 0
> \quad \implies \quad
> \textcolor{olive}{\beta_3} &= \left\lceil\frac{\textcolor{orange}{B_3} + \textcolor{olive}{\beta_2}}{\const{2^L}}\right\rceil,
> \end{aligned}
> $$
>
> where $\textcolor{orange}{B_i}$ are the maximum values of the limbs of $b$.
> Now we can compute the constant $S = \const{s \cdot p}$ such that the most-significant limb of $S$ is atleast $(\lceil\textsf{log}_2(\textcolor{olive}{\beta_3})\rceil + \const{L})$ bits long.
> This would ensure that we can always subtract $b$ from $(a + S)$ without underflows.
>
> .

Once we have computed the constant term $\const{s \cdot p}$, we must also ensure that none of the limb subtraction leads to limb-underflow. To do this, we modify the constant term $\const{s \cdot p}$ such that:

$$
\begin{aligned}
\begin{array}{c|c|c|c|c}
& \text{Limb 3} & \text{Limb 2} & \text{Limb 1} & \text{Limb 0} \\[2pt] \hline \\[-4pt]
S = \const{s \cdot p} & \const{S_3} & \const{S_2} & \const{S_1} & \const{S_0} \\[2pt] \hline \\[-4pt]
S' = \const{s \cdot p} & (\const{S_3} - \textcolor{olive}{\beta_3}) &
(\const{S_2} + \textcolor{olive}{\beta_3 \cdot 2^{L}} - \textcolor{olive}{\beta_2}) &
(\const{S_1} + \textcolor{olive}{\beta_2 \cdot 2^{L}} - \textcolor{olive}{\beta_1}) &
(\const{S_0} + \textcolor{olive}{\beta_1 \cdot 2^{L}} - \textcolor{olive}{\beta_0}) & \\[2pt] \hline
\end{array}
\end{aligned}
$$

Now we proceed to compute the subtraction of two bigfield elements $a' = (a + \const{S'})$ and $b$ using a custom bigfield subtraction function. The custom subtraction function works similar to the addition function described earlier, but instead of adding the limbs, we subtract them. It also uses 4 gates to compute the result of the subtraction.

#### Tracking Maximum Values due to Subtraction

Since we compute subtraction by adding the constant term $S' = \const{s \cdot p}$ to $a$, we need to track the maximum values of the limbs of the result. The maximum values of the limbs of the result $c = a + \const{s \cdot p} - b$ are given by:

$$
\begin{aligned}
\textcolor{orange}{C} = &\ \underbrace{(\textcolor{orange}{A_0} + \const{S'_0})}_{\textcolor{orange}{C_0}} + \underbrace{(\textcolor{orange}{A_1} + \const{S'_1})}_{\textcolor{orange}{C_1}} \cdot \const{2^L} + \underbrace{(\textcolor{orange}{A_2} + \const{S'_2})}_{\textcolor{orange}{C_2}} \cdot \const{2^{2L}} + \underbrace{(\textcolor{orange}{A_3} + \const{S'_3})}_{\textcolor{orange}{C_3}} \cdot \const{2^{3L}},
\end{aligned}
$$

where $\textcolor{orange}{A_i}$ are the maximum values of the limbs of $a$.

### Details on Bigfield Division

Let $a, b \in [0, 2^T)$ be two bigfield elements and we want compute modular division $\frac{a}{b} \textsf{ mod } p$. Let $c$ be the result of the division. We can compute $c$ as follows:

$$
c = \left( \frac{a}{b} \right) \textsf{ mod } p = a \cdot b^{-1} \textsf{ mod } p. \tag{D1}
$$

Computing inverses in a circuit is too expensive, instead we compute $c = (a \cdot b^{-1} \textsf{ mod } p)$ natively (outside the circuit) and then enforce the following condition in the circuit:

$$
b \cdot c = a \textsf{ mod } p.
$$

and checking this in the circuit is cheaper (equivalent to checking multiplication). To check the correctness of the multiplication of $b$ and $c$, as per the previous sections, we need to check the expression:

$$
\begin{aligned}
b \cdot c = q \cdot \const{p} + a,
\end{aligned}
$$

where quotient $q$ is computed by dividing the product $(b \cdot c)$ by the modulus $p$.
One important difference between checking this multiplication and the previously discussed modular multiplication is that the remainder $a$ in this case is an input and it may not necessarily be range-constrained to $[0, p)$ as we allow overflows. This could lead to underflows in the subtraction operation if $b \cdot c < a$. To handle this, we need to ensure that the subtraction does not lead to underflows. To do this, we introduce a constant term $\const{u \cdot p}$ such that:

$$
\begin{aligned}
b \cdot c + \const{u \cdot p} - a \geq 0,
\end{aligned}
$$

where $u$ is the smallest integer such that the above condition holds. This ensures that we do not have any underflows when we subtract $a$ from $(b \cdot c + \const{u \cdot p})$. We compute the modified quotient $q$ as follows:

$$
\begin{aligned}
q' &= \frac{b \cdot c + \const{u \cdot p} - a}{\const{p}}.
\end{aligned}
$$

Note that $q' \equiv q \textsf{ mod } p$. We can now rewrite the division condition as follows:

$$
\begin{aligned}
b \cdot c + \const{u \cdot p} &= q' \cdot \const{p} + a.
\end{aligned}
$$

From hereon, we can use the same approach as described in the previous sections to check the correctness of the multiplication operation.
Only additional constraint we need to add is that the denominator $b$ must not be zero.

> **Computing the multiple $u$:**
>
> To compute the multiple $u$, we want to ensure that the subtraction does not lead to underflows. We can compute $u$ as follows:
>
> $$
> \begin{aligned}
> b \cdot c + \const{u \cdot p} - a &\geq 0 \\
> \quad \implies \quad
> \const{u \cdot p} &\geq a - b \cdot c \\
> \quad \implies \quad
> \const{u} &= \left\lceil\frac{\textsf{max}(a)}{p}\right\rceil.
> \end{aligned}
> $$
>
> The value $\textsf{max}(a)$ indicates the maximum possible value of a bigfield that obeys the CRT modulus (as $a$ is the input to the division operation).
> Thus, $\textsf{max}(a) < \sqrt{2^T \cdot n}$.
> Using this value of $u$ ensures that we do not have any underflows when we subtract $a$ from $(b \cdot c + \const{u \cdot p})$.
>
> .
