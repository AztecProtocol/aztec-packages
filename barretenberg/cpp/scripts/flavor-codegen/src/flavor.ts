import type { Flavor, Relation } from "./types.js";
import { builderBusIndices } from "./trace.js";

interface FlavorInput {
    name: string;
    family: string;
    generatedClassName?: string;
    // C++ circuit-builder alias for this arithmetization; defaults to a title-cased family
    // (e.g. "mega_app" -> "MegaAppCircuitBuilder"). Only meaningful for a flavor that owns its trace.
    builderName?: string;
    relations: readonly Relation[];
    composites?: Readonly<Record<string, readonly string[]>>;
    arithmetization: string;
}

export function flavor(input: FlavorInput): Flavor {
    validateSelectorClassification(input);
    // Called for its validation errors; the result is unused.
    builderBusIndices(input);
    const composites: Record<string, readonly string[]> = {};
    for (const [name, parts] of Object.entries(input.composites ?? {})) {
        composites[name] = Object.freeze([...parts]);
    }
    return {
        name: input.name,
        family: input.family,
        generatedClassName: input.generatedClassName ?? defaultGeneratedClassName(input.family),
        builderName: input.builderName ?? defaultBuilderName(input.family),
        relations: Object.freeze([...input.relations]),
        composites: Object.freeze(composites),
        arithmetization: input.arithmetization,
    };
}

function validateSelectorClassification(input: FlavorInput): void {
    const gateSelectors = new Set(input.relations.flatMap((r) => r.subsets.gate_selectors ?? []));
    const nonGateSelectors = new Set(input.relations.flatMap((r) => r.subsets.non_gate_selectors ?? []));

    // Builder selector columns use the q_ prefix; other precomputed columns are populated separately.
    const declaredSelectors = new Set(
        input.relations.flatMap((r) =>
            r.entities
                .filter((entity) => entity.kind === "precomputed" && entity.name.startsWith("q_"))
                .map((entity) => entity.name)
        )
    );
    for (const name of declaredSelectors) {
        if (!gateSelectors.has(name) && !nonGateSelectors.has(name)) {
            throw new Error(`${input.name}: selector '${name}' is in neither gate_selectors nor non_gate_selectors`);
        }
    }

    for (const r of input.relations) {
        for (const name of r.requiredNonGateSelectors) {
            if (!nonGateSelectors.has(name)) {
                throw new Error(`${input.name}: ${r.id} requires '${name}' in non_gate_selectors`);
            }
        }
    }
}

// Snake_case → TitleCase + "CircuitBuilder"; override `builderName` when the arithmetization's
// builder is named for what it builds rather than for its flavor.
function defaultBuilderName(family: string): string {
    const segments = family.split("_").map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1));
    return `${segments.join("")}CircuitBuilder`;
}

// Snake_case → TitleCase; tokens in `ACRONYMS` stay uppercase. Override `generatedClassName`
// for anything outside the allowlist.
const ACRONYMS = new Set(["zk", "vm", "avm", "kzg", "ipa", "fft"]);
function defaultGeneratedClassName(family: string): string {
    const segments = family.split("_").map((seg) => {
        if (ACRONYMS.has(seg.toLowerCase())) return seg.toUpperCase();
        return seg.charAt(0).toUpperCase() + seg.slice(1);
    });
    return `${segments.join("")}Flavor_Generated`;
}
