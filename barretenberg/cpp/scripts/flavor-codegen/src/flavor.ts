import type { Flavor, Relation } from "./types.js";

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
