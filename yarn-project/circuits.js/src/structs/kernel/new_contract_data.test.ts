import { makeNewContractData } from "../../tests/factories.js";
import { NewContractData } from "./new_contract_data.js";

describe('NewContractData', () => {
  let read: NewContractData;

  beforeAll(() => {
    const randomInt = Math.floor(Math.random() * 1000);
    read = makeNewContractData(randomInt);
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = read.toBuffer();
    const res = NewContractData.fromBuffer(buffer);
    expect(res).toEqual(read);
  });

  it('computes contract leaf', () => {
    const cd = makeNewContractData(12);
    const res = cd.computeLeaf();
    expect(res).toMatchSnapshot();
  });
});
