/**
 * Dependency-graph utilities for the deploy framework: topological layering (which steps
 * can run together) and a pretty-printer for the resulting plan.
 */

/**
 * Group `nodes` into dependency layers (Kahn's algorithm). Each layer contains nodes whose
 * dependencies all sit in earlier layers, so a layer's nodes are mutually independent and
 * may run in parallel. Dependencies pointing outside `nodes` (e.g. already-satisfied work)
 * are treated as satisfied. Throws on a cycle.
 */
export function topologicalLayers(nodes: string[], dependencies: Map<string, string[]>): string[][] {
  const remaining = new Set(nodes);
  const layers: string[][] = [];
  while (remaining.size > 0) {
    // A node is ready when every dependency already sits in an earlier layer (i.e. is no longer in `remaining`).
    const layer = [...remaining].filter(node =>
      (dependencies.get(node) ?? []).every(dependency => !remaining.has(dependency)),
    );
    if (layer.length === 0) {
      throw new Error(`Dependency cycle among: ${[...remaining].join(', ')}`);
    }
    for (const node of layer) {
      remaining.delete(node);
    }
    layers.push(layer);
  }
  return layers;
}

/**
 * Like {@link topologicalLayers}, but nodes for which `floatLate(node)` is true are scheduled as
 * LATE as their dependents allow (ALAP) instead of as early as possible. Used to push batchable
 * actions into the latest layer they can share, so same-account actions in adjacent layers coalesce
 * into one tx. Fixed nodes (e.g. contract publishes, which unblock dependents and don't batch) keep
 * their earliest layer; the relative order — and so the critical-path length — is unchanged. Throws
 * on a cycle (via {@link topologicalLayers}).
 */
export function scheduleLayers(
  nodes: string[],
  dependencies: Map<string, string[]>,
  floatLate: (node: string) => boolean,
): string[][] {
  const asap = topologicalLayers(nodes, dependencies);
  if (asap.length === 0) {
    return [];
  }
  const lastLayer = asap.length - 1;

  const nodeSet = new Set(nodes);
  const layerOf = new Map<string, number>();
  for (const [index, layer] of asap.entries()) {
    for (const node of layer) {
      layerOf.set(node, index);
    }
  }

  // Reverse adjacency: which in-set nodes depend on each node.
  const dependents = new Map<string, string[]>();
  for (const node of nodes) {
    for (const dependency of dependencies.get(node) ?? []) {
      if (!nodeSet.has(dependency)) {
        continue;
      }
      const list = dependents.get(dependency);
      if (list) {
        list.push(node);
      } else {
        dependents.set(dependency, [node]);
      }
    }
  }

  // Push floating nodes as late as possible, visiting in reverse topological order (the flattened
  // ASAP order reversed) so every node is placed after all of its dependents are placed.
  for (const node of asap.flat().reverse()) {
    if (!floatLate(node)) {
      continue;
    }
    const deps = dependents.get(node) ?? [];
    const latest = deps.length === 0 ? lastLayer : Math.min(...deps.map(d => layerOf.get(d)!)) - 1;
    layerOf.set(node, Math.max(layerOf.get(node)!, latest));
  }

  const layers: string[][] = Array.from({ length: asap.length }, () => []);
  for (const node of nodes) {
    layers[layerOf.get(node)!].push(node);
  }
  return layers.filter(layer => layer.length > 0);
}

/** One node in the printed plan. */
export interface PlanRow {
  /** e.g. "goCoin" */
  name: string;
  /** short tag, e.g. "Token · publishes class" */
  tag?: string;
  /** dependency names to show as `← a, b` */
  dependencies?: string[];
}

/**
 * Render a titled flat list of plan rows (no layer grouping). Use for the declared-contracts
 * overview, whose `← ...` arrows are constructor-arg references — not an execution order.
 */
export function formatList(title: string, rows: PlanRow[]): string {
  if (rows.length === 0) {
    return `${title}: (none)`;
  }
  const lines = [`${title}:`];
  for (const row of rows) {
    const dependencies = row.dependencies && row.dependencies.length ? `  ← ${row.dependencies.join(', ')}` : '';
    const tag = row.tag ? `  [${row.tag}]` : '';
    lines.push(`  ${row.name}${tag}${dependencies}`);
  }
  return lines.join('\n');
}

/**
 * Render a titled, layer-grouped section of the plan as an indented tree. Each layer's txs are
 * submitted in parallel.
 */
export function formatLayers(title: string, layers: PlanRow[][]): string {
  if (layers.length === 0) {
    return `${title}: (none)`;
  }
  const lines = [`${title}:`];
  for (const [index, layer] of layers.entries()) {
    lines.push(`  layer ${index + 1}${layer.length > 1 ? '  (parallel)' : ''}`);
    for (const row of layer) {
      const dependencies = row.dependencies && row.dependencies.length ? `  ← ${row.dependencies.join(', ')}` : '';
      const tag = row.tag ? `  [${row.tag}]` : '';
      lines.push(`    ${row.name}${tag}${dependencies}`);
    }
  }
  return lines.join('\n');
}
