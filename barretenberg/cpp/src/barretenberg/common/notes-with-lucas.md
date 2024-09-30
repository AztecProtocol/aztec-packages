wl * wr - woh



(L0wl0+L1wl1) * (L0wr0+L1wr1) - (L0wo0+L1wo1)(L0h0+L1h1)
==? L0^2*(wl * wr - woh)

(L0wl0) * (L0wr0) - (L0wo0)(L0h0+L1h1)

1-x x
(1 0 -1)*((1 0 -1)(a b c) + (0 1 2) (e f g))


--------------------------------------------------------


Rel(f,g,p) = fg - p  this is a polynomial relation that we impose on polynomials
Eg in combiner f, g, and h will be univariates of degree 1 which are compose from acc and incoming dpk

f could be the univariate of deg 1 interpolating the values of q_m at row idx in acc + dpk

:warning: Degree of Rel is just specified by us in SUBRELATION_PARTIAL_LENGTHS

Rel(f,g,p) is a degree-2 polynomial. So three distinct evaluatiosn are required to specify this poly.
Potential error: do this arith on f,g,p without fist extending to three evaluatiosn

f = (0,1), g = (1,0) h = (1,2)
I could compute Rel((0,1), (1,0), (1,2)) = -(1,2)
f = (0,1,2), g = (1,0,-1) h = (1,2,3) = (0,0,-2) - (1,2,3) = (-1,-2,-5)
^^^^^^^^^^^^^^^^^^^^^ this will happen if we set SUBRELATION_LENGTH TO 2!!!
Exercise / important security feature: make a test of our relations to be sure that the degrees are set correctly.
Key engine: compare evaluation with restrict-compute-extend.


------
fixing a row (indexed by i in the Pg paper; here i is my subrel index)
FullRel(X) = \sum_i:0..39 f_i(X) * alpha_i
Before: homogenize each f_i to degree deg(f_i) , cache 40 values, FullRel'(X, h) such that  FullRel'(X, 1) = FullRel(X)
        FullRel'(X, h) = \sum_i:0..39 f'_i(X, h) (cache each f'_i) (alphas get absorbed in the ')
After:  homogenize each f_i to degree 7 or 11 , cache 2 values, FullRel''(X, h) such that  FullRel''(X, 1) = FullRel(X)
        FullRel''(X, h) = f''_0(X, h) *  f''_1(X, h) (cache each f''_i) deg f_0 = 7; degree f_1 = 11
For each X (i.e. over each row) compute the two f'' values and cache.

