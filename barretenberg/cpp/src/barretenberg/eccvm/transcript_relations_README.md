The following is a partial attempt to independently construct all of the transcript relations. Not clear if it is worth going forward with this.

# Transcript Relations

In the sections/subsections, we will refer to the columns by names corresponding to the tables that we described in witness generation. The purple names are those constrained to be boolean. To simplify the equations, we also define variables (which can be thought of as virtual columns); this "derived" columns will be written in blue.

The following are three columns which we will find occasion to use throughout the tables.
$\newcommand{\lagrangefirst}{\textcolor{purple}{\mathrm{lagrange\_first}}}$
$\newcommand{\lagrangesecond}{\textcolor{purple}{\mathrm{lagrange\_second}}}$
$\newcommand{\lagrangelast}{\textcolor{purple}{\mathrm{lagrange\_last}}}$

- $\lagrangefirst$
- $\lagrangesecond$
- $\lagrangelast$

## Columns

$\newcommand{\transcriptmsminfinity}{{\color{purple}\mathrm{transcript\_msm\_infinity}}}$
$\newcommand{\transcriptaccumulatornotempty}{{\color{purple}\mathrm{transcript\_accumulator\_not\_empty}}}$
$\newcommand{\transcriptadd}{{\color{purple}\mathrm{transcript\_add}}}$
$\newcommand{\transcriptmul}{{\color{purple}\mathrm{transcript\_mul}}}$
$\newcommand{\transcripteq}{{\color{purple}\mathrm{transcript\_eq}}}$
$\newcommand{\transcriptresetaccumulator}{{\color{purple}\mathrm{transcript\_reset\_accumulator}}}$
$\newcommand{\transcriptmsmtransition}{{\color{purple}\mathrm{transcript\_msm\_transition}}}$
$\newcommand{\transcriptpc}{{\mathrm{transcript\_pc}}}$
$\newcommand{\transcriptmsmcount}{{\mathrm{transcript\_msm\_count}}}$
$\newcommand{\transcriptmsmcountzeroattransition}{{\color{purple}\mathrm{transcript\_msm\_count\_zero\_at\_transition}}}$
$\newcommand{\transcriptpx}{{\mathrm{transcript\_Px}}}$
$\newcommand{\transcriptpy}{{\mathrm{transcript\_Py}}}$
$\newcommand{\transcriptbaseinfinity}{{\color{purple}\mathrm{transcript\_base\_infinity}}}$
$\newcommand{\transcriptzone}{{\mathrm{transcript\_z1}}}$
$\newcommand{\transcriptztwo}{{\mathrm{transcript\_z2}}}$
$\newcommand{\transcriptzonezero}{{\color{purple}\mathrm{transcript\_z1zero}}}$
$\newcommand{\transcriptztwozero}{{\color{purple}\mathrm{transcript\_z2zero}}}$
$\newcommand{\transcriptop}{{\mathrm{transcript\_op}}}$
$\newcommand{\transcriptaccumulatorx}{{\mathrm{transcript\_accumulator\_x}}}$
$\newcommand{\transcriptaccumulatory}{{\mathrm{transcript\_accumulator\_y}}}$
$\newcommand{\transcriptmsmx}{{\mathrm{transcript\_msm\_x}}}$
$\newcommand{\transcriptmsmy}{{\mathrm{transcript\_msm\_y}}}$
$\newcommand{\transcriptmsmintermediatex}{{\mathrm{transcript\_msm\_intermediate\_x}}}$
$\newcommand{\transcriptmsmintermediatey}{{\mathrm{transcript\_msm\_intermediate\_y}}}$
$\newcommand{\transcriptaddxequal}{{\color{purple}\mathrm{transcript\_add\_x\_equal}}}$
$\newcommand{\transcriptaddyequal}{{\color{purple}\mathrm{transcript\_add\_y\_equal}}}$
$\newcommand{\transcriptbasexinverse}{{\mathrm{transcript\_base\_x\_inverse}}}$
$\newcommand{\transcriptbaseyinverse}{{\mathrm{transcript\_base\_y\_inverse}}}$
$\newcommand{\transcriptaddlambda}{{\mathrm{transcript\_add\_lambda}}}$
$\newcommand{\transcriptmsmxinverse}{{\mathrm{transcript\_msm\_x\_inverse}}}$
$\newcommand{\transcriptmsmcountattransitioninverse}{{\mathrm{transcript\_msm\_count\_at\_transition\_inverse}}}$

