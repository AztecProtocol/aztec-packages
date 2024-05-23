import { type L1ToL2Message, NullifierMembershipWitness, SiblingPath } from '@aztec/circuit-types';
import {
  AppendOnlyTreeSnapshot,
  CallContext,
  Gas,
  GasFees,
  GlobalVariables,
  type Header,
  L1_TO_L2_MSG_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  NullifierLeaf,
  NullifierLeafPreimage,
} from '@aztec/circuits.js';
import { computeInnerNoteHash, computeNoteContentHash, siloNullifier } from '@aztec/circuits.js/hash';
import { makeHeader, makeTxContext } from '@aztec/circuits.js/testing';
import { type FunctionArtifact, FunctionSelector, encodeArguments } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { pedersenHash, randomInt } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/utils';
import { Pedersen, StandardIndexedTreeWithAppend } from '@aztec/merkle-tree';
import { ChildContractArtifact } from '@aztec/noir-contracts.js/Child';
import { ParentContractArtifact } from '@aztec/noir-contracts.js/Parent';
import { TestContractArtifact } from '@aztec/noir-contracts.js/Test';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';

import { type MockProxy, mock } from 'jest-mock-extended';
import { type MemDown, default as memdown } from 'memdown';
import { toFunctionSelector } from 'viem';

import { MessageLoadOracleInputs } from '../index.js';
import { buildL1ToL2Message } from '../test/utils.js';
import { computeSlotForMapping } from '../utils.js';
import { type CommitmentsDB, type PublicContractsDB, type PublicStateDB } from './db.js';
import { type PublicExecution } from './execution.js';
import { PublicExecutor } from './executor.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

