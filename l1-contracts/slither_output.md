Summary
 - [pess-unprotected-setter](#pess-unprotected-setter) (1 results) (High)
 - [uninitialized-local](#uninitialized-local) (1 results) (Medium)
 - [unused-return](#unused-return) (1 results) (Medium)
 - [pess-dubious-typecast](#pess-dubious-typecast) (8 results) (Medium)
 - [reentrancy-events](#reentrancy-events) (1 results) (Low)
 - [timestamp](#timestamp) (4 results) (Low)
 - [pess-public-vs-external](#pess-public-vs-external) (5 results) (Low)
 - [assembly](#assembly) (5 results) (Informational)
 - [dead-code](#dead-code) (13 results) (Informational)
 - [solc-version](#solc-version) (1 results) (Informational)
 - [low-level-calls](#low-level-calls) (1 results) (Informational)
 - [similar-names](#similar-names) (3 results) (Informational)
 - [unused-state](#unused-state) (2 results) (Informational)
 - [constable-states](#constable-states) (1 results) (Optimization)
 - [pess-multiple-storage-read](#pess-multiple-storage-read) (2 results) (Optimization)
## pess-unprotected-setter
Impact: High
Confidence: Medium
 - [ ] ID-0
Function [Rollup.process(bytes,bytes32,bytes,bytes)](src/core/Rollup.sol#L53-L91) is a non-protected setter archive is written

src/core/Rollup.sol#L53-L91


## uninitialized-local
Impact: Medium
Confidence: Medium
 - [ ] ID-1
[HeaderLib.decode(bytes).header](src/core/libraries/HeaderLib.sol#L150) is a local variable never initialized

src/core/libraries/HeaderLib.sol#L150


## unused-return
Impact: Medium
Confidence: Medium
 - [ ] ID-2
[Rollup.process(bytes,bytes32,bytes,bytes)](src/core/Rollup.sol#L53-L91) ignores return value by [(l1ToL2Msgs,l2ToL1Msgs) = MessagesDecoder.decode(_body)](src/core/Rollup.sol#L69)

src/core/Rollup.sol#L53-L91


## pess-dubious-typecast
Impact: Medium
Confidence: High
 - [ ] ID-3
Dubious typecast in [TxsDecoder.read4(bytes,uint256)](src/core/libraries/decoders/TxsDecoder.sol#L298-L300):
	bytes => bytes4 casting occurs in [uint256(uint32(bytes4(slice(_data,_offset,4))))](src/core/libraries/decoders/TxsDecoder.sol#L299)

src/core/libraries/decoders/TxsDecoder.sol#L298-L300


 - [ ] ID-4
Dubious typecast in [Decoder.read4(bytes,uint256)](src/core/libraries/decoders/Decoder.sol#L415-L417):
	bytes => bytes4 casting occurs in [uint256(uint32(bytes4(slice(_data,_offset,4))))](src/core/libraries/decoders/Decoder.sol#L416)

src/core/libraries/decoders/Decoder.sol#L415-L417


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
Dubious typecast in [MessagesDecoder.read4(bytes,uint256)](src/core/libraries/decoders/MessagesDecoder.sol#L110-L112):
	bytes => bytes4 casting occurs in [uint256(uint32(bytes4(_data)))](src/core/libraries/decoders/MessagesDecoder.sol#L111)

src/core/libraries/decoders/MessagesDecoder.sol#L110-L112


 - [ ] ID-8
Dubious typecast in [HeaderLib.decode(bytes)](src/core/libraries/HeaderLib.sol#L145-L189):
	bytes => bytes32 casting occurs in [header.lastArchive = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L153-L155)
	bytes => bytes4 casting occurs in [header.lastArchive = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L153-L155)
	bytes => bytes32 casting occurs in [header.contentCommitment.txTreeHeight = uint256(bytes32(_header))](src/core/libraries/HeaderLib.sol#L158)
	bytes => bytes32 casting occurs in [header.contentCommitment.txsHash = bytes32(_header)](src/core/libraries/HeaderLib.sol#L159)
	bytes => bytes32 casting occurs in [header.contentCommitment.inHash = bytes32(_header)](src/core/libraries/HeaderLib.sol#L160)
	bytes => bytes32 casting occurs in [header.contentCommitment.outHash = bytes32(_header)](src/core/libraries/HeaderLib.sol#L161)
	bytes => bytes32 casting occurs in [header.stateReference.l1ToL2MessageTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L164-L166)
	bytes => bytes4 casting occurs in [header.stateReference.l1ToL2MessageTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L164-L166)
	bytes => bytes32 casting occurs in [header.stateReference.partialStateReference.noteHashTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L167-L169)
	bytes => bytes4 casting occurs in [header.stateReference.partialStateReference.noteHashTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L167-L169)
	bytes => bytes32 casting occurs in [header.stateReference.partialStateReference.nullifierTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L170-L172)
	bytes => bytes4 casting occurs in [header.stateReference.partialStateReference.nullifierTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L170-L172)
	bytes => bytes32 casting occurs in [header.stateReference.partialStateReference.contractTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L173-L175)
	bytes => bytes4 casting occurs in [header.stateReference.partialStateReference.contractTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L173-L175)
	bytes => bytes32 casting occurs in [header.stateReference.partialStateReference.publicDataTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L176-L178)
	bytes => bytes4 casting occurs in [header.stateReference.partialStateReference.publicDataTree = AppendOnlyTreeSnapshot(bytes32(_header),uint32(bytes4(_header)))](src/core/libraries/HeaderLib.sol#L176-L178)
	bytes => bytes32 casting occurs in [header.globalVariables.chainId = uint256(bytes32(_header))](src/core/libraries/HeaderLib.sol#L181)
	bytes => bytes32 casting occurs in [header.globalVariables.version = uint256(bytes32(_header))](src/core/libraries/HeaderLib.sol#L182)
	bytes => bytes32 casting occurs in [header.globalVariables.blockNumber = uint256(bytes32(_header))](src/core/libraries/HeaderLib.sol#L183)
	bytes => bytes32 casting occurs in [header.globalVariables.timestamp = uint256(bytes32(_header))](src/core/libraries/HeaderLib.sol#L184)
	bytes => bytes20 casting occurs in [header.globalVariables.coinbase = address(bytes20(_header))](src/core/libraries/HeaderLib.sol#L185)
	bytes => bytes32 casting occurs in [header.globalVariables.feeRecipient = bytes32(_header)](src/core/libraries/HeaderLib.sol#L186)

src/core/libraries/HeaderLib.sol#L145-L189


 - [ ] ID-9
Dubious typecast in [Inbox.batchConsume(bytes32[],address)](src/core/messagebridge/Inbox.sol#L122-L143):
	uint256 => uint32 casting occurs in [expectedVersion = uint32(REGISTRY.getVersionFor(msg.sender))](src/core/messagebridge/Inbox.sol#L128)

src/core/messagebridge/Inbox.sol#L122-L143


 - [ ] ID-10
Dubious typecast in [Decoder.getL2BlockNumber(bytes)](src/core/libraries/decoders/Decoder.sol#L132-L134):
	bytes => bytes32 casting occurs in [uint256(bytes32(_l2Block))](src/core/libraries/decoders/Decoder.sol#L133)

src/core/libraries/decoders/Decoder.sol#L132-L134


## reentrancy-events
Impact: Low
Confidence: Medium
 - [ ] ID-11
Reentrancy in [Rollup.process(bytes,bytes32,bytes,bytes)](src/core/Rollup.sol#L53-L91):
	External calls:
	- [inbox.batchConsume(l1ToL2Msgs,msg.sender)](src/core/Rollup.sol#L85)
	- [outbox.sendL1Messages(l2ToL1Msgs)](src/core/Rollup.sol#L88)
	Event emitted after the call(s):
	- [L2BlockProcessed(header.globalVariables.blockNumber)](src/core/Rollup.sol#L90)

src/core/Rollup.sol#L53-L91


## timestamp
Impact: Low
Confidence: Medium
 - [ ] ID-12
[Inbox.batchConsume(bytes32[],address)](src/core/messagebridge/Inbox.sol#L122-L143) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp > entry.deadline](src/core/messagebridge/Inbox.sol#L136)

src/core/messagebridge/Inbox.sol#L122-L143


 - [ ] ID-13
[HeaderLib.validate(HeaderLib.Header,uint256,uint256,bytes32)](src/core/libraries/HeaderLib.sol#L108-L138) uses timestamp for comparisons
	Dangerous comparisons:
	- [_header.globalVariables.timestamp > block.timestamp](src/core/libraries/HeaderLib.sol#L122)

src/core/libraries/HeaderLib.sol#L108-L138


 - [ ] ID-14
[Inbox.sendL2Message(DataStructures.L2Actor,uint32,bytes32,bytes32)](src/core/messagebridge/Inbox.sol#L45-L91) uses timestamp for comparisons
	Dangerous comparisons:
	- [_deadline <= block.timestamp](src/core/messagebridge/Inbox.sol#L54)

src/core/messagebridge/Inbox.sol#L45-L91


 - [ ] ID-15
[Inbox.cancelL2Message(DataStructures.L1ToL2Msg,address)](src/core/messagebridge/Inbox.sol#L102-L113) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp <= _message.deadline](src/core/messagebridge/Inbox.sol#L108)

src/core/messagebridge/Inbox.sol#L102-L113


## pess-public-vs-external
Impact: Low
Confidence: Medium
 - [ ] ID-16
The following public functions could be turned into external in [FrontierMerkle](src/core/messagebridge/frontier_tree/Frontier.sol#L7-L85) contract:
	[FrontierMerkle.constructor(uint256)](src/core/messagebridge/frontier_tree/Frontier.sol#L19-L27)

src/core/messagebridge/frontier_tree/Frontier.sol#L7-L85


 - [ ] ID-17
The following public functions could be turned into external in [Registry](src/core/messagebridge/Registry.sol#L22-L129) contract:
	[Registry.constructor()](src/core/messagebridge/Registry.sol#L29-L33)

src/core/messagebridge/Registry.sol#L22-L129


 - [ ] ID-18
The following public functions could be turned into external in [Rollup](src/core/Rollup.sol#L27-L100) contract:
	[Rollup.constructor(IRegistry,IAvailabilityOracle)](src/core/Rollup.sol#L39-L44)

src/core/Rollup.sol#L27-L100


 - [ ] ID-19
The following public functions could be turned into external in [Outbox](src/core/messagebridge/Outbox.sol#L21-L148) contract:
	[Outbox.constructor(address)](src/core/messagebridge/Outbox.sol#L29-L31)
	[Outbox.get(bytes32)](src/core/messagebridge/Outbox.sol#L77-L84)
	[Outbox.contains(bytes32)](src/core/messagebridge/Outbox.sol#L91-L93)

src/core/messagebridge/Outbox.sol#L21-L148


 - [ ] ID-20
The following public functions could be turned into external in [Inbox](src/core/messagebridge/Inbox.sol#L21-L231) contract:
	[Inbox.constructor(address)](src/core/messagebridge/Inbox.sol#L30-L32)
	[Inbox.contains(bytes32)](src/core/messagebridge/Inbox.sol#L174-L176)

src/core/messagebridge/Inbox.sol#L21-L231


## assembly
Impact: Informational
Confidence: High
 - [ ] ID-21
[Decoder.computeRoot(bytes32[])](src/core/libraries/decoders/Decoder.sol#L373-L392) uses assembly
	- [INLINE ASM](src/core/libraries/decoders/Decoder.sol#L380-L382)

src/core/libraries/decoders/Decoder.sol#L373-L392


 - [ ] ID-22
[TxsDecoder.decode(bytes)](src/core/libraries/decoders/TxsDecoder.sol#L71-L184) uses assembly
	- [INLINE ASM](src/core/libraries/decoders/TxsDecoder.sol#L98-L104)

src/core/libraries/decoders/TxsDecoder.sol#L71-L184


 - [ ] ID-23
[Decoder.computeConsumables(bytes)](src/core/libraries/decoders/Decoder.sol#L164-L301) uses assembly
	- [INLINE ASM](src/core/libraries/decoders/Decoder.sol#L196-L202)
	- [INLINE ASM](src/core/libraries/decoders/Decoder.sol#L289-L295)

src/core/libraries/decoders/Decoder.sol#L164-L301


 - [ ] ID-24
[TxsDecoder.computeRoot(bytes32[])](src/core/libraries/decoders/TxsDecoder.sol#L256-L275) uses assembly
	- [INLINE ASM](src/core/libraries/decoders/TxsDecoder.sol#L263-L265)

src/core/libraries/decoders/TxsDecoder.sol#L256-L275


 - [ ] ID-25
[MessagesDecoder.decode(bytes)](src/core/libraries/decoders/MessagesDecoder.sol#L52-L102) uses assembly
	- [INLINE ASM](src/core/libraries/decoders/MessagesDecoder.sol#L81-L83)
	- [INLINE ASM](src/core/libraries/decoders/MessagesDecoder.sol#L94-L96)

src/core/libraries/decoders/MessagesDecoder.sol#L52-L102


## dead-code
Impact: Informational
Confidence: Medium
 - [ ] ID-26
[Decoder.computeConsumables(bytes)](src/core/libraries/decoders/Decoder.sol#L164-L301) is never used and should be removed

src/core/libraries/decoders/Decoder.sol#L164-L301


 - [ ] ID-27
[Inbox._errIncompatibleEntryArguments(bytes32,uint64,uint64,uint32,uint32,uint32,uint32)](src/core/messagebridge/Inbox.sol#L212-L230) is never used and should be removed

src/core/messagebridge/Inbox.sol#L212-L230


 - [ ] ID-28
[Decoder.slice(bytes,uint256,uint256)](src/core/libraries/decoders/Decoder.sol#L401-L407) is never used and should be removed

src/core/libraries/decoders/Decoder.sol#L401-L407


 - [ ] ID-29
[Outbox._errNothingToConsume(bytes32)](src/core/messagebridge/Outbox.sol#L114-L116) is never used and should be removed

src/core/messagebridge/Outbox.sol#L114-L116


 - [ ] ID-30
[Decoder.computeRoot(bytes32[])](src/core/libraries/decoders/Decoder.sol#L373-L392) is never used and should be removed

src/core/libraries/decoders/Decoder.sol#L373-L392


 - [ ] ID-31
[Hash.sha256ToField(bytes32)](src/core/libraries/Hash.sol#L59-L61) is never used and should be removed

src/core/libraries/Hash.sol#L59-L61


 - [ ] ID-32
[Decoder.computeKernelLogsHash(uint256,bytes)](src/core/libraries/decoders/Decoder.sol#L335-L365) is never used and should be removed

src/core/libraries/decoders/Decoder.sol#L335-L365


 - [ ] ID-33
[Decoder.read4(bytes,uint256)](src/core/libraries/decoders/Decoder.sol#L415-L417) is never used and should be removed

src/core/libraries/decoders/Decoder.sol#L415-L417


 - [ ] ID-34
[Decoder.computeStateHash(uint256,uint256,bytes)](src/core/libraries/decoders/Decoder.sol#L146-L154) is never used and should be removed

src/core/libraries/decoders/Decoder.sol#L146-L154


 - [ ] ID-35
[Decoder.computePublicInputHash(bytes,bytes32,bytes32)](src/core/libraries/decoders/Decoder.sol#L118-L125) is never used and should be removed

src/core/libraries/decoders/Decoder.sol#L118-L125


 - [ ] ID-36
[Inbox._errNothingToConsume(bytes32)](src/core/messagebridge/Inbox.sol#L197-L199) is never used and should be removed

src/core/messagebridge/Inbox.sol#L197-L199


 - [ ] ID-37
[Decoder.getL2BlockNumber(bytes)](src/core/libraries/decoders/Decoder.sol#L132-L134) is never used and should be removed

src/core/libraries/decoders/Decoder.sol#L132-L134


 - [ ] ID-38
[Outbox._errIncompatibleEntryArguments(bytes32,uint64,uint64,uint32,uint32,uint32,uint32)](src/core/messagebridge/Outbox.sol#L129-L147) is never used and should be removed

src/core/messagebridge/Outbox.sol#L129-L147


## solc-version
Impact: Informational
Confidence: High
 - [ ] ID-39
solc-0.8.21 is not recommended for deployment

## low-level-calls
Impact: Informational
Confidence: High
 - [ ] ID-40
Low level call in [Inbox.withdrawFees()](src/core/messagebridge/Inbox.sol#L148-L153):
	- [(success) = msg.sender.call{value: balance}()](src/core/messagebridge/Inbox.sol#L151)

src/core/messagebridge/Inbox.sol#L148-L153


## similar-names
Impact: Informational
Confidence: Medium
 - [ ] ID-41
Variable [Constants.LOGS_HASHES_NUM_BYTES_PER_BASE_ROLLUP](src/core/libraries/ConstantsGen.sol#L123) is too similar to [Constants.NOTE_HASHES_NUM_BYTES_PER_BASE_ROLLUP](src/core/libraries/ConstantsGen.sol#L116)

src/core/libraries/ConstantsGen.sol#L123


 - [ ] ID-42
Variable [Constants.L1_TO_L2_MESSAGE_LENGTH](src/core/libraries/ConstantsGen.sol#L103) is too similar to [Constants.L2_TO_L1_MESSAGE_LENGTH](src/core/libraries/ConstantsGen.sol#L104)

src/core/libraries/ConstantsGen.sol#L103


 - [ ] ID-43
Variable [Rollup.AVAILABILITY_ORACLE](src/core/Rollup.sol#L30) is too similar to [Rollup.constructor(IRegistry,IAvailabilityOracle)._availabilityOracle](src/core/Rollup.sol#L39)

src/core/Rollup.sol#L30


## unused-state
Impact: Informational
Confidence: High
 - [ ] ID-44
[Decoder.END_TREES_BLOCK_HEADER_OFFSET](src/core/libraries/decoders/Decoder.sol#L103-L104) is never used in [Decoder](src/core/libraries/decoders/Decoder.sol#L72-L418)

src/core/libraries/decoders/Decoder.sol#L103-L104


 - [ ] ID-45
[Decoder.BLOCK_HEADER_OFFSET](src/core/libraries/decoders/Decoder.sol#L107-L108) is never used in [Decoder](src/core/libraries/decoders/Decoder.sol#L72-L418)

src/core/libraries/decoders/Decoder.sol#L107-L108


## constable-states
Impact: Optimization
Confidence: High
 - [ ] ID-46
[Rollup.lastWarpedBlockTs](src/core/Rollup.sol#L37) should be constant 

src/core/Rollup.sol#L37


## pess-multiple-storage-read
Impact: Optimization
Confidence: High
 - [ ] ID-47
In a function [FrontierMerkle.root()](src/core/messagebridge/frontier_tree/Frontier.sol#L39-L72) variable [FrontierMerkle.DEPTH](src/core/messagebridge/frontier_tree/Frontier.sol#L8) is read multiple times

src/core/messagebridge/frontier_tree/Frontier.sol#L39-L72


 - [ ] ID-48
In a function [FrontierMerkle.root()](src/core/messagebridge/frontier_tree/Frontier.sol#L39-L72) variable [FrontierMerkle.frontier](src/core/messagebridge/frontier_tree/Frontier.sol#L13) is read multiple times

src/core/messagebridge/frontier_tree/Frontier.sol#L39-L72


