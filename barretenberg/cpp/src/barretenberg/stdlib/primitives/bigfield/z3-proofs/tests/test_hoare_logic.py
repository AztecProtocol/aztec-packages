from dataclasses import dataclass
from typing import List, Tuple

import z3

from field_emulation_proofs.hoare_logic import HoareTriple, WitnessBase
from field_emulation_proofs.solver_context import SolverContext
from tests.utils import solver_ctx, solver_factory  # isort: ignore


@dataclass
class SimpleWitness(WitnessBase):
    """Witness containing integers x and y."""

    x: z3.ArithRef
    y: z3.ArithRef

    @classmethod
    def fresh(cls, ctx: SolverContext) -> "SimpleWitness":
        x = ctx.fresh_int("x")
        y = ctx.fresh_int("y")
        return cls(ctx=ctx, x=x, y=y)


class IncrementTriple(HoareTriple[SimpleWitness], witness_cls=SimpleWitness):
    """Simple Hoare triple encoding y = x + 1."""

    def __init__(
        self, witness: SimpleWitness, offset: int, use_tactics: bool = True
    ) -> None:
        super().__init__(witness)
        self.offset = offset
        self.use_tactics = use_tactics

    # The base class only defines _apply_tactics, so we override it here and
    # delegate to a private helper that can skip the default tactics.
    def _apply_tactics(
        self, facts: List[z3.BoolRef], goal: z3.BoolRef
    ) -> Tuple[bool, List[List[z3.BoolRef]]]:
        if not self.use_tactics:
            return False, [[goal]]
        return super()._apply_tactics(facts, goal)

    def evaluate(self) -> List[z3.BoolRef]:
        w = self.witness
        return [w.y == w.x + 1]

    def _precondition(self) -> List[z3.BoolRef]:
        return [self.witness.x >= 0]

    def postcondition(self) -> List[z3.BoolRef]:
        w = self.witness
        return [w.y > w.x + self.offset]


def test_invalid_triple_counterexample_with_tactics(solver_ctx) -> None:
    witness = SimpleWitness.fresh(solver_ctx)
    triple = IncrementTriple(witness, offset=1, use_tactics=True)
    assert triple.prove_validity(solver_factory) is not None


def test_invalid_triple_counterexample_without_tactics(solver_ctx) -> None:
    witness = SimpleWitness.fresh(solver_ctx)
    triple = IncrementTriple(witness, offset=1, use_tactics=False)
    assert triple.prove_validity(solver_factory) is not None


def test_valid_triple_proven_with_tactics(solver_ctx) -> None:
    witness = SimpleWitness.fresh(solver_ctx)
    triple = IncrementTriple(witness, offset=0, use_tactics=True)
    assert triple.prove_validity(solver_factory) is None


def test_valid_triple_proven_without_tactics(solver_ctx) -> None:
    witness = SimpleWitness.fresh(solver_ctx)
    triple = IncrementTriple(witness, offset=0, use_tactics=False)
    assert triple.prove_validity(solver_factory) is None
