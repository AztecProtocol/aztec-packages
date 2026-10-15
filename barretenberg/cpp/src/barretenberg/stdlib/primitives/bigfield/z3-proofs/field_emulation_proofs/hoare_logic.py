from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Callable, Dict, Generic, List, Optional, Tuple, TypeVar

import z3
from z3 import And, BoolRef, CheckSatResult, Implies, Model, Not, Solver

from field_emulation_proofs.solver_context import SolverContext


@dataclass
class WitnessBase(ABC):
    ctx: SolverContext

    @classmethod
    @abstractmethod
    def fresh(cls, ctx: SolverContext) -> "WitnessBase":
        """Return a freshly initialized symbolic witness with no constraints on it"""

    def invariants(self) -> List[BoolRef]:
        """Return invariants that must always hold on the witness."""
        return []


@dataclass
class CounterExample:
    result: CheckSatResult
    model: Optional[Model]
    property_name: str


WitnessType = TypeVar("WitnessType", bound="WitnessBase")


class HoareTriple(Generic[WitnessType], ABC):
    """Simple representation of a Hoare triple."""

    _witness_cls: type[WitnessType]
    witness: WitnessType

    def __init__(self, witness: WitnessType):
        self.witness = witness

    def __init_subclass__(
        cls, *, witness_cls: type[WitnessType], **kwargs: Dict[str, Any]
    ):
        super().__init_subclass__(**kwargs)
        cls._witness_cls = witness_cls

    def ctx(self) -> SolverContext:
        """Get the Z3 context used by the current witness"""
        return self.witness.ctx

    def _default_tactics(self) -> z3.Tactic:
        z3_ctx = self.ctx().z3_ctx
        tactic = z3.Then(
            z3.With("simplify", rewrite_patterns=True, ctx=z3_ctx),
            "simplify",
            "propagate-values",
            "propagate-ineqs",
            "simplify",
            ctx=z3_ctx,
        )
        return tactic

    def _apply_tactics(
        self, facts: List[BoolRef], to_prove_unsat: BoolRef
    ) -> Tuple[bool, List[List[BoolRef]]]:
        """Returns simplified formula

        Args:
            to_prove (BoolRef): The property to find unsat
            facts (List[BoolRef]): Known facts

        Returns:
            Tuple[bool, List[List[BoolRef]]]: A pair, (tactics applied?, list[goals])
                The semantics here are, if tactics applied? is *False*, then the returned
                goals are just [[to_prove]].

                Otherwise, if for each goal in goals, the conjunction of the bool-refs
                in the goal is satisfiable then the original value to_prove was unsatisfiable.
                If any goal is SAT, nothing can be said about the original value
        """
        tactic = self._default_tactics()
        goal = z3.Goal(ctx=self.ctx().z3_ctx)
        for fact in facts:
            goal.add(fact)
        goal.add(to_prove_unsat)

        # Apply the tactic
        subgoals = tactic(goal)
        return True, subgoals

    @abstractmethod
    def evaluate(self) -> List[BoolRef]:
        """Evaluate constraints encoding the implementation of this function, i.e.
        constraints modeling C in the triple {P} C {Q}
        """

    def _precondition(self) -> List[BoolRef]:
        """Preconditions to require on the args in *addition* to the
        automatically-added invariants from the WitnessType
        """
        return []

    def precondition(self) -> List[BoolRef]:
        """Evaluate the precondition of this Hoare triple {P} C {Q}, i.e. P"""
        witness_invariants = self.witness.invariants()
        other_preconditions = self._precondition()
        return witness_invariants + other_preconditions

    @abstractmethod
    def postcondition(self) -> List[BoolRef]:
        """Evaluate the postcondition of this Hoare triple {P} C {Q}, i.e. Q"""

    def lemmas(self) -> List[BoolRef]:
        """Return any lemmas useful for proving the desired postcondition"""
        return []

    def _try_to_prove_valid(
        self,
        solver_factory: Callable[[SolverContext], Solver],
        facts: List[BoolRef],
        to_prove: BoolRef,
        property_name: str,
        apply_tactics: bool = True,
    ) -> Optional[CounterExample]:
        """Try to prove the property is valid

        Args:
            solver_factory (Callable[[SolverContext], Solver]): solver generator
            facts (List[BoolRef]): List of properties already proven valid
            to_prove (BoolRef): property to prove
            property_name (str): name of the property
            apply_tactics (bool): Whether to apply tactics

        Returns:
            Optional[CounterExample]: The counterexample if one is found, or *None* if the
                property is proven valid
        """
        # Prove the lemma with a fresh solver
        if apply_tactics:
            tactics_applied, goals = self._apply_tactics(facts, Not(to_prove))
        else:
            tactics_applied = False
            goals = [[Not(to_prove)]]

        for goal in goals:
            solver: Solver = solver_factory(self.ctx())

            for fact in facts:
                solver.add(fact)

            for subgoal in goal:
                solver.add(subgoal)

            result = solver.check()
            if result != z3.unsat:
                model = None
                if result == z3.sat:
                    # If tactics were applied, we can only make conclusions if all the
                    # goals were UNSAT, if any goal was SAT no conclusion can be had
                    if tactics_applied:
                        return self._try_to_prove_valid(
                            solver_factory,
                            facts,
                            to_prove,
                            property_name,
                            apply_tactics=False,
                        )
                    model = solver.model()
                return CounterExample(
                    result=result, model=model, property_name=property_name
                )

        return None

    def prove_lemmas(
        self, solver_factory: Callable[[SolverContext], Solver]
    ) -> Optional[CounterExample]:
        """Prove that all the lemmas are valid

        Returns *None* if all are proven successfully.
        Otherwise, returns a counterexample for the first Lemma which failed to prove
        """
        antecedent = self.validity_expr_antecedent()
        facts = [antecedent]
        for i, lemma in enumerate(self.lemmas()):
            # Prove the lemma with a fresh solver
            to_prove = lemma
            property_name = f"lemma_{i}"
            maybe_cex = self._try_to_prove_valid(
                solver_factory,
                facts=facts,
                to_prove=to_prove,
                property_name=property_name,
            )
            if maybe_cex is None:
                # Strengthen the antecedent now that we know the lemma is true
                facts.append(lemma)
            else:
                return maybe_cex
        return None

    def get_consequence(self) -> BoolRef:
        """Get the consequence of evaluating this function, *assuming the Hoare Triple is valid*!"""
        precondition = self.precondition()
        postcondition = self.postcondition()
        return Implies(And(*precondition), And(*postcondition))

    def validity_expr_antecedent(self) -> BoolRef:
        """Return an expression giving the antecedent for the validity expr

        This is useful for ensuring the check is not vacuously true
        """
        precondition = self.precondition()
        implementation = self.evaluate()
        antecedent = And(*precondition, *implementation)
        return antecedent

    def validity_expr(self) -> BoolRef:
        """Return an expression asserting this triple is valid,"""
        antecedent = self.validity_expr_antecedent()
        postcondition = And(self.postcondition())
        return Implies(antecedent, postcondition)

    def prove_validity(
        self,
        solver_factory: Callable[[SolverContext], Solver],
        prove_lemmas: bool = True,
    ) -> Optional[CounterExample]:
        """Prove the Hoare triple is valid

        Args:
            solver_factory (Callable[[SolverContext], Solver]): the generator for solvers
            prove_lemmas (bool, optional): Whether to prove the lemmas. Defaults to True.
                If False, the Lemmas are *assumed* to be true

        Returns:
            Optional[CounterExample]: A counterexample if proving failed, otherwise None
        """
        if prove_lemmas:
            self.prove_lemmas(solver_factory=solver_factory)
        facts = [self.validity_expr_antecedent()] + self.lemmas()
        postcondition = z3.And(self.postcondition())
        property_name = "validity_expr"
        maybe_cex = self._try_to_prove_valid(
            solver_factory,
            facts=facts,
            to_prove=postcondition,
            property_name=property_name,
        )
        return maybe_cex
