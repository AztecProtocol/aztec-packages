from dataclasses import dataclass

from z3 import And, ArithRef, BoolRef, Or


@dataclass
class ClosedInterval:
    """
    A closed interval [a, b] over a field

    Allows use of negative numbers, so e.g. [-2, 3] would actually be
    [0, 3] \\cup [n-2, n-1]
    """

    modulus: int
    """Field modulus"""
    lower: int
    """Lower bound, must be in range (-n, n) and less than or equal to upper"""
    upper: int
    """Upper bound, must be in range (-n, n) and greater than or equal to lower"""

    def __post_init__(self):
        assert -self.modulus < self.lower
        assert self.lower <= self.upper
        assert self.upper < self.modulus

    def includes(self, x: ArithRef) -> BoolRef:
        """Convert to constraints enforce tht the field element
        corresponding to x is in the interval

        These also require x to be the canonical representative in [0, n)
        """
        if self.upper >= 0:
            upper_bound = self.upper
        else:
            upper_bound = self.modulus + self.upper

        if self.lower >= 0:
            lower_bound = self.lower
        else:
            lower_bound = self.modulus + self.lower

        if lower_bound <= upper_bound:
            return And(lower_bound <= x, x <= upper_bound)
        else:
            return Or(
                And([0 <= x, x <= upper_bound]),
                And([lower_bound <= x, x < self.modulus]),
            )
