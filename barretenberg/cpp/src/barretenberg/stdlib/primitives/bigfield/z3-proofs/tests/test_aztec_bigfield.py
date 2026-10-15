from typing import Dict, List, Optional

import z3

from field_emulation_proofs.aztec import bigfield
from field_emulation_proofs.aztec.bigfield import Bigfield
from field_emulation_proofs.aztec.bigfield_methods.unsafe_evaluate_multiply_add import (
    UnsafeEvaluateMultiplyAdd,
    UnsafeEvaluateMultiplyAddWitness,
)
from field_emulation_proofs.aztec.properties import (
    bigfield_invariants_imply_bigfield_properties,
)
from field_emulation_proofs.aztec.ultra_circuit_builder.create_big_add_gate import (
    CreateBigAddGate,
    CreateBigAddGateWitness,
)
from field_emulation_proofs.aztec.ultra_circuit_builder.create_big_mul_gate import (
    CreateBigMulGate,
    CreateBigMulGateWitness,
)
from field_emulation_proofs.aztec.ultra_circuit_builder.evaluate_non_native_field_multiplication import (
    EvaluateNonNativeFieldMultiplication,
    NonNativeMultiplicationWitnesses,
)
from field_emulation_proofs.aztec.utils import NativeFourTuple, signed_field_to_int
from field_emulation_proofs.hoare_logic import CounterExample
from field_emulation_proofs.solver_context import SolverContext

from tests.utils import solver_factory, solver_ctx  # isort: skip

ONE_SECOND_IN_MS = 1_000
ONE_MINUTE_IN_MS = 60 * ONE_SECOND_IN_MS
DEFAULT_TIMEOUT_MS = 10 * ONE_MINUTE_IN_MS


def _solver_factory(
    ctx: SolverContext, timeout_ms: int = DEFAULT_TIMEOUT_MS
) -> z3.Solver:
    """Return a solver for use with deterministic settings."""
    return solver_factory(ctx, timeout_ms=timeout_ms)


def _debug_model(model: z3.Model, debug_exprs: Dict[str, List[z3.ExprRef]]):
    print("Model:")
    print(model)
    if debug_exprs is not None and len(debug_exprs) > 0:
        print("Debug Exprs:")
        for name, exprs in debug_exprs.items():
            print(name, [model.eval(expr) for expr in exprs])  # type: ignore


def _check_for_cex(
    maybe_cex: Optional[CounterExample], debug_exprs: Dict[str, List[z3.ExprRef]]
):
    if maybe_cex is not None:
        if maybe_cex.model is not None:
            _debug_model(model=maybe_cex.model, debug_exprs=debug_exprs)
    assert maybe_cex is None, f"{maybe_cex.property_name} Failed!"


def _solve(
    ctx: SolverContext,
    property: z3.BoolRef,
    expected_result: z3.CheckSatResult,
    timeout_ms: int,
    debug_exprs: Optional[Dict[str, List[z3.ExprRef]]],
):
    s = _solver_factory(ctx, timeout_ms=timeout_ms)

    s.add(property)
    result = s.check()

    if expected_result != result and result == z3.sat and debug_exprs is not None:
        model = s.model()
        _debug_model(model, debug_exprs=debug_exprs)

    assert result == expected_result


def _assert_valid(
    ctx: SolverContext,
    property: List[z3.BoolRef] | z3.BoolRef,
    timeout_ms=DEFAULT_TIMEOUT_MS,
    debug_exprs: Optional[Dict[str, List[z3.ExprRef]]] = None,
):
    _solve(ctx, z3.Not(z3.And(property)), z3.unsat, timeout_ms, debug_exprs)


def _assert_sat(
    ctx: SolverContext,
    property: List[z3.BoolRef] | z3.BoolRef,
    timeout_ms=DEFAULT_TIMEOUT_MS,
    debug_exprs: Optional[Dict[str, List[z3.ExprRef]]] = None,
):
    _solve(ctx, z3.And(property), z3.sat, timeout_ms, debug_exprs)


def test_invariants_imply_representation_is_valid(solver_ctx):
    a = Bigfield.fresh("a", solver_ctx)
    _assert_valid(solver_ctx, bigfield_invariants_imply_bigfield_properties(a))


