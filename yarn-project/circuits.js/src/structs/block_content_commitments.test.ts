import { BLOCK_CONTENT_COMMITMENTS_LENGTH } from '../constants.gen.js';
import { makeContentCommitment } from '../tests/factories.js';
import { BlockContentCommitments } from './block_content_commitments.js';

describe('Content Commitment', () => {
  let blockContentCommitments: BlockContentCommitments;

  beforeAll(() => {
    const randomInt = Math.floor(Math.random() * 1000);
    blockContentCommitments = makeContentCommitment(randomInt);
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = blockContentCommitments.toBuffer();
    const res = BlockContentCommitments.fromBuffer(buffer);
    expect(res).toEqual(blockContentCommitments);
  });

  it('serializes to field array and deserializes it back', () => {
    const fieldArray = blockContentCommitments.toFields();
    const res = BlockContentCommitments.fromFields(fieldArray);
    expect(res).toEqual(blockContentCommitments);
  });

  it('number of fields matches constant', () => {
    const fields = blockContentCommitments.toFields();
    expect(fields.length).toBe(BLOCK_CONTENT_COMMITMENTS_LENGTH);
  });
});
