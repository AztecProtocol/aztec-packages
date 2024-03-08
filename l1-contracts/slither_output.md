Summary
 - [uninitialized-local](#uninitialized-local) (3 results) (Medium)
 - [unused-return](#unused-return) (2 results) (Medium)
 - [missing-zero-check](#missing-zero-check) (2 results) (Low)
 - [reentrancy-events](#reentrancy-events) (2 results) (Low)
 - [timestamp](#timestamp) (4 results) (Low)
 - [assembly](#assembly) (2 results) (Informational)
 - [dead-code](#dead-code) (5 results) (Informational)
 - [solc-version](#solc-version) (1 results) (Informational)
 - [low-level-calls](#low-level-calls) (1 results) (Informational)
 - [similar-names](#similar-names) (4 results) (Informational)
 - [constable-states](#constable-states) (1 results) (Optimization)
## uninitialized-local
Impact: Medium
Confidence: Medium
 - [ ] ID-0
[HeaderLib.decode(bytes).header](src/core/libraries/HeaderLib.sol#L150) is a local variable never initialized

src/core/libraries/HeaderLib.sol#L150


 - [ ] ID-1
[TxsDecoder.decode(bytes).vars](src/core/libraries/decoders/TxsDecoder.sol#L86) is a local variable never initialized

src/core/libraries/decoders/TxsDecoder.sol#L86


 - [ ] ID-2
[NewOutbox._verifyMembership(bytes32[],DataStructures.L2ToL1Msg,uint256,bytes32).root](src/core/messagebridge/NewOutbox.sol#L125) is a local variable never initialized

src/core/messagebridge/NewOutbox.sol#L125


## unused-return
Impact: Medium
Confidence: Medium
 - [ ] ID-3
[Rollup.process(bytes,bytes32,bytes,bytes)](src/core/Rollup.sol#L58-L103) ignores return value by [NEW_INBOX.consume()](src/core/Rollup.sol#L93)

src/core/Rollup.sol#L58-L103


 - [ ] ID-4
[Rollup.process(bytes,bytes32,bytes,bytes)](src/core/Rollup.sol#L58-L103) ignores return value by [(l1ToL2Msgs,l2ToL1Msgs) = MessagesDecoder.decode(_body)](src/core/Rollup.sol#L74)

src/core/Rollup.sol#L58-L103


## missing-zero-check
Impact: Low
Confidence: Medium
 - [ ] ID-5
[NewInbox.constructor(address,uint256)._rollup](src/core/messagebridge/NewInbox.sol#L41) lacks a zero-check on :
		- [ROLLUP = _rollup](src/core/messagebridge/NewInbox.sol#L42)

src/core/messagebridge/NewInbox.sol#L41


 - [ ] ID-6
[NewOutbox.constructor(address)._stateTransitioner](src/core/messagebridge/NewOutbox.sol#L29) lacks a zero-check on :
		- [STATE_TRANSITIONER = _stateTransitioner](src/core/messagebridge/NewOutbox.sol#L30)

src/core/messagebridge/NewOutbox.sol#L29


## reentrancy-events
Impact: Low
Confidence: Medium
 - [ ] ID-7
Reentrancy in [NewInbox.sendL2Message(DataStructures.L2Actor,bytes32,bytes32)](src/core/messagebridge/NewInbox.sol#L62-L99):
	External calls:
	- [index = currentTree.insertLeaf(leaf)](src/core/messagebridge/NewInbox.sol#L95)
	Event emitted after the call(s):
	- [LeafInserted(inProgress,index,leaf)](src/core/messagebridge/NewInbox.sol#L96)

src/core/messagebridge/NewInbox.sol#L62-L99


 - [ ] ID-8
Reentrancy in [Rollup.process(bytes,bytes32,bytes,bytes)](src/core/Rollup.sol#L58-L103):
	External calls:
	- [inbox.batchConsume(l1ToL2Msgs,msg.sender)](src/core/Rollup.sol#L90)
	- [NEW_INBOX.consume()](src/core/Rollup.sol#L93)
	- [outbox.sendL1Messages(l2ToL1Msgs)](src/core/Rollup.sol#L100)
	Event emitted after the call(s):
	- [L2BlockProcessed(header.globalVariables.blockNumber)](src/core/Rollup.sol#L102)

src/core/Rollup.sol#L58-L103


## timestamp
Impact: Low
Confidence: Medium
 - [ ] ID-9
[Inbox.batchConsume(bytes32[],address)](src/core/messagebridge/Inbox.sol#L122-L143) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp > entry.deadline](src/core/messagebridge/Inbox.sol#L136)

src/core/messagebridge/Inbox.sol#L122-L143


 - [ ] ID-10
[HeaderLib.validate(HeaderLib.Header,uint256,uint256,bytes32)](src/core/libraries/HeaderLib.sol#L108-L138) uses timestamp for comparisons
	Dangerous comparisons:
	- [_header.globalVariables.timestamp > block.timestamp](src/core/libraries/HeaderLib.sol#L122)

src/core/libraries/HeaderLib.sol#L108-L138


 - [ ] ID-11
[Inbox.sendL2Message(DataStructures.L2Actor,uint32,bytes32,bytes32)](src/core/messagebridge/Inbox.sol#L45-L91) uses timestamp for comparisons
	Dangerous comparisons:
	- [_deadline <= block.timestamp](src/core/messagebridge/Inbox.sol#L54)

src/core/messagebridge/Inbox.sol#L45-L91


 - [ ] ID-12
[Inbox.cancelL2Message(DataStructures.L1ToL2Msg,address)](src/core/messagebridge/Inbox.sol#L102-L113) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp <= _message.deadline](src/core/messagebridge/Inbox.sol#L108)

src/core/messagebridge/Inbox.sol#L102-L113


## assembly
Impact: Informational
Confidence: High
 - [ ] ID-13
[MessagesDecoder.decode(bytes)](src/core/libraries/decoders/MessagesDecoder.sol#L60-L150) uses assembly
	- [INLINE ASM](src/core/libraries/decoders/MessagesDecoder.sol#L79-L81)
	- [INLINE ASM](src/core/libraries/decoders/MessagesDecoder.sol#L112-L118)

src/core/libraries/decoders/MessagesDecoder.sol#L60-L150


 - [ ] ID-14
[TxsDecoder.computeRoot(bytes32[])](src/core/libraries/decoders/TxsDecoder.sol#L291-L310) uses assembly
	- [INLINE ASM](src/core/libraries/decoders/TxsDecoder.sol#L298-L300)

src/core/libraries/decoders/TxsDecoder.sol#L291-L310


## dead-code
Impact: Informational
Confidence: Medium
 - [ ] ID-15
[Inbox._errIncompatibleEntryArguments(bytes32,uint64,uint64,uint32,uint32,uint32,uint32)](src/core/messagebridge/Inbox.sol#L212-L230) is never used and should be removed

src/core/messagebridge/Inbox.sol#L212-L230


 - [ ] ID-16
[Outbox._errNothingToConsume(bytes32)](src/core/messagebridge/Outbox.sol#L114-L116) is never used and should be removed

src/core/messagebridge/Outbox.sol#L114-L116


 - [ ] ID-17
[Hash.sha256ToField(bytes32)](src/core/libraries/Hash.sol#L59-L61) is never used and should be removed

src/core/libraries/Hash.sol#L59-L61


 - [ ] ID-18
[Inbox._errNothingToConsume(bytes32)](src/core/messagebridge/Inbox.sol#L197-L199) is never used and should be removed

src/core/messagebridge/Inbox.sol#L197-L199


 - [ ] ID-19
[Outbox._errIncompatibleEntryArguments(bytes32,uint64,uint64,uint32,uint32,uint32,uint32)](src/core/messagebridge/Outbox.sol#L129-L147) is never used and should be removed

src/core/messagebridge/Outbox.sol#L129-L147


## solc-version
Impact: Informational
Confidence: High
 - [ ] ID-20
solc-0.8.21 is not recommended for deployment

## low-level-calls
Impact: Informational
Confidence: High
 - [ ] ID-21
Low level call in [Inbox.withdrawFees()](src/core/messagebridge/Inbox.sol#L148-L153):
	- [(success) = msg.sender.call{value: balance}()](src/core/messagebridge/Inbox.sol#L151)

src/core/messagebridge/Inbox.sol#L148-L153


## similar-names
Impact: Informational
Confidence: Medium
 - [ ] ID-22
Variable [Constants.LOGS_HASHES_NUM_BYTES_PER_BASE_ROLLUP](src/core/libraries/ConstantsGen.sol#L129) is too similar to [Constants.NOTE_HASHES_NUM_BYTES_PER_BASE_ROLLUP](src/core/libraries/ConstantsGen.sol#L122)

src/core/libraries/ConstantsGen.sol#L129


 - [ ] ID-23
Variable [Constants.L1_TO_L2_MESSAGE_LENGTH](src/core/libraries/ConstantsGen.sol#L109) is too similar to [Constants.L2_TO_L1_MESSAGE_LENGTH](src/core/libraries/ConstantsGen.sol#L110)

src/core/libraries/ConstantsGen.sol#L109


 - [ ] ID-24
Variable [NewOutbox.STATE_TRANSITIONER](src/core/messagebridge/NewOutbox.sol#L26) is too similar to [NewOutbox.constructor(address)._stateTransitioner](src/core/messagebridge/NewOutbox.sol#L29)

src/core/messagebridge/NewOutbox.sol#L26


 - [ ] ID-25
Variable [Rollup.AVAILABILITY_ORACLE](src/core/Rollup.sol#L33) is too similar to [Rollup.constructor(IRegistry,IAvailabilityOracle)._availabilityOracle](src/core/Rollup.sol#L43)

src/core/Rollup.sol#L33


## constable-states
Impact: Optimization
Confidence: High
 - [ ] ID-26
[Rollup.lastWarpedBlockTs](src/core/Rollup.sol#L41) should be constant 

src/core/Rollup.sol#L41


