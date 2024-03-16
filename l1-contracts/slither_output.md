Summary
 - [pess-unprotected-setter](#pess-unprotected-setter) (1 results) (High)
 - [uninitialized-local](#uninitialized-local) (2 results) (Medium)
 - [unused-return](#unused-return) (1 results) (Medium)
 - [pess-dubious-typecast](#pess-dubious-typecast) (8 results) (Medium)
 - [missing-zero-check](#missing-zero-check) (2 results) (Low)
 - [reentrancy-events](#reentrancy-events) (2 results) (Low)
 - [timestamp](#timestamp) (4 results) (Low)
 - [pess-public-vs-external](#pess-public-vs-external) (7 results) (Low)
 - [assembly](#assembly) (2 results) (Informational)
 - [dead-code](#dead-code) (5 results) (Informational)
 - [solc-version](#solc-version) (1 results) (Informational)
 - [low-level-calls](#low-level-calls) (1 results) (Informational)
 - [similar-names](#similar-names) (3 results) (Informational)
 - [constable-states](#constable-states) (1 results) (Optimization)
 - [pess-multiple-storage-read](#pess-multiple-storage-read) (6 results) (Optimization)
## pess-unprotected-setter
Impact: High
Confidence: Medium
 - [ ] ID-0
Function [Rollup.process(bytes,bytes32,bytes,bytes)](src/core/Rollup.sol#L58-L101) is a non-protected setter archive is written

src/core/Rollup.sol#L58-L101


## uninitialized-local
Impact: Medium
Confidence: Medium
 - [ ] ID-1
[HeaderLib.decode(bytes).header](src/core/libraries/HeaderLib.sol#L148) is a local variable never initialized

src/core/libraries/HeaderLib.sol#L148


 - [ ] ID-2
[TxsDecoder.decode(bytes).vars](src/core/libraries/decoders/TxsDecoder.sol#L79) is a local variable never initialized

src/core/libraries/decoders/TxsDecoder.sol#L79


## unused-return
Impact: Medium
Confidence: Medium
 - [ ] ID-3
[Rollup.process(bytes,bytes32,bytes,bytes)](src/core/Rollup.sol#L58-L101) ignores return value by [(l1ToL2Msgs,l2ToL1Msgs) = MessagesDecoder.decode(_body)](src/core/Rollup.sol#L74)

src/core/Rollup.sol#L58-L101


## pess-dubious-typecast
Impact: Medium
Confidence: High
 - [ ] ID-4
Dubious typecast in [TxsDecoder.read1(bytes,uint256)](src/core/libraries/decoders/TxsDecoder.sol#L314-L316):
	bytes => bytes1 casting occurs in [uint256(uint8(bytes1(slice(_data,_offset,1))))](src/core/libraries/decoders/TxsDecoder.sol#L315)

src/core/libraries/decoders/TxsDecoder.sol#L314-L316


 - [ ] ID-5
Dubious typecast in [Outbox.sendL1Messages(bytes32[])](src/core/messagebridge/Outbox.sol#L38-L46):
	uint256 => uint32 casting occurs in [version = uint32(REGISTRY.getVersionFor(msg.sender))](src/core/messagebridge/Outbox.sol#L40)

src/core/messagebridge/Outbox.sol#L38-L46


 - [ ] ID-6
Dubious typecast in [Inbox.sendL2Message(DataStructures.L2Actor,uint32,bytes32,bytes32)](src/core/messagebridge/Inbox.sol#L45-L91):
	uint256 => uint64 casting occurs in [fee = uint64(msg.value)](src/core/messagebridge/Inbox.sol#L64)
	uint256 => uint32 casting occurs in [entries.insert(key,fee,uint32(_recipient.version),_deadline,_errIncompatibleEntryArguments)](src/core/messagebridge/Inbox.sol#L76)

src/core/messagebridge/Inbox.sol#L45-L91


 - [ ] ID-7
Dubious typecast in [TxsDecoder.read4(bytes,uint256)](src/core/libraries/decoders/TxsDecoder.sol#L324-L326):
	bytes => bytes4 casting occurs in [uint256(uint32(bytes4(slice(_data,_offset,4))))](src/core/libraries/decoders/TxsDecoder.sol#L325)

src/core/libraries/decoders/TxsDecoder.sol#L324-L326


 - [ ] ID-8
Dubious typecast in [MessagesDecoder.read4(bytes,uint256)](src/core/libraries/decoders/MessagesDecoder.sol#L160-L162):
	bytes => bytes4 casting occurs in [uint256(uint32(bytes4(_data)))](src/core/libraries/decoders/MessagesDecoder.sol#L161)

src/core/libraries/decoders/MessagesDecoder.sol#L160-L162


 - [ ] ID-9
Dubious typecast in [Inbox.batchConsume(bytes32[],address)](src/core/messagebridge/Inbox.sol#L122-L143):
	uint256 => uint32 casting occurs in [expectedVersion = uint32(REGISTRY.getVersionFor(msg.sender))](src/core/messagebridge/Inbox.sol#L128)

src/core/messagebridge/Inbox.sol#L122-L143


 - [ ] ID-10
Dubious typecast in [HeaderLib.decode(bytes)](src/core/libraries/HeaderLib.sol#L143-L184):
	bytes => bytes32 casting occurs in [header.lastArchive = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L151-L153)
	bytes => bytes4 casting occurs in [header.lastArchive = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L151-L153)
	bytes => bytes32 casting occurs in [header.contentCommitment.txTreeHeight = uint256(bytes32(_header))](src/core/libraries/HeaderLib.sol#L156)
	bytes => bytes32 casting occurs in [header.contentCommitment.txsEffectsHash = bytes32(_header)](src/core/libraries/HeaderLib.sol#L157)
	bytes => bytes32 casting occurs in [header.contentCommitment.inHash = bytes32(_header)](src/core/libraries/HeaderLib.sol#L158)
	bytes => bytes32 casting occurs in [header.contentCommitment.outHash = bytes32(_header)](src/core/libraries/HeaderLib.sol#L159)
	bytes => bytes32 casting occurs in [header.stateReference.l1ToL2MessageTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L162-L164)
	bytes => bytes4 casting occurs in [header.stateReference.l1ToL2MessageTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L162-L164)
	bytes => bytes32 casting occurs in [header.stateReference.partialStateReference.noteHashTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L165-L167)
	bytes => bytes4 casting occurs in [header.stateReference.partialStateReference.noteHashTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L165-L167)
	bytes => bytes32 casting occurs in [header.stateReference.partialStateReference.nullifierTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L168-L170)
	bytes => bytes4 casting occurs in [header.stateReference.partialStateReference.nullifierTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L168-L170)
	bytes => bytes32 casting occurs in [header.stateReference.partialStateReference.publicDataTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L171-L173)
	bytes => bytes4 casting occurs in [header.stateReference.partialStateReference.publicDataTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L171-L173)
	bytes => bytes32 casting occurs in [header.globalVariables.chainId = uint256(bytes32(_header))](src/core/libraries/HeaderLib.sol#L176)
	bytes => bytes32 casting occurs in [header.globalVariables.version = uint256(bytes32(_header))](src/core/libraries/HeaderLib.sol#L177)
	bytes => bytes32 casting occurs in [header.globalVariables.blockNumber = uint256(bytes32(_header))](src/core/libraries/HeaderLib.sol#L178)
	bytes => bytes32 casting occurs in [header.globalVariables.timestamp = uint256(bytes32(_header))](src/core/libraries/HeaderLib.sol#L179)
	bytes => bytes20 casting occurs in [header.globalVariables.coinbase = address(bytes20(_header))](src/core/libraries/HeaderLib.sol#L180)
	bytes => bytes32 casting occurs in [header.globalVariables.feeRecipient = bytes32(_header)](src/core/libraries/HeaderLib.sol#L181)

src/core/libraries/HeaderLib.sol#L143-L184


 - [ ] ID-11
Dubious typecast in [MessagesDecoder.read1(bytes,uint256)](src/core/libraries/decoders/MessagesDecoder.sol#L150-L152):
	bytes => bytes1 casting occurs in [uint256(uint8(bytes1(_data)))](src/core/libraries/decoders/MessagesDecoder.sol#L151)

src/core/libraries/decoders/MessagesDecoder.sol#L150-L152


## missing-zero-check
Impact: Low
Confidence: Medium
 - [ ] ID-12
[NewInbox.constructor(address,uint256)._rollup](src/core/messagebridge/NewInbox.sol#L41) lacks a zero-check on :
		- [ROLLUP = _rollup](src/core/messagebridge/NewInbox.sol#L42)

src/core/messagebridge/NewInbox.sol#L41


 - [ ] ID-13
[NewOutbox.constructor(address)._rollup](src/core/messagebridge/NewOutbox.sol#L31) lacks a zero-check on :
		- [ROLLUP_CONTRACT = _rollup](src/core/messagebridge/NewOutbox.sol#L32)

src/core/messagebridge/NewOutbox.sol#L31


## reentrancy-events
Impact: Low
Confidence: Medium
 - [ ] ID-14
Reentrancy in [NewInbox.sendL2Message(DataStructures.L2Actor,bytes32,bytes32)](src/core/messagebridge/NewInbox.sol#L62-L99):
	External calls:
	- [index = currentTree.insertLeaf(leaf)](src/core/messagebridge/NewInbox.sol#L95)
	Event emitted after the call(s):
	- [LeafInserted(inProgress,index,leaf)](src/core/messagebridge/NewInbox.sol#L96)

src/core/messagebridge/NewInbox.sol#L62-L99


 - [ ] ID-15
Reentrancy in [Rollup.process(bytes,bytes32,bytes,bytes)](src/core/Rollup.sol#L58-L101):
	External calls:
	- [inbox.batchConsume(l1ToL2Msgs,msg.sender)](src/core/Rollup.sol#L90)
	- [inHash = NEW_INBOX.consume()](src/core/Rollup.sol#L92)
	- [outbox.sendL1Messages(l2ToL1Msgs)](src/core/Rollup.sol#L98)
	Event emitted after the call(s):
	- [L2BlockProcessed(header.globalVariables.blockNumber)](src/core/Rollup.sol#L100)

src/core/Rollup.sol#L58-L101


## timestamp
Impact: Low
Confidence: Medium
 - [ ] ID-16
[Inbox.batchConsume(bytes32[],address)](src/core/messagebridge/Inbox.sol#L122-L143) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp > entry.deadline](src/core/messagebridge/Inbox.sol#L136)

src/core/messagebridge/Inbox.sol#L122-L143


 - [ ] ID-17
[HeaderLib.validate(HeaderLib.Header,uint256,uint256,bytes32)](src/core/libraries/HeaderLib.sol#L106-L136) uses timestamp for comparisons
	Dangerous comparisons:
	- [_header.globalVariables.timestamp > block.timestamp](src/core/libraries/HeaderLib.sol#L120)

src/core/libraries/HeaderLib.sol#L106-L136


 - [ ] ID-18
[Inbox.sendL2Message(DataStructures.L2Actor,uint32,bytes32,bytes32)](src/core/messagebridge/Inbox.sol#L45-L91) uses timestamp for comparisons
	Dangerous comparisons:
	- [_deadline <= block.timestamp](src/core/messagebridge/Inbox.sol#L54)

src/core/messagebridge/Inbox.sol#L45-L91


 - [ ] ID-19
[Inbox.cancelL2Message(DataStructures.L1ToL2Msg,address)](src/core/messagebridge/Inbox.sol#L102-L113) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp <= _message.deadline](src/core/messagebridge/Inbox.sol#L108)

src/core/messagebridge/Inbox.sol#L102-L113


## pess-public-vs-external
Impact: Low
Confidence: Medium
 - [ ] ID-20
The following public functions could be turned into external in [FrontierMerkle](src/core/messagebridge/frontier_tree/Frontier.sol#L7-L93) contract:
	[FrontierMerkle.constructor(uint256)](src/core/messagebridge/frontier_tree/Frontier.sol#L19-L27)

src/core/messagebridge/frontier_tree/Frontier.sol#L7-L93


 - [ ] ID-21
The following public functions could be turned into external in [Registry](src/core/messagebridge/Registry.sol#L22-L129) contract:
	[Registry.constructor()](src/core/messagebridge/Registry.sol#L29-L33)

src/core/messagebridge/Registry.sol#L22-L129


 - [ ] ID-22
The following public functions could be turned into external in [Rollup](src/core/Rollup.sol#L30-L110) contract:
	[Rollup.constructor(IRegistry,IAvailabilityOracle)](src/core/Rollup.sol#L43-L49)

src/core/Rollup.sol#L30-L110


 - [ ] ID-23
The following public functions could be turned into external in [Outbox](src/core/messagebridge/Outbox.sol#L21-L148) contract:
	[Outbox.constructor(address)](src/core/messagebridge/Outbox.sol#L29-L31)
	[Outbox.get(bytes32)](src/core/messagebridge/Outbox.sol#L77-L84)
	[Outbox.contains(bytes32)](src/core/messagebridge/Outbox.sol#L91-L93)

src/core/messagebridge/Outbox.sol#L21-L148


 - [ ] ID-24
The following public functions could be turned into external in [Inbox](src/core/messagebridge/Inbox.sol#L21-L231) contract:
	[Inbox.constructor(address)](src/core/messagebridge/Inbox.sol#L30-L32)
	[Inbox.contains(bytes32)](src/core/messagebridge/Inbox.sol#L174-L176)

src/core/messagebridge/Inbox.sol#L21-L231


 - [ ] ID-25
The following public functions could be turned into external in [NewOutbox](src/core/messagebridge/NewOutbox.sol#L18-L132) contract:
	[NewOutbox.constructor(address)](src/core/messagebridge/NewOutbox.sol#L31-L33)

src/core/messagebridge/NewOutbox.sol#L18-L132


 - [ ] ID-26
The following public functions could be turned into external in [NewInbox](src/core/messagebridge/NewInbox.sol#L25-L128) contract:
	[NewInbox.constructor(address,uint256)](src/core/messagebridge/NewInbox.sol#L41-L52)

src/core/messagebridge/NewInbox.sol#L25-L128


## assembly
Impact: Informational
Confidence: High
 - [ ] ID-27
[MessagesDecoder.decode(bytes)](src/core/libraries/decoders/MessagesDecoder.sol#L60-L142) uses assembly
	- [INLINE ASM](src/core/libraries/decoders/MessagesDecoder.sol#L79-L81)
	- [INLINE ASM](src/core/libraries/decoders/MessagesDecoder.sol#L112-L118)

src/core/libraries/decoders/MessagesDecoder.sol#L60-L142


 - [ ] ID-28
[TxsDecoder.computeRoot(bytes32[])](src/core/libraries/decoders/TxsDecoder.sol#L256-L275) uses assembly
	- [INLINE ASM](src/core/libraries/decoders/TxsDecoder.sol#L263-L265)

src/core/libraries/decoders/TxsDecoder.sol#L256-L275


## dead-code
Impact: Informational
Confidence: Medium
 - [ ] ID-29
[Inbox._errIncompatibleEntryArguments(bytes32,uint64,uint64,uint32,uint32,uint32,uint32)](src/core/messagebridge/Inbox.sol#L212-L230) is never used and should be removed

src/core/messagebridge/Inbox.sol#L212-L230


 - [ ] ID-30
[Outbox._errNothingToConsume(bytes32)](src/core/messagebridge/Outbox.sol#L114-L116) is never used and should be removed

src/core/messagebridge/Outbox.sol#L114-L116


 - [ ] ID-31
[Hash.sha256ToField(bytes32)](src/core/libraries/Hash.sol#L59-L61) is never used and should be removed

src/core/libraries/Hash.sol#L59-L61


 - [ ] ID-32
[Inbox._errNothingToConsume(bytes32)](src/core/messagebridge/Inbox.sol#L197-L199) is never used and should be removed

src/core/messagebridge/Inbox.sol#L197-L199


 - [ ] ID-33
[Outbox._errIncompatibleEntryArguments(bytes32,uint64,uint64,uint32,uint32,uint32,uint32)](src/core/messagebridge/Outbox.sol#L129-L147) is never used and should be removed

src/core/messagebridge/Outbox.sol#L129-L147


## solc-version
Impact: Informational
Confidence: High
 - [ ] ID-34
solc-0.8.23 is not recommended for deployment

## low-level-calls
Impact: Informational
Confidence: High
 - [ ] ID-35
Low level call in [Inbox.withdrawFees()](src/core/messagebridge/Inbox.sol#L148-L153):
	- [(success) = msg.sender.call{value: balance}()](src/core/messagebridge/Inbox.sol#L151)

src/core/messagebridge/Inbox.sol#L148-L153


## similar-names
Impact: Informational
Confidence: Medium
 - [ ] ID-36
Variable [Constants.LOGS_HASHES_NUM_BYTES_PER_BASE_ROLLUP](src/core/libraries/ConstantsGen.sol#L130) is too similar to [Constants.NOTE_HASHES_NUM_BYTES_PER_BASE_ROLLUP](src/core/libraries/ConstantsGen.sol#L123)

src/core/libraries/ConstantsGen.sol#L130


 - [ ] ID-37
Variable [Constants.L1_TO_L2_MESSAGE_LENGTH](src/core/libraries/ConstantsGen.sol#L110) is too similar to [Constants.L2_TO_L1_MESSAGE_LENGTH](src/core/libraries/ConstantsGen.sol#L111)

src/core/libraries/ConstantsGen.sol#L110


 - [ ] ID-38
Variable [Rollup.AVAILABILITY_ORACLE](src/core/Rollup.sol#L33) is too similar to [Rollup.constructor(IRegistry,IAvailabilityOracle)._availabilityOracle](src/core/Rollup.sol#L43)

src/core/Rollup.sol#L33


## constable-states
Impact: Optimization
Confidence: High
 - [ ] ID-39
[Rollup.lastWarpedBlockTs](src/core/Rollup.sol#L41) should be constant 

src/core/Rollup.sol#L41


## pess-multiple-storage-read
Impact: Optimization
Confidence: High
 - [ ] ID-40
In a function [NewOutbox.insert(uint256,bytes32,uint256)](src/core/messagebridge/NewOutbox.sol#L44-L64) variable [NewOutbox.roots](src/core/messagebridge/NewOutbox.sol#L29) is read multiple times

src/core/messagebridge/NewOutbox.sol#L44-L64


 - [ ] ID-41
In a function [NewInbox.sendL2Message(DataStructures.L2Actor,bytes32,bytes32)](src/core/messagebridge/NewInbox.sol#L62-L99) variable [NewInbox.inProgress](src/core/messagebridge/NewInbox.sol#L37) is read multiple times

src/core/messagebridge/NewInbox.sol#L62-L99


 - [ ] ID-42
In a function [FrontierMerkle.root()](src/core/messagebridge/frontier_tree/Frontier.sol#L43-L76) variable [FrontierMerkle.HEIGHT](src/core/messagebridge/frontier_tree/Frontier.sol#L8) is read multiple times

src/core/messagebridge/frontier_tree/Frontier.sol#L43-L76


 - [ ] ID-43
In a function [NewInbox.consume()](src/core/messagebridge/NewInbox.sol#L108-L127) variable [NewInbox.inProgress](src/core/messagebridge/NewInbox.sol#L37) is read multiple times

src/core/messagebridge/NewInbox.sol#L108-L127


 - [ ] ID-44
In a function [NewInbox.consume()](src/core/messagebridge/NewInbox.sol#L108-L127) variable [NewInbox.toConsume](src/core/messagebridge/NewInbox.sol#L35) is read multiple times

src/core/messagebridge/NewInbox.sol#L108-L127


 - [ ] ID-45
In a function [FrontierMerkle.root()](src/core/messagebridge/frontier_tree/Frontier.sol#L43-L76) variable [FrontierMerkle.frontier](src/core/messagebridge/frontier_tree/Frontier.sol#L13) is read multiple times

src/core/messagebridge/frontier_tree/Frontier.sol#L43-L76


