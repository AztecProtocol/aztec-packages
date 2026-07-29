// `SiblingPath` lives in `foundation`, which cannot import `@aztec/constants` because `constants` depends on it,
// so the check that its length cap covers every protocol tree lives here instead.
import * as constants from '@aztec/constants';
import { MAX_SIBLING_PATH_LENGTH } from '@aztec/foundation/trees';

describe('MAX_SIBLING_PATH_LENGTH', () => {
  const treeHeights = Object.entries(constants).filter(
    (entry): entry is [string, number] => entry[0].endsWith('_HEIGHT') && typeof entry[1] === 'number',
  );

  it('finds the tree height constants to check against', () => {
    expect(treeHeights.length).toBeGreaterThan(0);
  });

  it.each(treeHeights)('is at least as large as %s', (_name, height) => {
    expect(height).toBeLessThanOrEqual(MAX_SIBLING_PATH_LENGTH);
  });
});
