"""Formal properties of the Aztec bigfield."""

from z3 import And, BoolRef, Implies

from .bigfield import Bigfield


def bigfield_invariants_imply_bigfield_properties(a: Bigfield) -> BoolRef:
    """Return the statement that ``a``'s invariants imply a valid representation."""
    return Implies(And(*a.invariants()), And(*a.properties_implied_by_invariants()))
