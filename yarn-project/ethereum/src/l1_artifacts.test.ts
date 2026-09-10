import { RollupArtifact } from './l1_artifacts.js';

describe('l1 artifacts', () => {
  describe('RollupArtifact libraries', () => {
    const { linkReferences, libraryCode } = RollupArtifact.libraries;
    const linkedNames = Object.values(linkReferences).flatMap(refs => Object.keys(refs));

    // The generic deployer deploys exactly the libraries in libraryCode and links exactly the names in
    // linkReferences, so a name in one but not the other is either a deployment failure or a wasted deployment.
    it('supplies code for every link reference the compiler emitted', () => {
      expect(linkedNames.filter(name => !(name in libraryCode))).toEqual([]);
    });

    it('carries no library the rollup bytecode does not link against', () => {
      expect(Object.keys(libraryCode).filter(name => !linkedNames.includes(name))).toEqual([]);
    });

    it('exports nonempty bytecode for every library', () => {
      for (const [name, lib] of Object.entries(libraryCode)) {
        expect(`${name}:${lib.contractBytecode.slice(0, 2)}`).toEqual(`${name}:0x`);
        expect(lib.contractBytecode.length).toBeGreaterThan(2);
      }
    });
  });
});
