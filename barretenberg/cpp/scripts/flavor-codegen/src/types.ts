export type EntityName = string;

// "masking" entities are counted separately from witness in NUM_*_ENTITIES.
export type EntityKind = "precomputed" | "witness" | "masking";

export interface EntityDecl {
    name: EntityName;
    kind: EntityKind;
}

// Named subsets emitted as `get_<name>()` views on AllEntities and the transport classes.
// Unioned across relations; if two relations declare the same subset, members are concatenated
// in declaration order.
export type SubsetMap = Readonly<Record<string, readonly EntityName[]>>;

// Which Fiat-Shamir challenge derivatives this relation reads from `RelationParameters`.
// Powers above the first are only needed by a subset of relations; flavors that don't include
// any consumer skip both the FS sample (for `etaPowers`) and the extra multiplications. Beta /
// gamma themselves are always sampled (permutation argument), so only the squared/cubed powers
// need conditional emission.
export interface RelationChallengeUsage {
    // Reads `params.eta`, `params.eta_two`, `params.eta_three`.
    readonly etaPowers?: boolean;
    // Reads `params.beta_sqr`, `params.beta_cube`.
    readonly betaPowers?: boolean;
}

export interface Relation {
    // Stable identity (survives module re-evaluation); keyed by capability-bool emission.
    readonly id: string;
    readonly cppName: string;
    readonly header: string;
    readonly entities: readonly EntityDecl[];
    readonly shiftedEntities: readonly EntityName[];
    // Each member must appear in `entities` (validated at flavor-resolution time).
    readonly subsets: SubsetMap;
    // Extra C++ template args after `<FF, ...>` when emitting into `Relations_<FF>`, e.g.
    // `["EntityId::kernel_calldata", ...]` for a `SingleBusLookupRelation` instantiation.
    readonly cppExtraTemplateArgs: readonly string[];
    // Structural relations contribute entities to the layout but are skipped when emitting the
    // `Relations_<FF>` tuple. Used for relations that own columns but have no algebraic
    // constraint (e.g. MaskingRelation).
    readonly structural: boolean;
    // Name of the builder-side TraceBlock member holding this relation's gate selector
    // polynomial (e.g. ArithmeticRelation → "arithmetic"). Aggregated per flavor into
    // `get_gate_blocks()`.
    readonly gateBlockName?: string;
    // Per-relation declaration of which FS-challenge powers this relation consumes. ORed across
    // relations to produce `Flavor::UsesEtaPowers` / `Flavor::UsesBetaPowers`, which oink uses
    // to gate the sample/compute. Defaults to all-false.
    readonly usesChallenges: RelationChallengeUsage;
}

// Layout is derived: kind-bucketed (masking → precomputed → witness) per-relation walk; subsets
// first, then leftover entities. First mention wins on dedupe. Reorder at the relation/subset
// level — there is no per-flavor layout override.
export interface Flavor {
    readonly name: string;
    readonly family: string;
    // C++ class name; defaults to a title-cased family (e.g. "ultra_zk" → "UltraZKFlavor_Generated").
    readonly generatedClassName: string;
    readonly relations: readonly Relation[];
    // Subset name → list of existing subsets whose entries are concatenated. Example:
    // `selectors: ["non_gate_selectors", "gate_selectors"]`.
    readonly composites: Readonly<Record<string, readonly string[]>>;
    // Trace blocks without a gate selector (e.g. `ecc_op`, `pub_inputs`), prepended to the
    // relation-discovered blocks in `<Family>TraceBlockData`.
    readonly traceExtraBlocks: readonly string[];
    // Whether codegen emits `<family>_execution_trace_generated.hpp` for this flavor. Reduced /
    // ZK variants share the parent flavor's generated trace.
    readonly emitsTrace: boolean;
}
