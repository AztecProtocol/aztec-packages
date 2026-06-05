// Flavor codegen entry point. Emits
// `barretenberg/cpp/src/barretenberg/flavor/generated/<flavor>_flavor_generated.hpp`:
// EntityId enum, NUM_*_ENTITIES, capability bools, Relations_<FF> tuple, REPEATED_COMMITMENTS,
// AllEntities, builder bridges (`get_gate_blocks`, `get_block_non_gate_selectors`, `GATE_KINDS`).
// Hand-written flavor classes alias these via `using Generated = ...`.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { Mega } from "./flavors/mega.js";
import { MegaApp } from "./flavors/mega_app.js";
import { MegaKernel } from "./flavors/mega_kernel.js";
import { MegaZK } from "./flavors/mega_zk.js";
import { Ultra } from "./flavors/ultra.js";
import { UltraZK } from "./flavors/ultra_zk.js";
import { formatInPlace } from "./format.js";
import { GATE_SELECTOR_TO_GATE_KIND, generateTrace } from "./trace.js";
import type { EntityDecl, EntityName, Flavor } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ResolvedLayout {
    family: string;
    generatedClassName: string;
    // Rendered template-instantiation strings for `Relations_<FF>`; structural relations are skipped.
    relationCppInstantiations: string[];
    relationHeaders: string[];
    unshiftedOrder: string[];
    shiftedOrder: string[];
    declsByName: Map<string, EntityDecl>;
    numPrecomputed: number;
    numWitness: number;
    numMasking: number;
    numShifted: number;
    numAll: number;
    subsets: Map<string, string[]>;
    composites: Map<string, string[]>;
    // One (original, duplicate) pair per shifted entity; Shplemini folds the duplicate into the original.
    repeatedCommitments: { original: number; duplicate: number }[];
    hasDataBus: boolean;
    numBusColumns: number;
    // Per-flavor-bus, the index into the builder's `circuit.get_bus_vector(idx)` slots
    // (kernel_calldata=0, first/second/third_app_calldata=1/2/3, return_data=4). Length =
    // NUM_BUS_COLUMNS, indexed by the flavor's own bus ordering.
    builderBusIndices: number[];
    relationIds: Set<string>;
    // ORed across the flavor's relations: does any relation read `params.eta*` / `params.beta_sqr,cube`?
    // Used by oink to gate the FS sample and the extra multiplications.
    usesEtaPowers: boolean;
    usesBetaPowers: boolean;
    // One entry per gate selector in `get_gate_selectors()` order; a block with k selectors appears k times.
    gateBlockNames: string[];
}

// `ExecutionTraceBlock` exposes `q_m/q_c/q_1/q_2/q_3/q_4/q_5`; flavors use `q_l/q_r/q_o`.
const NON_GATE_BUILDER_ACCESSOR: ReadonlyMap<string, string> = new Map([
    ["q_l", "q_1"],
    ["q_r", "q_2"],
    ["q_o", "q_3"],
]);

function blockSelectorExpr(entityName: string, isGate: boolean): string {
    if (isGate) {
        const kind = GATE_SELECTOR_TO_GATE_KIND.get(entityName);
        if (!kind) {
            throw new Error(`flavor-codegen: gate selector '${entityName}' has no GateKind mapping`);
        }
        return `block.gate_selector_for(GateKind::${kind})`;
    }
    return `block.${NON_GATE_BUILDER_ACCESSOR.get(entityName) ?? entityName}()`;
}

// Relations listed here emit a `static constexpr bool Has<X>` so downstream C++ can compile-time
// gate code on their presence. Unlisted relations are treated as always-on.
const RELATION_CAPABILITY_BOOLS: ReadonlyArray<{ id: string; cppName: string }> = [
    { id: "log_deriv_lookup", cppName: "HasLogDerivLookup" },
    { id: "elliptic", cppName: "HasElliptic" },
    { id: "memory", cppName: "HasMemory" },
    { id: "non_native_field", cppName: "HasNonNativeField" },
    { id: "ecc_op_queue", cppName: "HasEccOpQueue" },
];

