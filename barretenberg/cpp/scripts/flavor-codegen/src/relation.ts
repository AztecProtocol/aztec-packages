import type { EntityDecl, EntityName, Relation, RelationChallengeUsage, SubsetMap } from "./types.js";

interface RelationInput {
    id: string;
    cppName: string;
    header: string;
    entities: readonly EntityDecl[];
    shiftedEntities?: readonly EntityName[];
    subsets?: SubsetMap;
    cppExtraTemplateArgs?: readonly string[];
    structural?: boolean;
    gateBlockName?: string;
    // See `Relation.usesChallenges` in types.ts. Optional; defaults to all-false. Adding a new
    // relation that reads `params.eta*` / `params.beta_sqr,cube` MUST set the matching flag here,
    // otherwise oink leaves the parameter at zero in flavors that don't already pull it in.
    usesChallenges?: RelationChallengeUsage;
}

export function relation(input: RelationInput): Relation {
    const shiftedEntities = input.shiftedEntities ?? [];
    const structural = input.structural ?? false;
    validateShiftedSubset(input.cppName, input.entities, shiftedEntities);
    const subsets = freezeSubsets(input.subsets ?? {});
    validateSubsetMembership(input.cppName, input.entities, subsets);
    const usesChallenges: RelationChallengeUsage = Object.freeze({
        etaPowers: input.usesChallenges?.etaPowers ?? false,
        betaPowers: input.usesChallenges?.betaPowers ?? false,
    });
    return {
        id: input.id,
        cppName: input.cppName,
        header: input.header,
        entities: [...input.entities],
        shiftedEntities: [...shiftedEntities],
        subsets,
        cppExtraTemplateArgs: Object.freeze([...(input.cppExtraTemplateArgs ?? [])]),
        structural,
        gateBlockName: input.gateBlockName,
        usesChallenges,
    };
}

function validateShiftedSubset(
    cppName: string,
    entities: readonly EntityDecl[],
    shiftedEntities: readonly EntityName[]
): void {
    const witnessNames = new Set(entities.filter((e) => e.kind === "witness").map((e) => e.name));
    for (const name of shiftedEntities) {
        if (!witnessNames.has(name)) {
            throw new Error(
                `${cppName}: shifted entity '${name}' is not in the relation's witness entities`
            );
        }
    }
}

function freezeSubsets(input: Readonly<Record<string, readonly EntityName[]>>): SubsetMap {
    const out: Record<string, readonly EntityName[]> = {};
    for (const [name, members] of Object.entries(input)) {
        out[name] = Object.freeze([...members]);
    }
    return Object.freeze(out);
}

function validateSubsetMembership(
    cppName: string,
    entities: readonly EntityDecl[],
    subsets: SubsetMap
): void {
    const entitySet = new Set(entities.map((e) => e.name));
    for (const [subsetName, members] of Object.entries(subsets)) {
        for (const member of members) {
            if (!entitySet.has(member)) {
                throw new Error(
                    `${cppName}: subset '${subsetName}' references '${member}' which is not in this relation's entities`
                );
            }
        }
    }
}
