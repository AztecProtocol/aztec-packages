# Glossary

# Notation

It's not totally clear what is reasonable to put in here. This file will probably drift for a while, but in the end it will be useful to have a single source for common, standing notations.

\f$\bF\f$: the generic notation for the scalar field 

\f$\bF_r\f$: the scalar field of the curve BN254, which is simultaneously the ground field of the curve Grumpkin. 

\f$\bF_p\f$: the scalar field of the curve Grumpkin, which is simultaneously the ground field of the curve BN254. 

\f$n\f$: Though it is bad practice to reserve a single letter for a fixed quantity in a software library, for historical reasons and agreement with our foundational papers \cite Plonk and \cite Honk, we often use \f$n\f$ for the size of a circuit or related quantities that describe prover complexity. These related quantities can include: the size of a circuit; the size of the execution trace, which may contain various auxiliary rows (convenience gates; gates containing sorted witness data for lookup table, generalized range constraints, ROM and RAM; padding to powers of 2); the degree of a polynomial (univariate in Plonk, multivariate in Honk), which is equal to a padded execution trace size; etc. We aim to be more specific, but unadorned \f$n\f$'s are sure to linger for the foreseable future. 

\f$H\f$: the domain on which prover polynomials are specified via Lagrange interpolation.
    - In Plonk: \f$H \subset \bF\f$ is the \f$\numgates\f$-th roots of unity, and \f$\omega\f$ is a fixed generator of \f$H\f$.
    - In Honk: \f$H\f$ is the Boolean hypercube \f$\{0,1\}^{\log(\numgates)} \subset \bF^{\log(\numgates)}\f$, a set of size \f$\numgates \f$.

\f$\omega\f$ (omega; a root of unity): In Plonk, a fixed generator of \f$H\f$.

# Terms

scalar field: given an elliptic curve \f$ E \f$ whose number of points (i.e., whose "order") is a prime number \f$p\f$, there is a unique field \f$\bF_p\f$ having order \f$p\f$. This is referred to as the "scalar field" of \f$E\f$, due to the fact that its elements act through scalar multiplication on the elements of \f$E\f$. 

ground field (sometimes referred to as target or base field): every elliptic curve \f$ E \f$ we consider is described the set of points whose coordinate satisfy a Weierstrass equation \f$Y^2 = X^3 + AX + B\f$ in some set \f$ \bF_\q \times \bF_\q \f$, where \f$\bF_\q\f$ is a finite field called the "ground field" of \f$E\f$.