// Kind-bucketed (masking → precomputed → witness) per-relation walk. Within each relation,
// subsets emit first in declaration order, then leftover entities. Duplicates: first mention wins.
function deriveLayout(flavor: Flavor, declsByName: Map<string, EntityDecl>): string[] {
    const out: string[] = [];
    const emitted = new Set<string>();
    for (const kind of ["masking", "precomputed", "witness"] as const) {
        for (const r of flavor.relations) {
            for (const members of Object.values(r.subsets)) {
                for (const m of members) {
                    const decl = declsByName.get(m);
                    if (decl && decl.kind === kind && !emitted.has(m)) {
                        emitted.add(m);
                        out.push(m);
                    }
                }
            }
            for (const e of r.entities) {
                if (e.kind === kind && !emitted.has(e.name)) {
                    emitted.add(e.name);
                    out.push(e.name);
                }
            }
        }
    }
    return out;
}

function resolveLayout(flavor: Flavor): ResolvedLayout {
    const declsByName = new Map<string, EntityDecl>();
    const shiftedSet = new Set<EntityName>();

    const ingest = (entities: readonly EntityDecl[], shifted: readonly EntityName[]) => {
        for (const e of entities) {
            const existing = declsByName.get(e.name);
            if (existing && existing.kind !== e.kind) {
                throw new Error(
                    `${flavor.name}: entity '${e.name}' has conflicting kinds: '${existing.kind}' vs '${e.kind}'`
                );
            }
            if (!existing) {
                declsByName.set(e.name, { name: e.name, kind: e.kind });
            }
        }
        for (const name of shifted) shiftedSet.add(name);
    };

    for (const r of flavor.relations) ingest(r.entities, r.shiftedEntities);

    // Re-check shifted-entity kinds at the flavor level (also enforced per-relation).
    for (const name of shiftedSet) {
        const decl = declsByName.get(name);
        if (!decl) throw new Error(`${flavor.name}: shifted entity '${name}' has no declaration`);
        if (decl.kind !== "witness") {
            throw new Error(`${flavor.name}: shifted entity '${name}' is declared kind '${decl.kind}', not 'witness'`);
        }
    }

    const unshiftedOrder = deriveLayout(flavor, declsByName);

    // Validate the derived layout covered exactly the entity union (no missing, no extras).
    const orderSet = new Set(unshiftedOrder);
    if (orderSet.size !== unshiftedOrder.length) {
        throw new Error(`${flavor.name}: layout policy emitted duplicate names`);
    }
    for (const name of declsByName.keys()) {
        if (!orderSet.has(name)) {
            throw new Error(`${flavor.name}: layout policy did not place entity '${name}'`);
        }
    }
    for (const name of unshiftedOrder) {
        if (!declsByName.has(name)) {
            throw new Error(`${flavor.name}: layout policy emitted unknown entity '${name}'`);
        }
    }

    // Shifted suffix order = layout-policy order, restricted to shifted entities.
    const shiftedOrder = unshiftedOrder.filter((name) => shiftedSet.has(name));

    // Union subsets across relations. Insertion order is preserved so `databus_selectors[i]`
    // matches bus index `i`. Members must be in the flavor's entity union.
    const layoutIndex = new Map<string, number>();
    unshiftedOrder.forEach((name, i) => layoutIndex.set(name, i));

    const subsetMembers = new Map<string, string[]>();
    const subsetSeen = new Map<string, Set<string>>();
    const ingestSubsets = (
        sourceName: string,
        subsets: Readonly<Record<string, readonly string[]>>
    ) => {
        for (const [subsetName, members] of Object.entries(subsets)) {
            let list = subsetMembers.get(subsetName);
            let seen = subsetSeen.get(subsetName);
            if (!list) {
                list = [];
                seen = new Set<string>();
                subsetMembers.set(subsetName, list);
                subsetSeen.set(subsetName, seen);
            }
            for (const m of members) {
                if (!declsByName.has(m)) {
                    throw new Error(
                        `${flavor.name}: subset '${subsetName}' contributed by ${sourceName} ` +
                            `references '${m}' which is not in the flavor's entity union`
                    );
                }
                if (!seen!.has(m)) {
                    seen!.add(m);
                    list.push(m);
                }
            }
        }
    };
    for (const r of flavor.relations) ingestSubsets(r.cppName, r.subsets);

    const subsets = new Map<string, string[]>();
    for (const [subsetName, list] of subsetMembers) {
        const ordered = [...list];
        subsets.set(subsetName, ordered);
    }

    const composites = new Map<string, string[]>();
    for (const [name, parts] of Object.entries(flavor.composites)) {
        for (const p of parts) {
            if (!subsets.has(p)) {
                throw new Error(
                    `${flavor.name}: composite '${name}' references unknown subset '${p}'`
                );
            }
        }
        if (subsets.has(name)) {
            throw new Error(
                `${flavor.name}: composite '${name}' shadows an existing subset of the same name`
            );
        }
        composites.set(name, [...parts]);
    }

    let numPrecomputed = 0;
    let numWitness = 0;
    let numMasking = 0;
    for (const name of unshiftedOrder) {
        const decl = declsByName.get(name)!;
        switch (decl.kind) {
            case "precomputed":
                numPrecomputed++;
                break;
            case "witness":
                numWitness++;
                break;
            case "masking":
                numMasking++;
                break;
        }
    }

    // (original, duplicate) pairs for Shplemini: `original` is the unshifted index, `duplicate`
    // is the sequential index in the shifted suffix.
    const repeatedCommitments: { original: number; duplicate: number }[] = shiftedOrder.map(
        (name, i) => ({
            original: layoutIndex.get(name)!,
            duplicate: unshiftedOrder.length + i,
        })
    );
    const numBusColumns = flavor.relations.filter((r) => r.id.startsWith("single_bus_lookup_")).length;

    return {
        family: flavor.family,
        generatedClassName: flavor.generatedClassName,
        relationCppInstantiations: flavor.relations
            .filter((r) => !r.structural)
            .map((r) => {
                const args = ["FF", ...r.cppExtraTemplateArgs];
                return `${r.cppName}<${args.join(", ")}>`;
            }),
        relationHeaders: [
            ...new Set(
                flavor.relations
                    .filter((r) => !r.structural)
                    .map((r) => r.header)
            ),
        ],
        unshiftedOrder,
        shiftedOrder,
        declsByName,
        numPrecomputed,
        numWitness,
        numMasking,
        numShifted: shiftedOrder.length,
        numAll: unshiftedOrder.length + shiftedOrder.length,
        subsets,
        composites,
        repeatedCommitments,
        hasDataBus: numBusColumns > 0,
        numBusColumns,
        builderBusIndices: (() => {
            // Selector → builder bus_idx (kernel_calldata=0, first_app=1, second_app=2,
            // third_app=3, return_data=4). Order of buses in this flavor comes from the
            // `databus_selectors` subset.
            const sel_to_idx = new Map<string, number>([
                ["q_l", 0], ["q_r", 1], ["q_o", 2], ["q_4", 3], ["q_m", 4],
            ]);
            const sels = subsets.get("databus_selectors") ?? [];
            return sels.map((sel) => {
                const idx = sel_to_idx.get(sel);
                if (idx === undefined) {
                    throw new Error(`flavor-codegen: databus selector '${sel}' has no builder bus_idx mapping`);
                }
                return idx;
            });
        })(),
        relationIds: new Set(flavor.relations.map((r) => r.id)),
        usesEtaPowers: flavor.relations.some((r) => r.usesChallenges.etaPowers ?? false),
        usesBetaPowers: flavor.relations.some((r) => r.usesChallenges.betaPowers ?? false),
        gateBlockNames: (() => {
            // selector → block (first relation declaring a selector wins); emit one block per
            // selector in `get_gate_selectors()` order. A block owning k selectors appears k times.
            const selectorToBlock = new Map<string, string>();
            for (const r of flavor.relations) {
                if (!r.gateBlockName) continue;
                const sels = r.subsets["gate_selectors"] ?? [];
                for (const s of sels) {
                    if (!selectorToBlock.has(s)) {
                        selectorToBlock.set(s, r.gateBlockName);
                    }
                }
            }
            const gateSelectorOrder = subsets.get("gate_selectors") ?? [];
            const out: string[] = [];
            for (const sel of gateSelectorOrder) {
                const block = selectorToBlock.get(sel);
                if (block) out.push(block);
            }
            return out;
        })(),
    };
}

