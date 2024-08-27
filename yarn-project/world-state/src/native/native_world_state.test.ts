import { MerkleTreeId } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';

import { jest } from '@jest/globals';
import { decode, encode } from 'msgpackr';

import {
  MessageHeader,
  TypedMessage,
  WorldStateMessageType,
  type WorldStateRequest,
  type WorldStateResponse,
  worldStateRevision,
} from './message.js';
import { type NativeInstance, NativeWorldStateService } from './native_world_state.js';

describe('NativeWorldState', () => {
  let call: jest.MockedFunction<NativeInstance['call']>;
  let worldState: WorldStateWithMockedInstance;

  beforeEach(() => {
    call = jest.fn();
    worldState = new WorldStateWithMockedInstance({ call });
  });

  afterEach(async () => {
    await worldState.stop();
  });

  it('encodes responses', async () => {
    const expectedResponse: WorldStateResponse[WorldStateMessageType.GET_TREE_INFO] = {
      treeId: MerkleTreeId.NULLIFIER_TREE,
      depth: 20,
      root: new Fr(42).toBuffer(),
      size: 128n,
    };

    call.mockResolvedValueOnce(
      encode(
        new TypedMessage(WorldStateMessageType.GET_TREE_INFO, new MessageHeader({ requestId: 1 }), expectedResponse),
      ),
    );

    const treeInfo = await worldState.getTreeInfo(MerkleTreeId.NULLIFIER_TREE, false);
    expect(treeInfo).toEqual(expectedResponse);
  });

  it.each([true, false])('encodes messages with includeUncommitted=%s', async includeUncommitted => {
    const expectedResponse: WorldStateResponse[WorldStateMessageType.GET_TREE_INFO] = {
      treeId: MerkleTreeId.NULLIFIER_TREE,
      depth: 20,
      root: new Fr(42).toBuffer(),
      size: 128n,
    };

    call.mockResolvedValueOnce(
      encode(
        new TypedMessage(WorldStateMessageType.GET_TREE_INFO, new MessageHeader({ requestId: 1 }), expectedResponse),
      ),
    );

    await worldState.getTreeInfo(MerkleTreeId.NULLIFIER_TREE, includeUncommitted);
    expect(call).toHaveBeenCalled();

    const msg: TypedMessage<
      WorldStateMessageType.GET_TREE_INFO,
      WorldStateRequest[WorldStateMessageType.GET_TREE_INFO]
    > = decode(call.mock.calls[0][0]);

    expect(msg.msgType).toBe(WorldStateMessageType.GET_TREE_INFO);
    expect(msg.header.messageId).toBeGreaterThan(0);
    expect(msg.value).toEqual({
      treeId: MerkleTreeId.NULLIFIER_TREE,
      revision: worldStateRevision(includeUncommitted),
    });
  });

  it.each([
    [encode(undefined), 'Invalid response: expected TypedMessageLike, got undefined'],
    [undefined, 'Invalid encoded response: expected Buffer or ArrayBuffer, got undefined'],
    [encode(null), 'Invalid response: expected TypedMessageLike, got null'],
    [null, 'Invalid encoded response: expected Buffer or ArrayBuffer, got null'],
    [encode({}), 'Invalid response: expected TypedMessageLike, got object'],
    [
      encode(new TypedMessage(WorldStateMessageType.GET_TREE_INFO, new MessageHeader({ requestId: 100 }), {})),
      'Response ID does not match request',
    ],
    [
      encode(new TypedMessage(WorldStateMessageType.COMMIT, new MessageHeader({ requestId: 1 }), {})),
      'Invalid response message type',
    ],
  ])('rejects invalid responses', async (resp, expectedError) => {
    call.mockResolvedValueOnce(resp);
    await expect(worldState.getTreeInfo(MerkleTreeId.NULLIFIER_TREE, false)).rejects.toThrow(expectedError);
  });
});

class WorldStateWithMockedInstance extends NativeWorldStateService {
  constructor(instance: NativeInstance) {
    super(instance);
  }
}
