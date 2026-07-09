import { scheduleLayers, topologicalLayers } from './graph.js';

const layerOf = (layers: string[][], node: string): number => layers.findIndex(l => l.includes(node));

describe('topologicalLayers', () => {
  it('puts mutually-independent nodes in a single layer', () => {
    const layers = topologicalLayers(['a', 'b', 'c'], new Map());
    expect(layers).toHaveLength(1);
    expect(new Set(layers[0])).toEqual(new Set(['a', 'b', 'c']));
  });

  it('orders a dependent strictly after its dependency', () => {
    const deps = new Map([
      ['b', ['a']],
      ['c', ['b']],
    ]);
    const layers = topologicalLayers(['a', 'b', 'c'], deps);
    expect(layerOf(layers, 'a')).toBeLessThan(layerOf(layers, 'b'));
    expect(layerOf(layers, 'b')).toBeLessThan(layerOf(layers, 'c'));
  });

  it('treats dependencies outside the node set as already satisfied', () => {
    const deps = new Map([['b', ['external']]]);
    expect(topologicalLayers(['b'], deps)).toEqual([['b']]);
  });

  it('throws on a cycle', () => {
    const deps = new Map([
      ['a', ['b']],
      ['b', ['a']],
    ]);
    expect(() => topologicalLayers(['a', 'b'], deps)).toThrow(/cycle/i);
  });
});

describe('scheduleLayers', () => {
  const never = () => false;

  it('matches topologicalLayers when nothing floats', () => {
    const deps = new Map([['b', ['a']]]);
    expect(scheduleLayers(['a', 'b'], deps, never)).toEqual(topologicalLayers(['a', 'b'], deps));
  });

  it('floats a late node with no dependents down to the last layer', () => {
    // Chain p0 → p1 → p2 spans three layers; `act` depends only on p0 (ASAP layer 1) and floats.
    const deps = new Map([
      ['p1', ['p0']],
      ['p2', ['p1']],
      ['act', ['p0']],
    ]);
    const layers = scheduleLayers(['p0', 'p1', 'p2', 'act'], deps, n => n === 'act');
    expect(layerOf(layers, 'act')).toEqual(layers.length - 1); // pushed to the last layer
    expect(layerOf(layers, 'act')).toBeGreaterThan(layerOf(layers, 'p0') + 1); // past its ASAP layer
  });

  it('keeps a floating node strictly before its earliest dependent', () => {
    const deps = new Map([
      ['act', ['p0']],
      ['q', ['act']],
    ]);
    const layers = scheduleLayers(['p0', 'act', 'q'], deps, n => n === 'act');
    expect(layerOf(layers, 'act')).toBeLessThan(layerOf(layers, 'q'));
  });
});