// Emits mutable + const RefArray overloads. `accessor` builds the C++ member-read expression:
// `this->name()` for transport classes, `(*this)[EntityId::name]` for AllEntities (const-only
// named accessors).
function emitNamedView(
    lines: string[],
    methodName: string,
    members: readonly string[],
    accessor: (memberName: string) => string
): void {
    const N = members.length;
    if (N === 0) {
        lines.push(`        RefArray<DataType, 0> ${methodName}() { return {}; }`);
        lines.push(`        RefArray<const DataType, 0> ${methodName}() const { return {}; }`);
        return;
    }
    const callList = members.map(accessor).join(", ");
    lines.push(`        RefArray<DataType, ${N}> ${methodName}() { return { ${callList} }; }`);
    lines.push(
        `        RefArray<const DataType, ${N}> ${methodName}() const { return { ${callList} }; }`
    );
}

// Emit a `std::span` view over a contiguous slice of `data` — zero-overhead alternative to
// RefArray for the kind/shift top-level partitions. Caller guarantees `[startExpr, startExpr+N)`
// is in-range within `data`.
function emitContiguousSpan(
    lines: string[],
    methodName: string,
    startExpr: string,
    lenExpr: string
): void {
    lines.push(
        `        std::span<DataType, ${lenExpr}> ${methodName}() { return std::span<DataType, ${lenExpr}>{ data.data() + (${startExpr}), ${lenExpr} }; }`
    );
    lines.push(
        `        std::span<const DataType, ${lenExpr}> ${methodName}() const { return std::span<const DataType, ${lenExpr}>{ data.data() + (${startExpr}), ${lenExpr} }; }`
    );
}

