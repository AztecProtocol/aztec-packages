import { Point } from './point.js';

describe('Point', () => {
  it('equals', () => {
    expect(Point.G).toEqual(Point.G);
  });

  it('double, add, sub', () => {
    const G2 = Point.G.double();
    expect(G2.equals(Point.G.add(Point.G))).toBe(true);
    expect(G2.is_on_grumpkin()).toBe(true);
    expect(G2.equals(Point.G)).toBe(false);

    const G3 = Point.G.add(Point.G).add(Point.G);
    expect(G3.is_on_grumpkin()).toBe(true);
    expect(G3.equals(G2)).toBe(false);

    const G4 = G2.double();
    expect(G4.equals(G3)).toBe(false);
    expect(G4.is_on_grumpkin()).toBe(true);

    expect(G4.sub(Point.G)).toEqual(G3);
    expect(G4.sub(G2)).toEqual(G2);
    expect(G4.sub(G3)).toEqual(Point.G);
    expect(Point.G.sub(Point.G)).toEqual(Point.ZERO);
  });
});
