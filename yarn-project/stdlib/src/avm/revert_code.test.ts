import { Fr } from '@aztec/foundation/curves/bn254';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { RevertCode } from './revert_code.js';

describe('revert_code', () => {
  it.each([RevertCode.OK, RevertCode.REVERTED])('should serialize %s properly', revertCode => {
    expect(revertCode.getSerializedLength()).toBe(1);

    const hashPreimage = revertCode.toHashPreimage();
    expect(hashPreimage).toMatchSnapshot();
    expect(hashPreimage.length).toBe(32);

    const buf = revertCode.toBuffer();
    expect(buf).toMatchSnapshot();
    expect(RevertCode.fromBuffer(buf)).toEqual(revertCode);

    const field = revertCode.toField();
    expect(field).toMatchSnapshot();
    expect(RevertCode.fromField(field)).toEqual(revertCode);
    expect(RevertCode.fromFields([field])).toEqual(revertCode);

    const json = jsonStringify(revertCode);
    expect(RevertCode.schema.parse(JSON.parse(json))).toEqual(revertCode);
  });

  it('should coerce values >= 1 to REVERTED', () => {
    expect(RevertCode.fromNumber(2)).toEqual(RevertCode.REVERTED);
    expect(RevertCode.fromNumber(3)).toEqual(RevertCode.REVERTED);
    expect(RevertCode.fromNumber(42)).toEqual(RevertCode.REVERTED);
    expect(RevertCode.fromField(new Fr(42))).toEqual(RevertCode.REVERTED);
    expect(RevertCode.fromBuffer(Buffer.from([5]))).toEqual(RevertCode.REVERTED);
  });
});