// Emit `auto get_<name>()` returning the concatenation of the named subset views.
function emitCompositeView(lines: string[], methodName: string, parts: readonly string[]): void {
    const calls = parts.map((p) => `get_${p}()`).join(", ");
    lines.push(`        auto ${methodName}() { return concatenate(${calls}); }`);
    lines.push(`        auto ${methodName}() const { return concatenate(${calls}); }`);
}

// PrecomputedEntities / WitnessEntities transport class. Owns standalone storage (VK and
// WitnessCommitments are serialized independently of AllEntities). Subsets and composites are
// emitted only when all members are in this class's owned set.
function emitTransportClass(
    lines: string[],
    className: string,
    members: readonly string[],
    storageNumExpr: string,
    layout: ResolvedLayout,
    extraGetters: { method: string; members: readonly string[] }[]
): void {
    const memberSet = new Set(members);
    const memberIndex = new Map<string, number>();
    members.forEach((name, i) => memberIndex.set(name, i));

    lines.push(`    template <typename DataType_> class ${className} {`);
    lines.push("      public:");
    lines.push(`        using DataType = DataType_;`);
    lines.push(`        std::array<DataType, ${storageNumExpr}> data{};`);
    lines.push("");
    lines.push(`        bool operator==(const ${className}&) const = default;`);
    lines.push("");
    lines.push(`        std::span<DataType, ${storageNumExpr}> get_all() { return data; }`);
    lines.push(`        std::span<const DataType, ${storageNumExpr}> get_all() const { return data; }`);
    lines.push("");
    lines.push(`        static constexpr size_t size() { return ${storageNumExpr}; }`);
    lines.push("");
    lines.push("        // Named accessor methods — index into local `data` (NOT the AllEntities layout).");
    for (const name of members) {
        const idx = memberIndex.get(name)!;
        lines.push(`        DataType& ${name}() { return data[${idx}]; }`);
        lines.push(`        const DataType& ${name}() const { return data[${idx}]; }`);
    }

    // Subset views — emit only if every member is in this class's owned set.
    const eligibleSubsets: [string, readonly string[]][] = [];
    for (const [name, sm] of layout.subsets) {
        if (sm.every((m) => memberSet.has(m))) {
            eligibleSubsets.push([name, sm]);
        }
    }
    if (eligibleSubsets.length > 0) {
        lines.push("");
        lines.push("        // Subset views.");
        for (const [name, sm] of eligibleSubsets) {
            emitNamedView(lines, `get_${name}`, sm, (m) => `this->${m}()`);
        }
    }

    // Composite views — emit only if all parts are eligible subsets here.
    const eligibleSubsetNames = new Set(eligibleSubsets.map(([n]) => n));
    const eligibleComposites: [string, readonly string[]][] = [];
    for (const [name, parts] of layout.composites) {
        if (parts.every((p) => eligibleSubsetNames.has(p))) {
            eligibleComposites.push([name, parts]);
        }
    }
    if (eligibleComposites.length > 0) {
        lines.push("");
        lines.push("        // Composite views.");
        for (const [name, parts] of eligibleComposites) {
            emitCompositeView(lines, `get_${name}`, parts);
        }
    }

    // Transport-specific getters (e.g. WitnessEntities::get_to_be_shifted).
    if (extraGetters.length > 0) {
        lines.push("");
        for (const { method, members: getMembers } of extraGetters) {
            for (const m of getMembers) {
                if (!memberSet.has(m)) {
                    throw new Error(
                        `${className}.${method}: member '${m}' is not owned by this class`
                    );
                }
            }
            emitNamedView(lines, method, getMembers, (m) => `this->${m}()`);
        }
    }

    // Labels — uppercase, in this class's order.
    lines.push("");
    lines.push("        static const std::vector<std::string>& get_labels()");
    lines.push("        {");
    lines.push("            static const std::vector<std::string> labels = {");
    const labelEntries = members.map((n) => `"${n.toUpperCase()}"`);
    for (let i = 0; i < labelEntries.length; i += 4) {
        lines.push(`                ${labelEntries.slice(i, i + 4).join(", ")},`);
    }
    lines.push("            };");
    lines.push("            return labels;");
    lines.push("        }");

    lines.push("    };");
}