def test_create_big_add_gate_constraints_valid_postcondition(solver_ctx):
    witness = CreateBigAddGateWitness.fresh(solver_ctx)
    triple = CreateBigAddGate(witness)
    result = triple.prove_validity(solver_factory=_solver_factory)
    _check_for_cex(result, debug_exprs={})


def test_create_big_mul_gate_constraints_valid_postcondition(solver_ctx):
    fresh_witness = CreateBigMulGateWitness.fresh(solver_ctx)
    triple = CreateBigMulGate(fresh_witness)
    result = triple.prove_lemmas(solver_factory=_solver_factory)
    result = triple.prove_validity(solver_factory=_solver_factory, prove_lemmas=False)
    _check_for_cex(result, debug_exprs={})


def test_evaluate_non_native_field_multiplication_valid_postcondition(solver_ctx):
    witness = NonNativeMultiplicationWitnesses.fresh(solver_ctx)
    triple = EvaluateNonNativeFieldMultiplication(witness)

    # Some useful debug exprs
    def _limb_sum(four_tuple: NativeFourTuple) -> z3.ArithRef:
        return sum(
            [limb.value * 2 ** (i * bigfield.L) for i, limb in enumerate(four_tuple)]
        )

    lo, hi = triple._get_lo_hi()
    debug_exprs: Dict[str, List[z3.ExprRef]] = {
        "product_gate_one": triple._product_gate_one(),  # type: ignore
        "auxiliary_gates": triple._auxiliary_gates(),  # type: ignore
        "product_gate_six": triple._product_gate_six(),  # type: ignore
        "product_gate_seven": triple._product_gate_seven(),  # type: ignore
        "lo": [lo],
        "hi": [hi],
        "hi % 2**2*L": [hi % 2 ** (2 * bigfield.L)],
        "a": [_limb_sum(witness.a)],
        "b": [_limb_sum(witness.b)],
        "q": [_limb_sum(witness.q)],
        "r": [_limb_sum(witness.r)],
        "2**L": [z3.IntVal(2**bigfield.L, ctx=solver_ctx.z3_ctx)],
        "2**(2*L)": [z3.IntVal(2 ** (2 * bigfield.L), ctx=solver_ctx.z3_ctx)],
        "neg_p": [z3.IntVal(witness.neg_modulus, ctx=solver_ctx.z3_ctx)],
        "neg_mod_limbs": [
            z3.IntVal(limb, ctx=solver_ctx.z3_ctx) for limb in witness.neg_modulus_limbs
        ],
        "n": [z3.IntVal(bigfield.n, ctx=solver_ctx.z3_ctx)],
        "LIMB_RSHIFT2": [z3.IntVal(triple.LIMB_RSHIFT_2, ctx=solver_ctx.z3_ctx)],
        str([var_name for var_name in triple.aux_vars]): [
            var.value for var in triple.aux_vars.values()
        ],
        "r_limbs": [signed_field_to_int(limb.value) for limb in witness.r],
    }

    # Check for being vacuously true
    antecedent = triple.validity_expr_antecedent()
    _assert_sat(solver_ctx, antecedent)

    # Ensure expression is valid
    maybe_lemma_cex = triple.prove_lemmas(solver_factory=_solver_factory)
    _check_for_cex(maybe_lemma_cex, debug_exprs=debug_exprs)

    maybe_validity_cex = triple.prove_validity(_solver_factory, prove_lemmas=False)
    _check_for_cex(maybe_validity_cex, debug_exprs=debug_exprs)


def test_create_unsafe_evaluate_multiply_add(solver_ctx):
    fresh_witness = UnsafeEvaluateMultiplyAddWitness.fresh(solver_ctx)
    UnsafeEvaluateMultiplyAdd(fresh_witness)

    # # Check for being vacuously true
    # antecedent = triple.validity_expr_antecedent()
    # _assert_sat(solver_ctx, antecedent)

    # # Ensure expression is valid
    # maybe_lemma_cex = triple.prove_lemmas(solver_factory=_solver_factory)
    # _check_for_cex(maybe_lemma_cex, debug_exprs=debug_exprs)

    # maybe_validity_cex = triple.prove_validity(_solver_factory, prove_lemmas=False)
    # _check_for_cex(maybe_validity_cex, debug_exprs=debug_exprs)
