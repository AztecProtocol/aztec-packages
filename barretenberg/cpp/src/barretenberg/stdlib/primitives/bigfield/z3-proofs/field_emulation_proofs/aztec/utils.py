"""Common utilities for defining constraints"""

from __future__ import annotations

from typing import Iterable, Protocol, Tuple, TypeVar

from z3 import ArithRef, If

from field_emulation_proofs.aztec import bigfield
from field_emulation_proofs.aztec.native_field import NativeFieldElement
from field_emulation_proofs.interval import ClosedInterval
from field_emulation_proofs.solver_context import SolverContext

# This together with SupportsAddMul allows us to require that
# any type used as a TupleEntryType (see below) can add/multiply with itself
T = TypeVar("T", bound="SupportsAddMul")


class SupportsAddMul(Protocol[T]):
    def __add__(self, other: "T") -> "T":
        pass

    def __mul__(self, other: "T") -> "T":
        pass


TupleEntryType = TypeVar("TupleEntryType", bound="SupportsAddMul")
FourTuple = Tuple[TupleEntryType, TupleEntryType, TupleEntryType, TupleEntryType]
NativeFourTuple = FourTuple[NativeFieldElement]


def fresh_four_tuple(base_name: str, ctx: SolverContext) -> NativeFourTuple:
    """Create a four-tuple with fresh, unconstrained components"""
    return to_four_tuple(
        [NativeFieldElement.fresh(f"{base_name}_{i}", ctx=ctx) for i in range(4)]
    )


def to_four_tuple(values: Iterable[TupleEntryType]) -> FourTuple[TupleEntryType]:
    """Given an iterable, assert it has exactly four elements
    and return as a FourTuple
    """
    value_tuple = tuple(list(values))
    assert len(value_tuple) == 4, value_tuple
    return value_tuple[0], value_tuple[1], value_tuple[2], value_tuple[3]


def multiply_mod_two_to_T(
    a: FourTuple[TupleEntryType], b: FourTuple[TupleEntryType]
) -> Tuple[TupleEntryType, TupleEntryType]:
    """Perform schoolbook-multiplication on the two tuples, dropping any terms
    which are multiples of 2**(4*L)

    The result is returned in two limbs, (lo, hi), where lo has terms weighted by 1 and 2**L,
    and hi*2**L corresponds to the terms weighted by 2**(2*L) and 2**(3*L)
    """
    L = bigfield.L
    lo = a[0] * b[0] + (a[0] * b[1] + a[1] * b[0]) * 2**L
    hi = (
        a[2] * b[0]
        + a[1] * b[1]
        + a[0] * b[2]
        + (a[3] * b[0] + a[2] * b[1] + a[1] * b[2] + a[0] * b[3]) * 2**L
    )
    return (lo, hi)


class NativeClosedInterval(ClosedInterval):
    """A closed interval over Aztec's native field, i.e.
    [l, u]
    or
    [0, u] \\cup [l, n-1]
    """

    def __init__(self, lower: int, upper: int):
        super().__init__(modulus=bigfield.n, lower=lower, upper=upper)


def signed_field_to_int(x: ArithRef):
    """
    [0, n/2) -> [0, n/2)
    [n/2, n) -> -[n/2, 0)
    """
    half_n = (bigfield.n - 1) // 2
    return If(x <= half_n, x, x - bigfield.n)