function emitGeneratedHeader(layout: ResolvedLayout): string {
    const lines: string[] = [];

    lines.push("// AUTOGENERATED FILE — do not edit. Regenerate via:");
    lines.push("//   node barretenberg/cpp/scripts/flavor-codegen/dist/main.js");
    lines.push("//");
    lines.push(`// Source: barretenberg/cpp/scripts/flavor-codegen/src/flavors/${layout.family}.ts`);
    lines.push("#pragma once");
    lines.push("");
    lines.push("#include <array>");
    lines.push("#include <cstddef>");
    lines.push("#include <cstdint>");
    lines.push("#include <span>");
    lines.push("#include <string>");
    lines.push("#include <tuple>");
    lines.push("#include <vector>");
    lines.push("");
    lines.push("#include \"barretenberg/common/ref_array.hpp\"");
    lines.push("#include \"barretenberg/common/ref_vector.hpp\"");
    lines.push("#include \"barretenberg/flavor/repeated_commitments_data.hpp\"");
    lines.push("#include \"barretenberg/honk/execution_trace/execution_trace_block.hpp\"");
    for (const header of layout.relationHeaders) {
        lines.push(`#include "${header}"`);
    }
    lines.push("");
    lines.push("namespace bb {");
    lines.push("");
    lines.push(`class ${layout.generatedClassName} {`);
    lines.push("  public:");
    lines.push("    // Dense flavor-local entity index. Layout: [masking | precomputed | witness | shifted].");
    lines.push("    enum class EntityId : uint16_t {");

    let idx = 0;
    for (const name of layout.unshiftedOrder) {
        lines.push(`        ${name} = ${idx},`);
        idx++;
    }
    for (const name of layout.shiftedOrder) {
        lines.push(`        ${name}_shift = ${idx},`);
        idx++;
    }
    lines.push("    };");
    lines.push("");
    lines.push("    // Sumcheck relation tuple. Source of truth is");
    lines.push(`    // flavor-codegen/src/flavors/${layout.family}.ts; structural relations are omitted.`);
    lines.push("    template <typename FF>");
    lines.push("    using Relations_ = std::tuple<");
    for (let i = 0; i < layout.relationCppInstantiations.length; i++) {
        const suffix = i === layout.relationCppInstantiations.length - 1 ? ">;" : ",";
        lines.push(`        ${layout.relationCppInstantiations[i]}${suffix}`);
    }
    lines.push("");
    lines.push(`    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = ${layout.numPrecomputed};`);
    lines.push(`    static constexpr size_t NUM_WITNESS_ENTITIES     = ${layout.numWitness};`);
    lines.push(`    static constexpr size_t NUM_MASKING_ENTITIES     = ${layout.numMasking};`);
    lines.push(`    static constexpr size_t NUM_SHIFTED_ENTITIES     = ${layout.numShifted};`);
    lines.push(`    static constexpr bool HasDataBus                 = ${layout.hasDataBus ? "true" : "false"};`);
    lines.push(`    static constexpr size_t NUM_BUS_COLUMNS          = ${layout.numBusColumns};`);
    if (layout.numBusColumns > 0) {
        lines.push(
            `    static constexpr std::array<size_t, NUM_BUS_COLUMNS> BUILDER_BUS_INDICES = { ${layout.builderBusIndices.join(", ")} };`
        );
    }
    // Per-relation capability bools (see `RELATION_CAPABILITY_BOOLS` in flavor-codegen/main.ts).
    for (const { id, cppName } of RELATION_CAPABILITY_BOOLS) {
        const present = layout.relationIds.has(id);
        lines.push(`    static constexpr bool ${cppName} = ${present ? "true" : "false"};`);
    }
    // Aggregated challenge-usage bools — ORed across the flavor's relations from each relation's
    // `usesChallenges` declaration in TS. Oink gates the FS sample / power computation on these,
    // so adding a relation that reads `params.eta*` / `params.beta_sqr,cube` requires setting the
    // matching flag on that relation's TS module — otherwise the param stays at zero here.
    lines.push(`    static constexpr bool UsesEtaPowers               = ${layout.usesEtaPowers ? "true" : "false"};`);
    lines.push(`    static constexpr bool UsesBetaPowers              = ${layout.usesBetaPowers ? "true" : "false"};`);
    // All prover-committed columns: witness + masking.
    lines.push("    static constexpr size_t NUM_COMMITTED_WITNESS_ENTITIES =");
    lines.push("        NUM_WITNESS_ENTITIES + NUM_MASKING_ENTITIES;");
    lines.push("    static constexpr size_t NUM_UNSHIFTED_ENTITIES   =");
    lines.push("        NUM_PRECOMPUTED_ENTITIES + NUM_COMMITTED_WITNESS_ENTITIES;");
    lines.push("    static constexpr size_t NUM_ALL_ENTITIES         = NUM_UNSHIFTED_ENTITIES + NUM_SHIFTED_ENTITIES;");
    lines.push("");
    lines.push("    // Per-shifted-entity (original, duplicate) index pairs in AllEntities, one per shifted");
    lines.push("    // entity. Collapsed into `RepeatedCommitmentsData` below for Shplemini compatibility.");
    lines.push("    static constexpr std::array<DuplicatePair, NUM_SHIFTED_ENTITIES> REPEATED_COMMITMENT_PAIRS = {");
    for (const pair of layout.repeatedCommitments) {
        lines.push(`        DuplicatePair{ ${pair.original}, ${pair.duplicate} },`);
    }
    lines.push("    };");
    lines.push("    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS =");
    lines.push("        repeated_commitments_from_pairs(REPEATED_COMMITMENT_PAIRS);");
    lines.push("");

    // Builder bridges consumed by `trace_to_polynomials.cpp`.
    const nonGateNames = layout.subsets.get("non_gate_selectors")?.slice() ?? [];
    const gateNames = layout.subsets.get("gate_selectors")?.slice() ?? [];

    if (layout.gateBlockNames.length > 0) {
        const numBlocks = layout.gateBlockNames.length;
        lines.push("    // Gate-selector blocks, parallel to `get_gate_selectors()`.");
        for (const constness of ["", " const"]) {
            const blockBaseType = constness ? "const BlockBase" : "BlockBase";
            lines.push("    template <typename TraceBlocks>");
            lines.push(`    static auto get_gate_blocks(TraceBlocks${constness}& blocks)`);
            lines.push("    {");
            lines.push("        using BlockBase = typename TraceBlocks::BlockBase;");
            lines.push(
                `        return RefArray<${blockBaseType}, ${numBlocks}>(std::array<${blockBaseType}*, ${numBlocks}>{`
            );
            for (const name of layout.gateBlockNames) {
                lines.push(`            &blocks.${name},`);
            }
            lines.push("        });");
            lines.push("    }");
            lines.push("");
        }

        lines.push("    // GateKind for each gate selector, parallel to `get_gate_blocks()`.");
        lines.push(`    static constexpr std::array<GateKind, ${numBlocks}> GATE_KINDS{`);
        for (const name of gateNames) {
            const kind = GATE_SELECTOR_TO_GATE_KIND.get(name);
            if (!kind) {
                throw new Error(`flavor-codegen: gate selector '${name}' has no GateKind mapping`);
            }
            lines.push(`        GateKind::${kind},`);
        }
        lines.push("    };");
        lines.push("");
    }

    if (nonGateNames.length > 0) {
        lines.push(
            "    // Non-gate selectors in `get_non_gate_selectors()` order, as references into a single block."
        );
        lines.push("    template <typename TraceBlock>");
        lines.push("    static auto get_block_non_gate_selectors(TraceBlock& block)");
        lines.push("    {");
        lines.push("        using SelT = std::remove_reference_t<decltype(block.q_m())>;");
        lines.push(`        return RefArray<SelT, ${nonGateNames.length}>{`);
        for (const name of nonGateNames) {
            lines.push(`            ${blockSelectorExpr(name, /*isGate=*/false)},`);
        }
        lines.push("        };");
        lines.push("    }");
        lines.push("");
    }


    lines.push("    // AllEntities: flat `std::array` storage with EntityId-keyed access and named accessors.");
    lines.push("    template <typename DataType> class AllEntities {");
    lines.push("      public:");
    lines.push(`        using EntityId = ${layout.generatedClassName}::EntityId;`);
    lines.push("        std::array<DataType, NUM_ALL_ENTITIES> data{};");
    lines.push("");
    lines.push("        DataType& operator[](EntityId id) { return data[static_cast<size_t>(id)]; }");
    lines.push("        const DataType& operator[](EntityId id) const { return data[static_cast<size_t>(id)]; }");
    lines.push("");
    lines.push("        std::span<DataType, NUM_ALL_ENTITIES> get_all() { return data; }");
    lines.push("        std::span<const DataType, NUM_ALL_ENTITIES> get_all() const { return data; }");
    lines.push("");
    lines.push("        // Named accessors (unshifted + shifted): mutable + const overloads.");
    for (const name of layout.unshiftedOrder) {
        lines.push(`        DataType& ${name}() { return data[static_cast<size_t>(EntityId::${name})]; }`);
        lines.push(
            `        const DataType& ${name}() const { return data[static_cast<size_t>(EntityId::${name})]; }`
        );
    }
    for (const name of layout.shiftedOrder) {
        lines.push(
            `        DataType& ${name}_shift() { return data[static_cast<size_t>(EntityId::${name}_shift)]; }`
        );
        lines.push(
            `        const DataType& ${name}_shift() const { return data[static_cast<size_t>(EntityId::${name}_shift)]; }`
        );
    }

    // Top-level views — kind/shift partitions of the layout.
    const precomputedNames = layout.unshiftedOrder.filter(
        (name) => layout.declsByName.get(name)!.kind === "precomputed"
    );
    const witnessNames = layout.unshiftedOrder.filter(
        (name) => layout.declsByName.get(name)!.kind === "witness"
    );
    const maskingNames = layout.unshiftedOrder.filter(
        (name) => layout.declsByName.get(name)!.kind === "masking"
    );

    lines.push("");
    lines.push("        // Kind/shift partitions: contiguous slices of `data`.");
    // Layout: [masking][precomputed][witness] | [shifted].
    emitContiguousSpan(lines, "get_unshifted", "0", "NUM_UNSHIFTED_ENTITIES");
    emitContiguousSpan(lines, "get_precomputed", "NUM_MASKING_ENTITIES", "NUM_PRECOMPUTED_ENTITIES");
    emitContiguousSpan(
        lines,
        "get_witness",
        "NUM_MASKING_ENTITIES + NUM_PRECOMPUTED_ENTITIES",
        "NUM_WITNESS_ENTITIES"
    );
    if (maskingNames.length > 0) {
        emitContiguousSpan(lines, "get_masking", "0", "NUM_MASKING_ENTITIES");
    }
    // get_to_be_shifted: span if positions are monotonically +1, else RefArray.
    const layoutIndex = new Map<string, number>();
    layout.unshiftedOrder.forEach((name, i) => layoutIndex.set(name, i));
    const shiftedPositions = layout.shiftedOrder.map((name) => layoutIndex.get(name)!);
    const toBeShiftedContiguous =
        shiftedPositions.length === 0 ||
        shiftedPositions.every((idx, i) => i === 0 || idx === shiftedPositions[i - 1] + 1);
    if (toBeShiftedContiguous && shiftedPositions.length > 0) {
        emitContiguousSpan(
            lines,
            "get_to_be_shifted",
            `${shiftedPositions[0]}`,
            "NUM_SHIFTED_ENTITIES"
        );
    } else {
        emitNamedView(
            lines,
            "get_to_be_shifted",
            layout.shiftedOrder,
            (m) => `(*this)[EntityId::${m}]`
        );
    }
    emitContiguousSpan(lines, "get_shifted", "NUM_UNSHIFTED_ENTITIES", "NUM_SHIFTED_ENTITIES");

    if (layout.subsets.size > 0) {
        lines.push("");
        lines.push("        // Subset views (relation-declared groupings in layout order).");
        for (const [subsetName, members] of layout.subsets) {
            emitNamedView(
                lines,
                `get_${subsetName}`,
                members,
                (m) => `(*this)[EntityId::${m}]`
            );
        }
    }

    if (layout.composites.size > 0) {
        lines.push("");
        lines.push("        // Composite views: concatenations of subset views.");
        for (const [compositeName, parts] of layout.composites) {
            emitCompositeView(lines, `get_${compositeName}`, parts);
        }
    }

    lines.push("");
    lines.push("        // Labels — uppercase, layout order.");
    lines.push("        static const std::vector<std::string>& get_labels()");
    lines.push("        {");
    lines.push("            static const std::vector<std::string> labels = {");
    const labelEntries: string[] = [];
    for (const name of layout.unshiftedOrder) {
        labelEntries.push(`"${name.toUpperCase()}"`);
    }
    for (const name of layout.shiftedOrder) {
        labelEntries.push(`"${name.toUpperCase()}_SHIFT"`);
    }
    // Pretty-print 4 entries per line.
    for (let i = 0; i < labelEntries.length; i += 4) {
        lines.push(`                ${labelEntries.slice(i, i + 4).join(", ")},`);
    }
    lines.push("            };");
    lines.push("            return labels;");
    lines.push("        }");

    lines.push("    };");

    lines.push("");
    lines.push("    // Verification-key transport class. Owns its own storage; not a slice of AllEntities.");
    emitTransportClass(
        lines,
        "PrecomputedEntities",
        precomputedNames,
        "NUM_PRECOMPUTED_ENTITIES",
        layout,
        []
    );

    lines.push("");
    lines.push("    // Prover-commitment transport class (witness only). Owns its own storage.");
    emitTransportClass(
        lines,
        "WitnessEntities",
        witnessNames,
        "NUM_WITNESS_ENTITIES",
        layout,
        [{ method: "get_to_be_shifted", members: layout.shiftedOrder }]
    );

    lines.push("};");
    lines.push("");
    lines.push("} // namespace bb");
    lines.push("");

    return lines.join("\n");
}