// TODO(https://github.com/AztecProtocol/aztec-packages/issues/5818): remove.
describe.skip('ACIR public execution simulator', () => {
  let publicState: MockProxy<PublicStateDB>;
  let publicContracts: MockProxy<PublicContractsDB>;
  let commitmentsDb: MockProxy<CommitmentsDB>;
  let executor: PublicExecutor;
  let header: Header;

  const globalVariables = GlobalVariables.empty();

  beforeEach(() => {
    publicState = mock<PublicStateDB>();
    publicContracts = mock<PublicContractsDB>();
    commitmentsDb = mock<CommitmentsDB>();

    header = makeHeader(randomInt(1000000));

    executor = new PublicExecutor(publicState, publicContracts, commitmentsDb, header);
  }, 10000);

  const mockInitializationNullifierCallback = async (contractAddress: AztecAddress) => {
    // We create a nullifier tree just to get the membership witness for the token contract
    // initialization nullifier, which is checked by all of the Token contract functions.
    const nullifierTree = new StandardIndexedTreeWithAppend(
      openTmpStore(),
      new Pedersen(),
      'nullifier',
      NULLIFIER_TREE_HEIGHT,
      0n,
      NullifierLeafPreimage,
      NullifierLeaf,
    );
    await nullifierTree.init(1);
    const initializationNullifier = siloNullifier(contractAddress, contractAddress.toField());
    await nullifierTree.appendLeaves([initializationNullifier.toBuffer()]);
    header.state.partial.nullifierTree.root = Fr.fromBuffer(nullifierTree.getRoot(true));
    commitmentsDb.getNullifierMembershipWitnessAtLatestBlock.mockImplementation(async nullifier => {
      if (nullifier.equals(initializationNullifier)) {
        const index = 1n;
        const preimage = nullifierTree.getLatestLeafPreimageCopy(index, true);
        const siblingPath = await nullifierTree.getSiblingPath<typeof NULLIFIER_TREE_HEIGHT>(index, true);
        return new NullifierMembershipWitness(index, preimage as NullifierLeafPreimage, siblingPath);
      } else {
        throw new Error(`Unexpected nullifier witness request for ${nullifier}`);
      }
    });
  };

  const makeCallContext = (storageContractAddress: AztecAddress, overrides: Partial<CallContext> = {}) =>
    CallContext.from({
      storageContractAddress,
      msgSender: AztecAddress.random(),
      functionSelector: FunctionSelector.empty(),
      isDelegateCall: false,
      isStaticCall: false,
      sideEffectCounter: 0,
      ...overrides,
    });

  const simulate = (execution: PublicExecution, globalVariables: GlobalVariables) =>
    executor.simulate(execution, globalVariables, Gas.test(), makeTxContext(), /*pendingNullifiers=*/ [], Fr.ZERO);

  describe('Token contract', () => {
    let recipient: AztecAddress;
    let contractAddress: AztecAddress;

    beforeEach(async () => {
      recipient = AztecAddress.random();
      contractAddress = AztecAddress.random();
      await mockInitializationNullifierCallback(contractAddress);
    });

    describe('mint', () => {
      it('should run the mint_public function', async () => {
        const mintArtifact = TokenContractArtifact.functions.find(f => f.name === 'mint_public')!;
        const functionSelector = FunctionSelector.fromNameAndParameters(mintArtifact.name, mintArtifact.parameters);

        const mintAmount = 140n;
        const args = encodeArguments(mintArtifact, [recipient, mintAmount]);

        const msgSender = AztecAddress.random();
        const callContext = makeCallContext(contractAddress, { msgSender });

        publicContracts.getBytecode.mockResolvedValue(mintArtifact.bytecode);

        // Mock the old value for the recipient balance to be 20
        const isMinter = new Fr(1n); // 1n means true
        const previousBalance = new Fr(20n);
        const previousTotalSupply = new Fr(previousBalance.value + 100n);
        publicState.storageRead
          .mockResolvedValueOnce(isMinter) // reading whether msg_sender is minter
          .mockResolvedValueOnce(previousBalance) // reading user's balance
          .mockResolvedValueOnce(previousTotalSupply); // reading total supply

        const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
        const result = await simulate(execution, globalVariables);
        expect(result.revertReason).toBeUndefined();

        const recipientBalanceStorageSlot = computeSlotForMapping(new Fr(6n), recipient);
        const totalSupplyStorageSlot = new Fr(4n);

        const expectedBalance = new Fr(previousBalance.value + mintAmount);
        const expectedTotalSupply = new Fr(previousTotalSupply.value + mintAmount);
        // There should be 2 storage updates, one for the recipient's balance and one for the total supply
        expect(result.contractStorageUpdateRequests).toEqual([
          {
            contractAddress,
            storageSlot: recipientBalanceStorageSlot,
            newValue: expectedBalance,
            sideEffectCounter: 3,
          },
          {
            contractAddress,
            storageSlot: totalSupplyStorageSlot,
            newValue: expectedTotalSupply,
            sideEffectCounter: 4,
          },
        ]);

        const mintersStorageSlot = new Fr(2n);
        const isMinterStorageSlot = computeSlotForMapping(mintersStorageSlot, msgSender);
        // Note: There is only 1 storage read (for the isMinter value) because the other 2 reads get overwritten by
        // the updates
        expect(result.contractStorageReads).toEqual([
          {
            contractAddress,
            storageSlot: isMinterStorageSlot,
            currentValue: isMinter,
            sideEffectCounter: 0,
          },
        ]);
      });
    });

    describe('transfer', () => {
      let transferArtifact: FunctionArtifact;
      let functionSelector: FunctionSelector;
      let args: Fr[];
      let sender: AztecAddress;
      let callContext: CallContext;
      let recipientStorageSlot: Fr;
      let senderStorageSlot: Fr;
      let execution: PublicExecution;

      beforeEach(() => {
        transferArtifact = TokenContractArtifact.functions.find(f => f.name === 'transfer_public')!;
        functionSelector = FunctionSelector.fromNameAndParameters(transferArtifact.name, transferArtifact.parameters);
        sender = AztecAddress.random();
        args = encodeArguments(transferArtifact, [sender, recipient, 140n, 0n]);

        callContext = makeCallContext(contractAddress, { msgSender: sender });
        recipientStorageSlot = computeSlotForMapping(new Fr(6n), recipient);
        senderStorageSlot = computeSlotForMapping(new Fr(6n), sender);

        publicContracts.getBytecode.mockResolvedValue(transferArtifact.bytecode);

        execution = { contractAddress, functionSelector, args, callContext };
      });

      const mockStore = (senderBalance: Fr, recipientBalance: Fr) => {
        // eslint-disable-next-line require-await
        publicState.storageRead.mockImplementation(async (_addr: AztecAddress, slot: Fr) => {
          if (slot.equals(recipientStorageSlot)) {
            return recipientBalance;
          } else if (slot.equals(senderStorageSlot)) {
            return senderBalance;
          } else {
            return Fr.ZERO;
          }
        });
      };

      it('should run the transfer function', async () => {
        const senderBalance = new Fr(200n);
        const recipientBalance = new Fr(20n);
        mockStore(senderBalance, recipientBalance);

        const result = await simulate(execution, globalVariables);

        const expectedRecipientBalance = new Fr(160n);
        const expectedSenderBalance = new Fr(60n);

        expect(result.contractStorageUpdateRequests).toEqual([
          {
            contractAddress,
            storageSlot: senderStorageSlot,
            newValue: expectedSenderBalance,
            sideEffectCounter: 1, // 1 read (sender balance)
          },
          {
            contractAddress,
            storageSlot: recipientStorageSlot,
            newValue: expectedRecipientBalance,
            sideEffectCounter: 3, // 1 read (sender balance), 1 write (new sender balance), 1 read (recipient balance)
          },
        ]);

        expect(result.contractStorageReads).toEqual([]);
      });

      it('should throw underflow error when executing transfer function without enough sender balance', async () => {
        const senderBalance = new Fr(10n);
        const recipientBalance = new Fr(20n);
        mockStore(senderBalance, recipientBalance);

        const { reverted, revertReason } = await simulate(execution, globalVariables);
        expect(reverted).toBe(true);
        expect(revertReason?.message).toMatch('Assertion failed: attempt to subtract with underflow');
      });
    });
  });

  describe('Parent/Child contracts', () => {
    let parentContractAddress: AztecAddress;
    let childContractAddress: AztecAddress;
    let parentEntryPointFn: FunctionArtifact;
    let parentEntryPointFnSelector: FunctionSelector;
    let functionSelector: FunctionSelector;
    let callContext: CallContext;

    beforeEach(() => {
      parentContractAddress = AztecAddress.random();
      parentEntryPointFn = ParentContractArtifact.functions.find(f => f.name === 'pub_entry_point')!;
      parentEntryPointFnSelector = FunctionSelector.fromNameAndParameters(
        parentEntryPointFn.name,
        parentEntryPointFn.parameters,
      );
      childContractAddress = AztecAddress.random();
      callContext = makeCallContext(parentContractAddress);
    }, 10000);

    it('calls the public entry point in the parent to get value', async () => {
      const childValueFn = ChildContractArtifact.functions.find(f => f.name === 'pub_get_value')!;
      const childValueFnSelector = FunctionSelector.fromNameAndParameters(childValueFn.name, childValueFn.parameters);

      const initialValue = 3n;
      const args = encodeArguments(parentEntryPointFn, [childContractAddress, childValueFnSelector, initialValue]);

      // eslint-disable-next-line require-await
      publicContracts.getBytecode.mockImplementation(async (addr: AztecAddress, selector: FunctionSelector) => {
        if (addr.equals(parentContractAddress) && selector.equals(parentEntryPointFnSelector)) {
          return parentEntryPointFn.bytecode;
        } else if (addr.equals(childContractAddress) && selector.equals(childValueFnSelector)) {
          return childValueFn.bytecode;
        } else {
          return undefined;
        }
      });

      const execution: PublicExecution = {
        contractAddress: parentContractAddress,
        functionSelector,
        args,
        callContext,
      };
      const globalVariables = new GlobalVariables(
        new Fr(69),
        new Fr(420),
        new Fr(1),
        new Fr(7),
        EthAddress.fromField(new Fr(8)),
        AztecAddress.fromField(new Fr(9)),
        new GasFees(new Fr(10), new Fr(11)),
      );

      const result = await simulate(execution, globalVariables);
      expect(result.returnValues[0]).toEqual(
        new Fr(
          initialValue +
            globalVariables.chainId.toBigInt() +
            globalVariables.version.toBigInt() +
            globalVariables.blockNumber.toBigInt() +
            globalVariables.timestamp.toBigInt(),
        ),
      );
    }, 20_000);

    it('calls the public entry point in the parent to set value', async () => {
      const childValueFn = ChildContractArtifact.functions.find(f => f.name === 'pub_set_value')!;
      const childValueFnSelector = FunctionSelector.fromNameAndParameters(childValueFn.name, childValueFn.parameters);

      const newValue = 5n;

      const args = encodeArguments(parentEntryPointFn, [childContractAddress, childValueFnSelector, newValue]);

      // eslint-disable-next-line require-await
      publicContracts.getBytecode.mockImplementation(async (addr: AztecAddress, selector: FunctionSelector) => {
        if (addr.equals(parentContractAddress) && selector.equals(parentEntryPointFnSelector)) {
          return parentEntryPointFn.bytecode;
        } else if (addr.equals(childContractAddress) && selector.equals(childValueFnSelector)) {
          return childValueFn.bytecode;
        } else {
          return undefined;
        }
      });

      const execution: PublicExecution = {
        contractAddress: parentContractAddress,
        functionSelector,
        args,
        callContext,
      };

      const result = await simulate(execution, globalVariables);
      const childExecutionResult = result.nestedExecutions[0];
      expect(Fr.fromBuffer(childExecutionResult.unencryptedLogs.logs[0].data)).toEqual(new Fr(newValue));
      expect(Fr.fromBuffer(childExecutionResult.unencryptedLogs.logs[0].hash())).toEqual(
        childExecutionResult.unencryptedLogsHashes[0].value,
      );
      expect(childExecutionResult.unencryptedLogsHashes[0].length).toEqual(
        new Fr(childExecutionResult.unencryptedLogs.getKernelLength()),
      );
      expect(result.returnValues[0]).toEqual(new Fr(newValue));
    }, 20_000);
  });

  describe('Public -> Private / Cross Chain messaging', () => {
    let contractAddress: AztecAddress;
    let functionSelector: FunctionSelector;
    let amount: Fr;
    let params: Fr[];

    beforeEach(async () => {
      contractAddress = AztecAddress.random();
      await mockInitializationNullifierCallback(contractAddress);
      functionSelector = FunctionSelector.empty();
      amount = new Fr(1);
      params = [amount, new Fr(1)];
    });

    it('Should be able to create a note hash from the public context', async () => {
      const shieldArtifact = TokenContractArtifact.functions.find(f => f.name === 'shield')!;
      const msgSender = AztecAddress.random();
      const secretHash = Fr.random();

      const args = encodeArguments(shieldArtifact, [msgSender, amount, secretHash, Fr.ZERO]);
      const callContext = makeCallContext(contractAddress, { msgSender });

      publicContracts.getBytecode.mockResolvedValue(shieldArtifact.bytecode);
      // mock initial balance to be greater than the amount being sent
      publicState.storageRead.mockResolvedValue(amount);

      const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
      const result = await simulate(execution, globalVariables);

      // Assert the note hash was created
      expect(result.newNoteHashes.length).toEqual(1);

      const expectedNoteHash = computeNoteContentHash([amount, secretHash]);
      const storageSlot = TokenContractArtifact.storageLayout['pending_shields'].slot;
      const expectedInnerNoteHash = computeInnerNoteHash(storageSlot, expectedNoteHash);
      expect(result.newNoteHashes[0].value).toEqual(expectedInnerNoteHash);
    });

    it('Should be able to create a L2 to L1 message from the public context', async () => {
      const createL2ToL1MessagePublicArtifact = TestContractArtifact.functions.find(
        f => f.name === 'create_l2_to_l1_message_public',
      )!;
      const portalContractAddress = EthAddress.random();
      const args = encodeArguments(createL2ToL1MessagePublicArtifact, [...params, portalContractAddress]);

      const callContext = makeCallContext(contractAddress);

      publicContracts.getBytecode.mockResolvedValue(createL2ToL1MessagePublicArtifact.bytecode);

      const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
      const result = await simulate(execution, globalVariables);

      // Assert the l2 to l1 message was created
      expect(result.newL2ToL1Messages.length).toEqual(1);
      expect(result.newL2ToL1Messages[0].recipient).toEqual(portalContractAddress);
      expect(result.newL2ToL1Messages[0].content).toEqual(pedersenHash(params));
    });

    it('Should be able to create a nullifier from the public context', async () => {
      const createNullifierPublicArtifact = TestContractArtifact.functions.find(
        f => f.name === 'emit_nullifier_public',
      )!;

      const nullifier = new Fr(1234);
      const args = encodeArguments(createNullifierPublicArtifact, [nullifier]);

      const callContext = makeCallContext(contractAddress);

      publicContracts.getBytecode.mockResolvedValue(createNullifierPublicArtifact.bytecode);

      const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
      const result = await simulate(execution, globalVariables);

      expect(result.newNullifiers).toEqual([expect.objectContaining({ value: nullifier })]);
    });

    describe('L1 to L2 messages', () => {
      const mintPublicArtifact = TestContractArtifact.functions.find(f => f.name === 'consume_mint_public_message')!;

      const tokenRecipient = AztecAddress.random();
      let bridgedAmount = 20n;
      let secret = new Fr(1);
      let leafIndex: bigint;

      let crossChainMsgRecipient: AztecAddress | undefined;
      let crossChainMsgSender: EthAddress | undefined;

      let preimage: L1ToL2Message;
      let globalVariables: GlobalVariables;

      let args: Fr[];
      let callContext: CallContext;

      beforeEach(() => {
        bridgedAmount = 20n;
        secret = new Fr(1);
        leafIndex = 0n;

        crossChainMsgRecipient = undefined;
        crossChainMsgSender = undefined;
      });

      const computePreImage = () =>
        buildL1ToL2Message(
          toFunctionSelector('mint_public(bytes32,uint256)').substring(2),
          [tokenRecipient.toField(), new Fr(bridgedAmount)],
          crossChainMsgRecipient ?? contractAddress,
          secret,
        );

      const computeArgs = () =>
        encodeArguments(mintPublicArtifact, [
          tokenRecipient,
          bridgedAmount,
          secret,
          leafIndex,
          crossChainMsgSender ?? preimage.sender.sender,
        ]);

      const computeCallContext = () => makeCallContext(contractAddress);

      const computeGlobalVariables = () =>
        new GlobalVariables(
          new Fr(preimage.sender.chainId),
          new Fr(preimage.recipient.version),
          Fr.ZERO,
          Fr.ZERO,
          EthAddress.ZERO,
          AztecAddress.ZERO,
          GasFees.empty(),
        );

      const mockOracles = (updateState = true) => {
        publicContracts.getBytecode.mockResolvedValue(mintPublicArtifact.bytecode);
        publicState.storageRead.mockResolvedValue(Fr.ZERO);

        const siblingPathBuffers = Array(L1_TO_L2_MSG_TREE_HEIGHT)
          .fill(Fr.random())
          .map(f => f.toBuffer());
        const siblingPath = new SiblingPath(L1_TO_L2_MSG_TREE_HEIGHT, siblingPathBuffers);

        let root = preimage.hash();
        for (const sibling of siblingPathBuffers) {
          root = pedersenHash([root, sibling]);
        }
        commitmentsDb.getL1ToL2MembershipWitness.mockImplementation(() => {
          return Promise.resolve(new MessageLoadOracleInputs(leafIndex, siblingPath));
        });

        if (updateState) {
          header.state.l1ToL2MessageTree = new AppendOnlyTreeSnapshot(
            root,
            1, // we set 1 message in the tree
          );
        }
      };

      it('Should be able to consume an L1 to L2 message in the public context', async () => {
        preimage = computePreImage();

        args = computeArgs();
        callContext = computeCallContext();

        // Prepare the state
        mockOracles();
        globalVariables = computeGlobalVariables();

        const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
        executor = new PublicExecutor(publicState, publicContracts, commitmentsDb, header);
        const result = await simulate(execution, globalVariables);
        expect(result.newNullifiers.length).toEqual(1);
      });

      it('Invalid membership proof', async () => {
        preimage = computePreImage();
        args = computeArgs();
        callContext = computeCallContext();

        // Mock oracles but don't update state
        mockOracles(false);

        // Prepare the state
        globalVariables = computeGlobalVariables();

        const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
        executor = new PublicExecutor(publicState, publicContracts, commitmentsDb, header);
        const { revertReason, reverted } = await simulate(execution, globalVariables);
        expect(reverted).toBe(true);
        expect(revertReason?.message).toMatch(`Message not in state`);
      });

      it('Invalid recipient', async () => {
        crossChainMsgRecipient = AztecAddress.random();
        preimage = computePreImage();
        args = computeArgs();
        callContext = computeCallContext();

        // Prepare the state
        mockOracles();
        globalVariables = computeGlobalVariables();

        const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
        executor = new PublicExecutor(publicState, publicContracts, commitmentsDb, header);
        const { revertReason, reverted } = await simulate(execution, globalVariables);
        expect(reverted).toBe(true);
        expect(revertReason?.message).toMatch(`Message not in state`);
      });

      it('Invalid sender', async () => {
        crossChainMsgSender = EthAddress.random();
        preimage = computePreImage();
        args = computeArgs();
        callContext = computeCallContext();

        // Prepare the state
        mockOracles();
        globalVariables = computeGlobalVariables();

        const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
        executor = new PublicExecutor(publicState, publicContracts, commitmentsDb, header);
        const { revertReason, reverted } = await simulate(execution, globalVariables);
        expect(reverted).toBe(true);
        expect(revertReason?.message).toMatch(`Message not in state`);
      });

      it('Invalid chainid', async () => {
        preimage = computePreImage();
        args = computeArgs();
        callContext = computeCallContext();

        // Prepare the state
        mockOracles();
        globalVariables = computeGlobalVariables();
        globalVariables.chainId = Fr.random();

        const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
        executor = new PublicExecutor(publicState, publicContracts, commitmentsDb, header);
        const { revertReason, reverted } = await simulate(execution, globalVariables);
        expect(reverted).toBe(true);
        expect(revertReason?.message).toMatch(`Message not in state`);
      });

      it('Invalid version', async () => {
        preimage = computePreImage();
        args = computeArgs();
        callContext = computeCallContext();

        // Prepare the state
        mockOracles();
        globalVariables = computeGlobalVariables();
        globalVariables.version = Fr.random();

        const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
        executor = new PublicExecutor(publicState, publicContracts, commitmentsDb, header);
        const { revertReason, reverted } = await simulate(execution, globalVariables);
        expect(reverted).toBe(true);
        expect(revertReason?.message).toMatch(`Message not in state`);
      });

      it('Invalid Content', async () => {
        preimage = computePreImage();

        bridgedAmount = bridgedAmount + 1n; // Invalid amount
        args = computeArgs();
        callContext = computeCallContext();

        // Prepare the state
        mockOracles();
        globalVariables = computeGlobalVariables();

        const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
        executor = new PublicExecutor(publicState, publicContracts, commitmentsDb, header);
        const { revertReason, reverted } = await simulate(execution, globalVariables);
        expect(reverted).toBe(true);
        expect(revertReason?.message).toMatch(`Message not in state`);
      });

      it('Invalid secret', async () => {
        preimage = computePreImage();

        secret = Fr.random(); // Invalid secret
        args = computeArgs();
        callContext = computeCallContext();

        // Prepare the state
        mockOracles();
        globalVariables = computeGlobalVariables();

        const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
        executor = new PublicExecutor(publicState, publicContracts, commitmentsDb, header);
        const { revertReason, reverted } = await simulate(execution, globalVariables);
        expect(reverted).toBe(true);
        expect(revertReason?.message).toMatch(`Message not in state`);
      });
    });
  });

  describe('Global variables in public context', () => {
    let contractAddress: AztecAddress;
    let callContext: CallContext;
    let assertGlobalVarsArtifact: FunctionArtifact;
    let functionSelector: FunctionSelector;

    const modifyGlobalVariables = (globalVariables: GlobalVariables, propertyIndex: number, value: any) => {
      const globalVariablesFields = globalVariables.toFields();
      globalVariablesFields[propertyIndex] = value;
      return GlobalVariables.fromFields(globalVariablesFields);
    };

    beforeAll(() => {
      contractAddress = AztecAddress.random();
      callContext = makeCallContext(AztecAddress.random());
      assertGlobalVarsArtifact = TestContractArtifact.functions.find(f => f.name === 'assert_public_global_vars')!;
      functionSelector = FunctionSelector.fromNameAndParameters(
        assertGlobalVarsArtifact.name,
        assertGlobalVarsArtifact.parameters,
      );
    });

    beforeEach(() => {
      publicContracts.getBytecode.mockResolvedValue(assertGlobalVarsArtifact.bytecode);
    });

    // Note: Order here has to match the order of the properties in GlobalVariables.getFields(...) function.
    const testCases = [
      { value: new Fr(1), invalidValue: Fr.random(), description: 'Chain ID' },
      { value: new Fr(1), invalidValue: Fr.random(), description: 'Version' },
      { value: new Fr(1), invalidValue: Fr.random(), description: 'Block number' },
      { value: new Fr(1), invalidValue: Fr.random(), description: 'Timestamp' },
      { value: new Fr(1), invalidValue: Fr.random(), description: 'Fee per DA gas' },
      { value: new Fr(1), invalidValue: Fr.random(), description: 'Fee per L2 gas' },
    ];

    testCases.forEach(({ value, invalidValue, description }, i: number) => {
      describe(`${description}`, () => {
        let globalVariables: GlobalVariables;

        beforeAll(() => {
          // We create a new global variables object containing non-zero value in place of the tested property
          globalVariables = modifyGlobalVariables(GlobalVariables.empty(), i, value);
        });

        it('Valid', () => {
          let args: Fr[];
          {
            // We create the args by just serializing the reference global variables object
            const rawArgs = globalVariables.toFields();
            args = encodeArguments(assertGlobalVarsArtifact, rawArgs);
          }

          const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
          executor = new PublicExecutor(publicState, publicContracts, commitmentsDb, header);

          expect(() => simulate(execution, globalVariables)).not.toThrow();
        });

        it('Invalid', async () => {
          let args: Fr[];
          {
            // We create the args by modifying the global variables object to contain an invalid value in place of
            // the tested property
            const modifiedGlobalVariables = modifyGlobalVariables(globalVariables, i, invalidValue);
            const rawArgs = modifiedGlobalVariables.toFields();
            args = encodeArguments(assertGlobalVarsArtifact, rawArgs);
          }

          const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
          executor = new PublicExecutor(publicState, publicContracts, commitmentsDb, header);

          const { revertReason, reverted } = await simulate(execution, globalVariables);
          expect(reverted).toBe(true);
          expect(revertReason?.message).toMatch(`Invalid ${description.toLowerCase()}`);
        });
      });
    });
  });

  // TODO(4840): add AVM opcodes for getting header (members)
  describe.skip('Historical header in public context', () => {
    let contractAddress: AztecAddress;
    let callContext: CallContext;
    let assertHeaderPublicArtifact: FunctionArtifact;
    let functionSelector: FunctionSelector;

    beforeAll(() => {
      contractAddress = AztecAddress.random();
      callContext = makeCallContext(AztecAddress.random());
      assertHeaderPublicArtifact = TestContractArtifact.functions.find(f => f.name === 'assert_header_public')!;
      functionSelector = FunctionSelector.fromNameAndParameters(
        assertHeaderPublicArtifact.name,
        assertHeaderPublicArtifact.parameters,
      );
    });

    beforeEach(() => {
      publicContracts.getBytecode.mockResolvedValue(assertHeaderPublicArtifact.bytecode);
    });

    it('Header is correctly set', () => {
      const args = encodeArguments(assertHeaderPublicArtifact, [header.hash()]);

      const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
      executor = new PublicExecutor(publicState, publicContracts, commitmentsDb, header);

      expect(() => simulate(execution, globalVariables)).not.toThrow();
    });

    it('Throws when header is not as expected', async () => {
      const unexpectedHeaderHash = Fr.random();
      const args = encodeArguments(assertHeaderPublicArtifact, [unexpectedHeaderHash]);

      const execution: PublicExecution = { contractAddress, functionSelector, args, callContext };
      executor = new PublicExecutor(publicState, publicContracts, commitmentsDb, header);

      const { revertReason, reverted } = await simulate(execution, globalVariables);
      expect(reverted).toBe(true);
      expect(revertReason?.message).toMatch(`Invalid header hash`);
    });
  });
});