$\newcommand{\transcriptnummulsinrow}{\mathrm{transcript\_num\_muls\_in\_row}}$
$\newcommand{\transcriptmsmtransitionsyntactic}{\mathrm{transcript\_msm\_transition\_syntactic}}$

For convenience, here are the column names (other than the `lagrange_first`, `lagrange_second`, and `lagrange_last`). Under each column, we link the relations that touch that column. $\textcolor{Orange}{\text{Warning:}}$ when we use a shift, we might need to call the last/first row functions.

- $\transcriptmsminfinity$
- $\transcriptaccumulatornotempty$
- $\transcriptadd$
  - [Op value correctly computed](#transcript-op-valid)
- $\transcriptmul$
  - [Op value correctly computed](#transcript-op-valid)
  - [Reset transcript count](#transcript-msm-count-reset)
  - [Decrement the pc correctly](#transcript-decrement-pc-correctly)
  - [Increment msm-count correctly](#transcript-msm-count-increment)
- $\transcripteq$
  - [Op value correctly computed](#transcript-op-valid)
- $\transcriptresetaccumulator$
  - [Op value correctly computed](#transcript-op-valid)
- $\transcriptmsmtransition$
  - [Syntactic transition computed](#transcript-msm-transition-syntactic)
- $\transcriptpc$
  - [Decrement the pc correctly](#transcript-decrement-pc-correctly)
  - [Check last pc](#transcript-last-pc)
- $\transcriptmsmcount$
  - [Increment msm-count correctly](#transcript-msm-count-increment)
  - [Reset transcript count](#transcript-msm-count-reset)
- $\transcriptmsmcountzeroattransition$
  - [Computed `transcript_msm_count_at_transition` correctly](#transcript-msm-count-zero-at-transition)
- $\transcriptpx$
- $\transcriptpy$
- $\transcriptbaseinfinity$
  - [Decrement the pc correctly](#transcript-decrement-pc-correctly)
  - [Increment msm-count correctly](#transcript-msm-count-increment)
- $\transcriptzone$
  - [check (weak) compatibility of `z1zero` and `z1`](#transcript-z1zero-z1)
- $\transcriptztwo$
  - [check (weak) compatibility of `z2zero` and `z2`](#transcript-z2zero-z2)
- $\transcriptzonezero$
  - [check (weak) compatibility of `z1zero` and `z1`](#transcript-z1zero-z1)
  - [Decrement the pc correctly](#transcript-decrement-pc-correctly)
  - [Increment msm-count correctly](#transcript-msm-count-increment)
- $\transcriptztwozero$
  - [check (weak) compatibility of `z2zero` and `z2`](#transcript-z2zero-z2)
  - [Decrement the pc correctly](#transcript-decrement-pc-correctly)
  - [Increment msm-count correctly](#transcript-msm-count-increment)
- $\transcriptop$
  - [Op value correctly computed](#transcript-op-valid)
- $\transcriptaccumulatorx$
- $\transcriptaccumulatory$
- $\transcriptmsmx$
- $\transcriptmsmy$
- $\transcriptmsmintermediatex$
- $\transcriptmsmintermediatey$
- $\transcriptaddxequal$
- $\transcriptaddyequal$
- $\transcriptbasexinverse$
- $\transcriptbaseyinverse$
- $\transcriptaddlambda$
- $\transcriptmsmxinverse$
- $\transcriptmsmcountattransitioninverse$

For psychological convenience, we add several "derived variables". This are to simplify our final relations.

- $\transcriptnummulsinrow$ (how many non-trivial muls are there in a row)
- $\transcriptmsmtransitionsyntactic$ (are we syntactically at a transition?)

## Relations governing the "well-formedness" of the transitions/counters/accumulators

### Number of muls in a row

We create a variable to track how many multiplications are present in a given row. Please note that this does not specify that `q_mul` is on. In particular.

$$\transcriptnummulsinrow := (2 - \transcriptzonezero - \transcriptztwozero)\times (1-\transcriptbaseinfinity)$$

Degree: 2.

### Transcript Row Zero

On the first row, we need certain columns to be fixed. (For shiftable columns, the values on the first row are defacto fixed to be $0$.)

- $\transcriptaccumulatornotempty = 0$
- $\transcriptmsmcount = 0$

### Transcript Decrement PC correctly

Make sure that the program counter has been decremented by the number of 128-bit scalar multiplications we did. Note that if my point is $\NeutralElt$, I don't do any multiplications. (This only applies _after_ the 0th row.) Note that this relation is _turned off_ on the first row.

$$
(\transcriptpc - \textbf{shift}(\transcriptpc) - \transcriptnummulsinrow\times \transcriptmul)\times (1-\lagrangefirst)
$$

Degree: 4.

### Transcript Last PC

Our PC is decrementing and the last entry is 0.

$$\lagrangelast\times \transcriptpc$$

Degree: 2.

### Transcript MSM transition syntactic

`transcript_msm_transition_syntactic` is 1 iff our current instruction is a `mul` and our next is not a `mul`. This differs from `transcript_msm_transition` inthat the latter demands that the total mul count is non-zero. (Note that this is the variable `transcript_msm_transition_check` in the code.)

We first compute a syntactic variable.

$$\transcriptmsmtransitionsyntactic := \transcriptmul \times (1 - \textbf{shift}(\transcriptmul))$$
Degree: 2.

### Transcript MSM transition

If `transcript_msm_transition_syntactic == 1`, then we are potentially at a transition. To verify we are at a transition, we need to make sure that `transcript_msm_count!=0`. The below is a trick to make sure this holds: multiply by the claimed inverse.

$$\transcriptmsmtransition = \transcriptmsmtransitionsyntactic\times \transcriptmsmcount\times \transcriptmsmcountattransitioninverse$$

Degree: 4

### Transcript MSM count zero at transition

Check that `transcript_msm_count_zero_at_transition` is correctly formed. (Recall, this checks if we are _syntactically_ at the end of an MSM and there have been no non-trivial scalar multiplications in this MSM block: this means that for each row, either the scalars vanished or the point was $\NeutralElt$.)

$$\transcriptmsmcountzeroattransition = \transcriptmsmtransitionsyntactic\times (1 - \transcriptmsmcount\times \transcriptmsmcountattransitioninverse) $$
Degree: 3

### Transcript MSM count increment

If our current instruction and our next are both `mul`s (i.e., we are in an MSM and we are _continuing_ the MSM), then we want that the next `transcript_msm_count` to increment correctly: by the number of multiplications in the row.

$$\textbf{shift}(\transcriptmsmcount) - \transcriptmsmcount = \transcriptnummulsinrow\times \transcriptmul \times \textbf{shift}(\transcriptmul)$$

Degree: 4

### Transcript MSM count reset

If `transcript_msm_transition_syntactic==1` (i.e., if we are at a `mul` and the next op is not a `mul`), then `transcript_msm_count_shift` should be 0 (i.e., we've reset the `msm_count` at the next step).

$$\transcriptmsmtransitionsyntactic \times \textbf{shift}(\transcriptmsmcount)$$

Degree: 3

NOTE: we could replace this a the degree 5 constraint $\transcriptmsmtransition \times \textbf{shift}(\transcriptmsmcount)$.

## Relations governing correct syntactic evaluations

### Transcript z1zero z1

If `z1zero == 1`, then `z1 == 0`. (In particular, `z1zero` may be understood to be a hint!)

$$ \transcriptzonezero \times \transcriptzone == 0$$

### Transcript z2zero z2

If `z2zero == 1`, then `z2 == 0`.

$$\transcriptztwozero \times \transcriptztwo == 0$$

### Transcript Op Valid

Check that the op value satisfies the correct formula:
$$\transcriptop = \transcriptresetaccumulator + 2 \transcripteq + 4\transcriptadd + 8 \transcriptmul$$

### OpCode Exclusion

The only pair of bits that can be turned on in the code code are `eq` and `reset`; all others should be 0. Using that each of the selectors is boolean, we can represent this constraint as follows.

$$
\begin{align*}&\transcriptmul(\transcriptadd + \transcripteq + \transcriptresetaccumulator) \\
+&\transcriptadd(\transcriptmul + \transcripteq + \transcriptresetaccumulator)&
\end{align*}
$$

## EC operations

### Transcript eq

If we have an `eq` opcode, then we must check that $A=P$. The naive way to do this would be to check the following two equations:

$$
\begin{align*}
\transcriptpx=\transcriptaccumulatorx\\
\transcriptpy=\transcriptaccumulatory
\end{align*}
$$

each of which has _degree 1_.

However, this would not be correct if either $P$ or $A$ were $\NeutralElt$. Indeed, when filling out our table, we make _no guarantees_ about the value of $\transcriptpx$ and $\transcriptpy$ when $\transcriptbaseinfinity = 1$ (and analogously for $\transcriptaccumulatorx$, $\transcriptaccumulatory$ when $\transcriptaccumulatornotempty = 0$). This is to have uniform logic. $\textcolor{red}{\text{TODO:}}$ explain why.

Instead, we consider the following constraint. First, if one point is $\NeutralElt$ and the other is not, fail. If both points are $\NeutralElt$, succeed. Finally, if neither is, check the above equations.

Here is how we do this.

<!-- $\newcommand{\transcriptaddxequal}{{\color{purple}\mathrm{transcript\_add\_x\_equal}}}$
$\newcommand{\transcriptaddyxequal}{{\color{purple}\mathrm{transcript\_add\_y\_equal}}}$ -->

$\newcommand{\transcriptbothinfinity}{{\color{purple}\mathrm{transcript\_both\_infinity}}}$
$\newcommand{\transcriptbothnotinfinity}{{\color{purple}\mathrm{transcript\_both\_not\_infinity}}}$
$\newcommand{\transcriptinfinityexclusioncheck}{{\color{purple}\mathrm{transcript\_infinity\_exclusion\_check}}}$
$\newcommand{\transcripteqxdiff}{{\mathrm{transcript\_eq\_x\_diff}}}$
$\newcommand{\transcripteqydiff}{{\mathrm{transcript\_eq\_y\_diff}}}$

- instantiate (quadratic) variables testing whether or not both points are of the same type:
  - $\transcriptbothinfinity \colon= \transcriptbaseinfinity \times (1 - \transcriptaccumulatornotempty)$;
  - $\transcriptbothnotinfinity \colon= (1-\transcriptbaseinfinity)\times \transcriptaccumulatornotempty$; and
  - $\transcriptinfinityexclusioncheck\colon = \transcriptbaseinfinity + (1 - \transcriptaccumulatornotempty) - 2\transcriptbothinfinity$. (This last variable checks if they are of different types.)

Key observation: for any situation, exactly one of these variables is $1$.

- instantiate linear variables computing the differences of the coordinates:
  - $\transcripteqxdiff\colon= \transcriptpx - \transcriptaccumulatorx$
  - $\transcripteqydiff\colon = \transcriptpy - \transcriptaccumulatory$

And then build logic that branches based on each of the options:

$$
    \begin{align*}
    & \transcripteq(\transcripteqxdiff\times \transcriptbothnotinfinity + \transcriptinfinityexclusioncheck)\\
    &\transcripteq(\transcripteqydiff\times \transcriptbothnotinfinity + \transcriptinfinityexclusioncheck)
    \end{align*}
$$

Degree: 4

### Transcript MSM intermediate well formed

If we are not at the end of an MSM, `transcript_msm_intermediate_x` and `transcript_msm_intermediate_y` are both 0. $\textcolor{red}{\text{TODO}}$ Else, they are the output of the MSM, which means `(transcript_msm_intermediate_x, transcript_msm_intermediate_y) = OFFSET + (msm_intermediate_x, msm_intermediate_y)`.

Here, we only concern ourselves with the former.

$$
\begin{align*}(1-\transcriptmsmtransition)\times\transcriptmsmintermediatex&\\
(1-\transcriptmsmtransition)\times\transcriptmsmintermediatey&
\end{align*}
$$

## Multiset Equality Checks

As explained, the multiset equality checks allow us to check compatibility between the different tables.