function generate(flavor: Flavor, repoRoot: string): { path: string; layout: ResolvedLayout } {
    const layout = resolveLayout(flavor);
    const header = emitGeneratedHeader(layout);
    const outDir = path.join(repoRoot, "barretenberg", "cpp", "src", "barretenberg", "flavor", "generated");
    const outFile = path.join(outDir, `${flavor.family}_flavor_generated.hpp`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, header, "utf8");
    formatInPlace(outFile);
    return { path: outFile, layout };
}

function main(): void {
    const repoRoot = path.resolve(__dirname, "..", "..", "..", "..", "..");

    for (const flavorValue of [Mega, MegaApp, MegaKernel, MegaZK, Ultra, UltraZK]) {
        const { path: outFile, layout } = generate(flavorValue, repoRoot);
        process.stdout.write(
            `flavor-codegen: emitted ${path.relative(repoRoot, outFile)} ` +
                `(precomputed=${layout.numPrecomputed} witness=${layout.numWitness} ` +
                `masking=${layout.numMasking} shifted=${layout.numShifted} all=${layout.numAll})\n`
        );
        if (flavorValue.emitsTrace) {
            const traceFile = generateTrace(flavorValue, repoRoot);
            process.stdout.write(`flavor-codegen: emitted ${path.relative(repoRoot, traceFile)}\n`);
        }
    }
}

main();
