# GetContractInstance Opcode Design Document

## Introduction

The `GetContractInstance` opcode is currently implemented only in the TypeScript AVM simulator and needs to be ported to the C++ AVM simulator and PIL circuit implementation. This opcode allows contracts to query whether a contract instance exists at a given address and retrieve specific members from that instance.

The opcode performs the following high-level operations:
1. Reads a contract address from memory
2. Looks up the contract instance for that address (with a nullifier existence check and a contract class update check)
3. Extracts a specific member from the instance based on an enum parameter
4. Writes two values to memory: an existence flag (`u1`) and the member value (`FF`)

This implementation will leverage some existing simulation and PIL components that are used today for bytecode retrieval.

## Architecture Overview

This design document introduces a **virtual gadget** approach for the `GetContractInstance` opcode that follows the pattern established by `get_env_var.pil`. The opcode will be implemented as a "virtual" gadget that shares rows with the main execution trace, rather than having its own dedicated PIL file and simulation component.

**Key Architectural Decisions:**
1. **Virtual Gadget Pattern**: `GetContractInstance` will follow the `get_env_var.pil` pattern, sharing rows with execution rather than having a separate PIL file
2. **No Dedicated Simulation Component**: The opcode will be implemented directly in `execution.cpp` and `execution_trace.cpp`
3. **Shared Contract Instance Manager**: A shared `ContractInstanceManager` component will handle the core contract instance retrieval logic and emit events for the `contract_instance_retrieval.pil` gadget
4. **Direct Register Access**: The virtual gadget will directly access resolved operands and registers from execution

The following existing components (and their gadgets) will be reused:
1. **Address Derivation**: For deriving contract addresses from instance data
2. **Nullifier Checks**: For verifying nullifier existence for instance validation  
3. **Contract Update Checks**: For validating contract class updates and versioning

The following new components will be added:
1. **Contract Instance Manager** (`contract_instance_manager.hpp/.cpp`): **Shared** core logic for contract instance retrieval that emits events for the `contract_instance_retrieval.pil` gadget
2. **GetContractInstance Virtual Gadget** (as part of `execution.pil`): Virtual gadget logic implemented directly in the execution trace

The following component will be modified:
1. **Bytecode Manager**: Will be modified to use the new shared `ContractInstanceManager`

## Interfaces

### Opcode Signature
```
GETCONTRACTINSTANCE dstOffset, addressOffset, memberEnum
```

**Parameters:**
- `dstOffset`: Memory offset where results will be written (2 consecutive words)
- `addressOffset`: Memory offset containing the contract address to query
- `memberEnum`: Enum value specifying which instance member to retrieve

**Memory Layout:**
- `M[addressOffset]`: Input contract address (must be tagged as `FF`)
- `M[dstOffset]`: Output member value (tagged as `FF`)
- `M[dstOffset+1]`: Output contract address (tagged as `FF`) - **manual write**

**Register Access Pattern:**
- `register[0]`: Contains the contract address read from `M[addressOffset]`
- `register[1]`: Contains the member value to be written to `M[dstOffset]`
- `rop[0]`: Contains `addressOffset` (resolved operand)
- `rop[1]`: Contains `dstOffset` (resolved operand)
- `rop[2]`: Contains `memberEnum` (resolved operand)

### Member Enum Values
```cpp
enum class ContractInstanceMember {
    DEPLOYER = 0,
    CLASS_ID = 1,
    INIT_HASH = 2
}
```

### PIL Virtual Gadget Pattern

Following the `get_env_var.pil` pattern, the `GetContractInstance` opcode will be implemented as a virtual gadget that shares rows with the execution trace. The key interfaces are:

#### 1. Virtual Gadget Interface (within execution.pil namespace)
```pil
namespace execution; // Virtual gadget shares rows with execution

// Virtual gadget selector for GetContractInstance
// pol commit sel_get_contract_instance;   // From execution.pil
// pol commit should_execute_opcode;       // From execution.pil
pol commit sel_should_get_contract_instance;

// Should only execute if the opcode has reached dispatch (no earlier errors)
#[SHOULD_GET_CONTRACT_INSTANCE]
sel_should_get_contract_instance = sel_get_contract_instance * should_execute_opcode;

// Member selection columns (from precomputed table)
pol commit is_deployer;      // memberEnum == 0
pol commit is_class_id;      // memberEnum == 1  
pol commit is_init_hash;     // memberEnum == 2
pol commit invalid_member_enum; // memberEnum > 2

// Precomputed table lookup for member enum validation
// Note: All contract instance members have FF tag, so no need to include output tag in precomputed table
#[PRECOMPUTED_MEMBER_INFO]
sel_should_get_contract_instance {
    rop[2], // memberEnum from opcode input
    sel_opcode_error, // invalid member enum - trigger "opcode error"
    is_deployer, is_class_id, is_init_hash
} in precomputed.sel_range_8 {
    precomputed.clk,
    precomputed.invalid_contract_instance_member_enum,
    precomputed.is_deployer, precomputed.is_class_id, precomputed.is_init_hash
};

// Bounds check for dstOffset+1: only fails if dstOffset == 2^32 - 1 (max address)
#[DST_MAX_ADDRESS_CHECK]
sel_should_get_contract_instance * sel_opcode_error = sel_should_get_contract_instance * (rop[1] == 4294967295); // 2^32 - 1

// Tag check for address input (register[0] must be FF)
#[ADDRESS_TAG_CHECK] 
sel_should_get_contract_instance * sel_opcode_error = sel_should_get_contract_instance * (mem_tag_reg[0] != FF_TAG);
```

#### 2. Contract Instance Retrieval Interface
```pil
// Contract instance retrieval data (populated by ContractInstanceManager)
pol commit retrieved_deployer_addr;
pol commit retrieved_class_id; 
pol commit retrieved_init_hash;
pol commit instance_exists;

// Member value selection based on enum
#[MEMBER_SELECTION]
sel_should_get_contract_instance * (1 - sel_opcode_error) * (
    register[1] - (
        is_deployer * retrieved_deployer_addr +
        is_class_id * retrieved_class_id +
        is_init_hash * retrieved_init_hash
    )
) = 0;

// Manual memory write for dstOffset+1 (contract address)
pol commit manual_write_dst_plus_one;
pol commit should_write_dst_plus_one; // Selector column for the manual write

// Only write to dstOffset+1 if no errors and dstOffset is not max address
#[SHOULD_WRITE_DST_PLUS_ONE]
should_write_dst_plus_one = sel_should_get_contract_instance * (1 - sel_opcode_error);

#[MANUAL_WRITE_DST_PLUS_ONE] 
should_write_dst_plus_one * (manual_write_dst_plus_one - register[0]) = 0;
```

#### 3. Contract Instance Retrieval to Helper Components  
The shared `contract_instance_retrieval.pil` gadget handles core lookups:

```pil
// Bytecode Retrieval to Contract Instance Retrieval Lookup
bc_retrieval.sel {
    bc_retrieval.address,
    bc_retrieval.error
} in contract_instance_retrieval.sel {
    contract_instance_retrieval.address,
    contract_instance_retrieval.error
};

// Contract Instance Retrieval to Helper Components
contract_instance_retrieval.sel {
    contract_instance_retrieval.nullifier_exists,
    contract_instance_retrieval.deployment_nullifier,
    contract_instance_retrieval.nullifier_tree_root,
    contract_instance_retrieval.deployer_protocol_contract_address,
    contract_instance_retrieval.sel // 1 (yes silo)
} in nullifier_check.sel {
    nullifier_check.exists,
    nullifier_check.nullifier,
    nullifier_check.root,
    nullifier_check.address,
    nullifier_check.should_silo
};

// Address derivation and update check lookups...
// (Similar to previous design but simplified)
```

### C++ Simulation Interfaces

#### 1. Contract Instance Manager (Shared Component)
```cpp
// In contract_instance_manager.hpp  
class ContractInstanceManagerInterface {
public:
    virtual ~ContractInstanceManagerInterface() = default;
    virtual std::optional<ContractInstance> get_contract_instance(const FF& contract_address) = 0;
};

class ContractInstanceManager : public ContractInstanceManagerInterface {
public:
    ContractInstanceManager(
        ContractDBInterface& contract_db,
        HighLevelMerkleDBInterface& merkle_db, 
        UpdateCheckInterface& update_check,
        EventEmitterInterface<ContractInstanceRetrievalEvent>& event_emitter,
        const GlobalVariables& globals
    );
    
    std::optional<ContractInstance> get_contract_instance(const FF& contract_address) override;
    
private:
    ContractDBInterface& contract_db;
    HighLevelMerkleDBInterface& merkle_db;
    UpdateCheckInterface& update_check;
    EventEmitterInterface<ContractInstanceRetrievalEvent>& event_emitter;
    const GlobalVariables& globals;
    
    std::unordered_map<AztecAddress, std::optional<ContractInstance>> resolved_addresses;
};

// Event type for contract_instance_retrieval.pil gadget
struct ContractInstanceRetrievalEvent {
    AztecAddress address; // serves as unique identifier
    ContractInstance contract_instance;
    // State context
    FF nullifier_tree_root;
    FF public_data_tree_root;
    uint64_t timestamp;
    AztecAddress deployer_protocol_contract_address;
    bool error = false;
};
```

#### 2. Direct Execution Integration (Virtual Gadget)
```cpp
// In execution.hpp - simplified integration
class Execution : public ExecutionInterface {
public:
    Execution(/* ... other dependencies ... */, 
              ContractInstanceManagerInterface& contract_instance_manager)
        : /* ... */ contract_instance_manager(contract_instance_manager) {}
    
    void get_contract_instance(
        ContextInterface& context,
        MemoryAddress address_offset,
        MemoryAddress dst_offset,
        uint8_t member_enum
    );
    
private:
    ContractInstanceManagerInterface& contract_instance_manager;
};

// In execution.cpp - direct implementation
void Execution::get_contract_instance(
    ContextInterface& context,
    MemoryAddress address_offset,
    MemoryAddress dst_offset,
    uint8_t member_enum)
{
    constexpr auto opcode = ExecutionOpCode::GETCONTRACTINSTANCE;
    auto& memory = context.get_memory();
    
    // Read the contract address from memory (execution handles standard memory reads)
    auto address_value = memory.get(address_offset);
    FF contract_address = address_value.as<FF>();
    set_and_validate_inputs(opcode, { address_value });
    
    // Retrieve the contract instance using the shared manager
    auto maybe_instance = contract_instance_manager.get_contract_instance(contract_address);
    
    TaggedValue member_value;
    if (!maybe_instance.has_value()) {
        // Contract instance not found - use zero value
        member_value = TaggedValue::from<FF>(0);
    } else {
        const auto& instance = maybe_instance.value();
        
        // Extract the requested member based on the enum
        switch (static_cast<ContractInstanceMember>(member_enum)) {
        case ContractInstanceMember::DEPLOYER:
            member_value = TaggedValue::from<FF>(instance.deployer_addr);
            break;
        case ContractInstanceMember::CLASS_ID:
            member_value = TaggedValue::from<FF>(instance.current_class_id);
            break;
        case ContractInstanceMember::INIT_HASH:
            member_value = TaggedValue::from<FF>(instance.initialisation_hash);
            break;
        default:
            throw std::runtime_error("Invalid contract instance member enum");
        }
    }
    
    // Standard memory write for dstOffset (execution handles this)
    memory.set(dst_offset, member_value);
    set_output(opcode, member_value);
    
    // Manual bounds check and write for dstOffset+1 (non-standard)
    // Only fails if dstOffset == 2^32 - 1 (max address) since dstOffset itself is already validated
    constexpr MemoryAddress MAX_ADDRESS = 0xFFFFFFFF; // 2^32 - 1
    if (dst_offset == MAX_ADDRESS) {
        throw std::runtime_error("Cannot write to dstOffset+1: dstOffset at max address");
    }
    memory.set(dst_offset + 1, TaggedValue::from<FF>(contract_address));
}
```

#### 3. Updated Execution Trace Integration (Virtual Gadget)
```cpp
// In execution_trace.cpp - virtual gadget trace generation
void ExecutionTraceBuilder::handle_get_contract_instance_opcode(
    const ExecutionEvent& event,
    TraceContainer& trace,
    uint32_t row)
{
    // Basic execution trace fields are handled by standard execution trace logic
    
    // Virtual gadget specific fields for GetContractInstance
    if (event.opcode == ExecutionOpCode::GETCONTRACTINSTANCE) {
        // Extract member enum from resolved operands
        uint8_t member_enum = event.resolved_operands[2].as<uint8_t>();
        
        // Set virtual gadget selector
        trace.set(row, C::execution_sel_get_contract_instance, 1);
        
        // Member enum validation and selection (from precomputed table)
        bool is_deployer = (member_enum == 0);
        bool is_class_id = (member_enum == 1);
        bool is_init_hash = (member_enum == 2);
        
        trace.set(row, C::execution_is_deployer, is_deployer ? 1 : 0);
        trace.set(row, C::execution_is_class_id, is_class_id ? 1 : 0);
        trace.set(row, C::execution_is_init_hash, is_init_hash ? 1 : 0);
        
        // Contract instance data (from ContractInstanceManager events)
        // This data comes from ContractInstanceRetrievalEvent
        auto contract_events = get_contract_instance_retrieval_events();
        FF contract_address = event.inputs[0].as<FF>();
        
        for (const auto& ci_event : contract_events) {
            if (ci_event.address == contract_address) {
                if (!ci_event.error) {
                    const auto& instance = ci_event.contract_instance;
                    trace.set(row, C::execution_retrieved_deployer_addr, instance.deployer_addr);
                    trace.set(row, C::execution_retrieved_class_id, instance.current_class_id);
                    trace.set(row, C::execution_retrieved_init_hash, instance.initialisation_hash);
                    trace.set(row, C::execution_instance_exists, 1);
                } else {
                    trace.set(row, C::execution_instance_exists, 0);
                }
                break;
            }
        }
        
        // Manual write data for dstOffset+1
        trace.set(row, C::execution_manual_write_dst_plus_one, contract_address);
        
        // Bounds check: only set should_write_dst_plus_one if dstOffset != max address
        MemoryAddress dst_offset = event.resolved_operands[1].as<MemoryAddress>();
        constexpr MemoryAddress MAX_ADDRESS = 0xFFFFFFFF; // 2^32 - 1
        bool should_write = (dst_offset != MAX_ADDRESS) && !event.has_error();
        trace.set(row, C::execution_should_write_dst_plus_one, should_write ? 1 : 0);
    }
}
```

## Implementation

### PIL Implementation

#### 1. Execution Integration
The opcode integrates with the existing execution framework:

```pil
// In execution.pil
pol commit sel_get_contract_instance;

// Standard opcode dispatch pattern
sel_get_contract_instance * (1 - sel_get_contract_instance) = 0;
```

#### 2. Core Contract Instance Retrieval Gadget (`contract_instance_retrieval.pil`)
```pil
namespace contract_instance_retrieval;

// Selector for when this shared gadget is active
pol commit sel;

// Input contract address (also serves as unique ID)
pol commit address;

// Error flag (1 if nullifier doesn't exist or other failure)
pol commit error;

// Nullifier information
pol commit deployment_nullifier;
pol commit nullifier_exists;
pol commit nullifier_tree_root;

// Contract instance member values (complete set from bc_retrieval)
pol commit salt;
pol commit deployer_addr; 
pol commit current_class_id;
pol commit original_class_id;
pol commit init_hash;

// Public keys (complete set)
pol commit nullifier_key_x;
pol commit nullifier_key_y;
pol commit incoming_viewing_key_x;
pol commit incoming_viewing_key_y;
pol commit outgoing_viewing_key_x;
pol commit outgoing_viewing_key_y;
pol commit tagging_key_x;
pol commit tagging_key_y;

// Note: Contract class members (artifact_hash, private_function_root, public_bytecode_commitment)
// are NOT handled by this core gadget. They are specific to bytecode retrieval and are
// handled directly by bc_retrieval.pil and its class_id_derivation lookup.

// State context
pol commit timestamp;
pol commit public_data_tree_root;

// Constants
pol commit deployer_protocol_contract_address;

// Error handling: error = 1 when nullifier doesn't exist
#[ERROR_CONSTRAINT]
sel * (error - (1 - nullifier_exists)) = 0;

// Constants constraint 
#[DEPLOYER_PROTOCOL_ADDRESS]
sel * (constants.DEPLOYER_PROTOCOL_CONTRACT_ADDRESS - deployer_protocol_contract_address) = 0;

// Nullifier existence check
#[DEPLOYMENT_NULLIFIER_READ]
sel {
    nullifier_exists,
    deployment_nullifier,
    nullifier_tree_root,
    deployer_protocol_contract_address,
    sel
} in nullifier_check.sel {
    nullifier_check.exists,
    nullifier_check.nullifier,
    nullifier_check.root,
    nullifier_check.address,
    nullifier_check.should_silo
};

// Address derivation (only when nullifier exists)
#[ADDRESS_DERIVATION]
nullifier_exists {
    address, salt, deployer_addr, original_class_id, init_hash,
    nullifier_key_x, nullifier_key_y,
    incoming_viewing_key_x, incoming_viewing_key_y,
    outgoing_viewing_key_x, outgoing_viewing_key_y,
    tagging_key_x, tagging_key_y
} in address_derivation.sel {
    address_derivation.address, address_derivation.salt, 
    address_derivation.deployer_addr, address_derivation.original_class_id, 
    address_derivation.init_hash,
    address_derivation.nullifier_key_x, address_derivation.nullifier_key_y,
    address_derivation.incoming_viewing_key_x, address_derivation.incoming_viewing_key_y,
    address_derivation.outgoing_viewing_key_x, address_derivation.outgoing_viewing_key_y,
    address_derivation.tagging_key_x, address_derivation.tagging_key_y
};

// Contract update validation (only when nullifier exists)
#[UPDATE_CHECK]
nullifier_exists {
    address, current_class_id, original_class_id, public_data_tree_root, timestamp
} in update_check.sel {
    update_check.address, update_check.current_class_id, 
    update_check.original_class_id, update_check.public_data_tree_root, 
    update_check.timestamp
};

// Note: Class ID derivation is NOT handled by this core gadget.
// It is specific to bytecode retrieval and handled directly by bc_retrieval.pil
```

#### 3. GetContractInstance Opcode Gadget (`get_contract_instance.pil`)
```pil
namespace get_contract_instance;

// Interface columns (following memory-aware gadget pattern)
pol commit clk;
pol commit address_offset;
pol commit dst_offset;
pol commit member_enum;
pol commit space_id;
pol commit error;

// Selector for when this gadget is active (derived from start)
pol commit start;

// Internal state for memory operations
pol commit contract_address;     // Read from memory[address_offset]
pol commit address_tag_error;    // Tag check for contract address

// Bounds checking
pol commit dst_out_of_bounds;    // dst_offset + 1 >= memory size

// Member validation
pol commit member_enum_valid;
pol commit member_enum_error;

// Instance retrieval  
pol commit retrieval_error;      // From core instance retrieval
pol commit instance_exists;      // Opposite of retrieval_error

// Selected member value computation
pol commit selected_member_value;

// Memory operations (handled independently by this gadget)
pol commit mem_read_addr;
pol commit mem_read_val;
pol commit mem_read_tag;

pol commit mem_write_addr_0;
pol commit mem_write_val_0; 
pol commit mem_write_tag_0;

pol commit mem_write_addr_1;
pol commit mem_write_val_1;
pol commit mem_write_tag_1;

// Error aggregation (independent error handling)
#[ERROR_AGGREGATION]
start * (error - (1 - (1 - address_tag_error) * (1 - dst_out_of_bounds) * (1 - member_enum_error) * (1 - retrieval_error))) = 0;

// Bounds checking constraints
#[DST_BOUNDS_CHECK]
start * (dst_out_of_bounds - (dst_offset + 1 >= constants.AVM_MEMORY_SIZE)) = 0;

// Memory read operation (contract address)
#[MEMORY_READ_CONSTRAINT]
start * (
    (mem_read_addr - address_offset) +
    (mem_read_val - contract_address)
) = 0;

// Tag checking for contract address (must be FF)
#[ADDRESS_TAG_CHECK]
start * (address_tag_error - (mem_read_tag != ValueTag.FF)) = 0;

// Member enum validation
#[MEMBER_ENUM_VALIDATION]
start * (1 - error) {
    member_enum, member_enum_valid
} in precomputed.sel_range_8 {
    precomputed.clk, precomputed.get_contract_instance_member_valid
};

#[MEMBER_ENUM_ERROR]
start * (member_enum_error - (1 - member_enum_valid)) = 0;

// Instance existence 
#[INSTANCE_EXISTS_CONSTRAINT]
start * (instance_exists - (1 - retrieval_error)) = 0;

// Memory write operations (dual write)
#[MEMORY_WRITE_0_CONSTRAINT]
start * (1 - error) * (
    (mem_write_addr_0 - dst_offset) +
    (mem_write_val_0 - instance_exists) +
    (mem_write_tag_0 - ValueTag.U1)
) = 0;

#[MEMORY_WRITE_1_CONSTRAINT]
start * (1 - error) * (
    (mem_write_addr_1 - (dst_offset + 1)) +
    (mem_write_val_1 - selected_member_value) +
    (mem_write_tag_1 - ValueTag.FF)
) = 0;

// Core instance retrieval lookup (only when no local errors)
#[CORE_INSTANCE_RETRIEVAL_LOOKUP]
start * (1 - address_tag_error) * (1 - dst_out_of_bounds) * (1 - member_enum_error) {
    contract_address, retrieval_error
} in contract_instance_retrieval.sel {
    contract_instance_retrieval.address,
    contract_instance_retrieval.error
};

// Memory interface lookups (for actual memory operations)
#[MEMORY_READ_LOOKUP]
start {
    clk, mem_read_addr, mem_read_val, mem_read_tag, space_id
} in memory.read {
    memory.clk, memory.addr, memory.val, memory.tag, memory.space_id
};

#[MEMORY_WRITE_0_LOOKUP]
start * (1 - error) {
    clk, mem_write_addr_0, mem_write_val_0, mem_write_tag_0, space_id
} in memory.write {
    memory.clk, memory.addr, memory.val, memory.tag, memory.space_id
};

#[MEMORY_WRITE_1_LOOKUP]
start * (1 - error) {
    clk + 1, mem_write_addr_1, mem_write_val_1, mem_write_tag_1, space_id
} in memory.write {
    memory.clk, memory.addr, memory.val, memory.tag, memory.space_id
};
```

#### 4. Member Value Selection
The GetContractInstance gadget needs to compute the selected member value from the full instance data retrieved from the core gadget. This is handled by capturing the retrieved instance data and applying member selection:

```pil
// Member selection constraint (applied after successful core retrieval)
// This constraint links the selected_member_value to the actual instance data
// retrieved via the core instance retrieval lookup. The constraint is implemented
// through the core gadget's interface which provides access to deployer_addr,
// current_class_id, and init_hash fields.

#[MEMBER_SELECTION_CONSTRAINT]
start * (1 - error) * instance_exists * (
    selected_member_value - (
        (member_enum == 0) * retrieved_deployer_addr +      // DEPLOYER
        (member_enum == 1) * retrieved_current_class_id +   // CLASS_ID  
        (member_enum == 2) * retrieved_init_hash            // INIT_HASH
    )
) = 0;

// Note: retrieved_* fields come from a second lookup to the core instance
// retrieval gadget to access the full instance data after the primary
// existence check lookup succeeds.
```

### C++ Simulation Implementation

#### 1. Core Contract Instance Manager
```cpp
// In contract_instance_manager.hpp
class ContractInstanceManager {
public:
    struct Result {
        bool exists;
        ContractInstance instance;
        FF nullifier;
        bool nullifier_exists;
    };
    
    static Result retrieve_contract_instance(const FF& contract_address, HintedDatabase& db, EventEmitter& emitter);
    
private:
    static FF compute_nullifier(const ContractInstance& instance);
    static bool validate_contract_updates(const ContractInstance& instance);
};

// In contract_instance_manager.cpp  
ContractInstanceManager::Result ContractInstanceManager::retrieve_contract_instance(
    const FF& contract_address, 
    HintedDatabase& db,
    EventEmitter& emitter)
{
    // Contract address serves as unique identifier
    
    // Get contract instance from ContractDB
    auto instance = contract_db.get_contract_instance(contract_address);
    if (!instance) {
        auto event = ContractInstanceRetrievalEvent{
            .address = contract_address,
            .contract_instance = {},  // Empty instance for error case
            .nullifier_tree_root = 0,
            .public_data_tree_root = 0,
            .timestamp = 0,
            .deployment_nullifier = 0,
            .nullifier_exists = false,
            .deployer_protocol_contract_address = AztecAddress{},
            .error = true
        };
        emitter.emit(event);
        return { .exists = false, .instance = {}, .nullifier = 0, .nullifier_exists = false };
    }
    
    // Skip canonical/magic address handling in first implementation pass
    
    // Perform nullifier check
    auto nullifier = compute_nullifier(*instance);
    auto nullifier_exists = check_nullifier_existence(nullifier);
    
    // Validate contract updates
    bool update_valid = validate_contract_updates(*instance);
    bool is_valid = update_valid;
    
    // Get current state context 
    auto current_timestamp = get_current_timestamp();
    auto current_public_data_tree_root = get_public_data_tree_root();
    auto current_nullifier_tree_root = get_nullifier_tree_root();
    auto protocol_contract_address = get_deployer_protocol_contract_address();
    
    // Emit comprehensive event for contract_instance_retrieval.pil gadget
    auto event = ContractInstanceRetrievalEvent{
        .address = contract_address,
        .contract_instance = *instance,  // Complex member - whole instance object
        // State context
        .nullifier_tree_root = current_nullifier_tree_root,
        .public_data_tree_root = current_public_data_tree_root,
        .timestamp = current_timestamp,
        // Nullifier info
        .deployment_nullifier = nullifier,
        .nullifier_exists = nullifier_exists,
        .deployer_protocol_contract_address = protocol_contract_address,
        .error = !is_valid
    };
    emitter.emit(event);
    
    return {
        .exists = is_valid,
        .instance = *instance,
        .nullifier = nullifier,
        .nullifier_exists = nullifier_exists
    };
}
```

#### 2. GetContractInstance Memory-Aware Implementation (following KeccakF1600)
```cpp
// In get_contract_instance.cpp
GetContractInstance::GetContractInstance(
    ExecutionIdManagerInterface& execution_id_manager,
    EventEmitterInterface<GetContractInstanceEvent>& event_emitter,
    ContractInstanceManagerInterface& instance_manager,
    RangeCheckInterface& range_check)
    : execution_id_manager(execution_id_manager)
    , event_emitter(event_emitter)
    , instance_manager(instance_manager)
    , range_check(range_check) {}

void GetContractInstance::retrieve_and_write(
    MemoryInterface& memory,
    MemoryAddress address_offset,
    MemoryAddress dst_offset,
    uint8_t member_enum)
{
    // Initialize event (like KeccakF1600)
    GetContractInstanceEvent event;
    event.execution_clk = execution_id_manager.get_execution_id();
    event.address_offset = address_offset;
    event.dst_offset = dst_offset;
    event.member_enum = member_enum;
    event.space_id = memory.get_space_id();
    
    try {
        // Memory bounds checking (following KeccakF1600 pattern)
        event.dst_out_of_bounds = check_memory_bounds(dst_offset);
        
        // Range check the dst offset regardless of bounds check result
        constexpr MemoryAddress HIGHEST_DST_ADDRESS = AVM_HIGHEST_MEM_ADDRESS - 1;
        MemoryAddress dst_abs_diff = (dst_offset <= HIGHEST_DST_ADDRESS) 
            ? (HIGHEST_DST_ADDRESS - dst_offset) 
            : (dst_offset - HIGHEST_DST_ADDRESS);
        event.dst_abs_diff = dst_abs_diff;
        range_check.assert_range(dst_abs_diff, AVM_MEMORY_NUM_BITS);
        
        if (event.dst_out_of_bounds) {
            throw GetContractInstanceException(format("Write dst out of range: ", dst_offset));
        }
        
        // Member enum validation
        event.member_enum_error = !validate_member_enum(member_enum);
        if (event.member_enum_error) {
            throw GetContractInstanceException(format("Invalid member enum: ", member_enum));
        }
        
        // Read contract address with tag checking (simple - only 1 read vs KeccakF1600's 25)
        auto [contract_address, tag_error] = read_contract_address(memory, address_offset);
        event.contract_address = contract_address;
        event.address_tag_error = tag_error;
        event.address_mem_value = event.contract_address;
        event.address_mem_tag = memory.get(address_offset).get_tag();
        
        if (event.address_tag_error) {
            throw GetContractInstanceException(format("Address tag invalid - addr: ", address_offset, 
                " tag: ", static_cast<uint32_t>(event.address_mem_tag)));
        }
        
        // Retrieve contract instance using core manager
        auto result = instance_manager.retrieve_contract_instance(event.contract_address);
        event.retrieval_error = !result.exists;
        event.instance_exists = result.exists;
        
        // Extract member value if instance exists
        if (result.exists) {
            event.selected_member_value = extract_member_value(result.contract_instance, member_enum);
        } else {
            event.selected_member_value = 0;
        }
        
        // Perform memory writes (simple - only 2 writes vs KeccakF1600's 25)
        write_results(memory, dst_offset, event.instance_exists, event.selected_member_value);
        event.result_exists_value = event.instance_exists ? 1 : 0;
        event.result_member_value = event.selected_member_value;
        
        // Emit event on success
        event_emitter.emit(event);
        
    } catch (const GetContractInstanceException& e) {
        // Emit event even on failure (following KeccakF1600 pattern)
        event.error = true;
        event_emitter.emit(event);
        throw e;
    }
}

std::pair<FF, bool> GetContractInstance::read_contract_address(MemoryInterface& memory, MemoryAddress address_offset) {
    const MemoryValue& mem_val = memory.get(address_offset);
    const MemoryTag tag = mem_val.get_tag();
    bool tag_error = (tag != MemoryTag::FF);
    return {mem_val.as<FF>(), tag_error};
}

void GetContractInstance::write_results(MemoryInterface& memory, MemoryAddress dst_offset, bool exists, FF member_value) {
    // Write existence flag (U1) at dst_offset
    memory.set(dst_offset, MemoryValue::from<uint1_t>(exists ? 1 : 0));
    
    // Write member value (FF) at dst_offset + 1
    memory.set(dst_offset + 1, MemoryValue::from<FF>(member_value));
}

bool GetContractInstance::check_memory_bounds(MemoryAddress dst_offset) {
    // Check that we can write to both dst_offset and dst_offset + 1
    constexpr MemoryAddress HIGHEST_DST_ADDRESS = AVM_HIGHEST_MEM_ADDRESS - 1;
    return dst_offset > HIGHEST_DST_ADDRESS;
}

bool GetContractInstance::validate_member_enum(uint8_t member_enum) {
    return member_enum <= 2;  // DEPLOYER=0, CLASS_ID=1, INIT_HASH=2
}

FF GetContractInstance::extract_member_value(const ContractInstance& instance, uint8_t member_enum) {
    switch (member_enum) {
        case 0: return instance.deployer.toField();                    // DEPLOYER
        case 1: return instance.currentContractClassId.toField();      // CLASS_ID
        case 2: return instance.initializationHash;                    // INIT_HASH
        default: return 0;  // Should not reach here due to validation
    }
}
```


#### 4. BytecodeManager Integration and bc_retrieval.pil Simplification

With the new core ContractInstanceManager, both BytecodeManager and bc_retrieval.pil can be significantly simplified:

```cpp
// In bytecode_manager.cpp - simplified with structured events
void BytecodeManager::process_contract(const FF& contract_address) {
    // Use shared contract instance manager component (emits ContractInstanceRetrievalEvent)
    auto result = ContractInstanceManager::retrieve_contract_instance(contract_address, db, emitter);
    
    if (!result.exists) {
        emit_bytecode_error_event(contract_address);
        return;
    }
    
    // Now focus only on bytecode-specific processing
    auto contract_class = get_contract_class(result.contract_instance.currentContractClassId);
    
    // Emit simplified BytecodeRetrievalEvent (following the pattern)
    auto bytecode_event = BytecodeRetrievalEvent{
        .bytecode_id = next_bytecode_id++,
        .address = contract_address,
        .contract_instance = result.contract_instance,  // Complex member from core retrieval
        .contract_class = contract_class,               // Only bytecode-specific data
        .nullifier_root = result.nullifier_tree_root,  // From core retrieval
        .public_data_tree_root = result.public_data_tree_root,
        .current_timestamp = result.timestamp,
        .error = false
    };
    emitter.emit(bytecode_event);
}
```

**bc_retrieval.pil Simplification:**

With the core gadget handling contract instance retrieval, `bc_retrieval.pil` can be simplified to focus only on bytecode-specific concerns:

```pil
namespace bc_retrieval;

// Interface columns (simplified - core instance data comes from lookup)
pol commit bytecode_id;
pol commit address;
pol commit error;

// Bytecode-specific data (not handled by core)
pol commit artifact_hash;
pol commit private_function_root;
pol commit public_bytecode_commitment;

// Link to core instance retrieval (simplified interface)
#[CORE_INSTANCE_RETRIEVAL_LOOKUP]
sel {
    address, error
} in contract_instance_retrieval.sel {
    contract_instance_retrieval.address,
    contract_instance_retrieval.error
};

// Bytecode-specific class ID derivation (only this gadget needs it)
#[CLASS_ID_DERIVATION]
sel * (1 - error) {
    current_class_id,
    artifact_hash,
    private_function_root,
    public_bytecode_commitment
} in class_id_derivation.sel {
    class_id_derivation.current_class_id,
    class_id_derivation.artifact_hash,
    class_id_derivation.private_function_root,
    class_id_derivation.public_bytecode_commitment
};

// Note: Address derivation, nullifier checks, and update validation
// are now handled by the core contract_instance_retrieval.pil gadget
```

**Benefits of this approach:**
- **Reduced Duplication**: bc_retrieval no longer duplicates instance validation logic
- **Clear Separation**: Core instance concerns vs bytecode-specific concerns
- **Simplified Events**: Complex members maintain semantic structure
- **Better Maintainability**: Changes to instance validation only affect the core gadget

#### 5. Database Integration
The existing ContractDBInterface and HighLevelMerkleDBInterface provide all required functionality for contract instance retrieval, nullifier checking, and tree root access. The shared `ContractInstanceManager` component uses these existing interfaces without requiring any database changes.

## Change Set

### New Files
1. `barretenberg/cpp/pil/vm2/gadgets/contract_instance_retrieval.pil` - Core shared retrieval gadget
2. `barretenberg/cpp/src/barretenberg/vm2/simulation/contract_instance_manager.hpp` - Core shared manager interface
3. `barretenberg/cpp/src/barretenberg/vm2/simulation/contract_instance_manager.cpp` - Core shared manager implementation
4. `barretenberg/cpp/src/barretenberg/vm2/simulation/contract_instance_manager.test.cpp` - Core manager tests
5. `barretenberg/cpp/src/barretenberg/vm2/simulation/events/contract_instance_events.hpp` - ContractInstanceRetrievalEvent structure
6. `barretenberg/cpp/src/barretenberg/vm2/tracegen/contract_instance_trace.hpp` - Contract instance retrieval tracegen interface
7. `barretenberg/cpp/src/barretenberg/vm2/tracegen/contract_instance_trace.cpp` - Contract instance retrieval tracegen implementation

### Modified Files
1. `barretenberg/cpp/pil/vm2/execution.pil` - Add GetContractInstance virtual gadget following get_env_var pattern
2. `barretenberg/cpp/pil/vm2/precomputed.pil` - Add member enum validation table following get_env_var pattern
3. `barretenberg/cpp/pil/vm2/gadgets/bc_retrieval.pil` - Update to use shared contract_instance_retrieval gadget
4. `barretenberg/cpp/src/barretenberg/vm2/simulation/execution.hpp` - Add ContractInstanceManager dependency and get_contract_instance method
5. `barretenberg/cpp/src/barretenberg/vm2/simulation/execution.cpp` - Implement get_contract_instance directly (virtual gadget)
6. `barretenberg/cpp/src/barretenberg/vm2/simulation/execution.test.cpp` - Update for new ContractInstanceManager integration
7. `barretenberg/cpp/src/barretenberg/vm2/tracegen/execution_trace.cpp` - Add virtual gadget trace generation
8. `barretenberg/cpp/src/barretenberg/vm2/common/opcodes.hpp` - Add GETCONTRACTINSTANCE opcode enum
9. `barretenberg/cpp/src/barretenberg/vm2/common/aztec_types.hpp` - Add ContractInstanceMember enum
10. `barretenberg/cpp/src/barretenberg/vm2/simulation/bytecode_manager.cpp` - Use shared ContractInstanceManager
11. `barretenberg/cpp/src/barretenberg/vm2/simulation/bytecode_manager.hpp` - Update interface for shared component
12. `barretenberg/cpp/src/barretenberg/vm2/simulation_helper.cpp` - Add ContractInstanceManager creation and injection
13. `barretenberg/cpp/src/barretenberg/vm2/simulation/events/events_container.hpp` - Add ContractInstanceRetrievalEvent container

### Removed Files
1. ~~`get_contract_instance.hpp/.cpp`~~ - Not needed (virtual gadget approach)
2. ~~`get_contract_instance_events.hpp`~~ - Not needed (virtual gadget approach)  
3. ~~`get_contract_instance.pil`~~ - Not needed (virtual gadget approach)

### Dependencies
All in simulation, tracegen, and PIL:
- Address derivation gadget (may need updates for new interaction pattern)
- Contract update checking gadget (may need updates for contract instance validation)
- Bytecode Manager & Retrieval (needs updates to use new core Contract Instance Manager and Retrieval)
- (NEW!) Contract Instance Manager & Retrieval

**Note**: Class ID derivation gadget is NOT a dependency of the core contract instance retrieval gadget. It remains a dependency only of the bytecode retrieval gadget (`bc_retrieval.pil`).

## Implementation Tasks

### Phase 1: Core Shared Component
1. **Create Contract Instance Manager** (`contract_instance_manager.hpp/.cpp`)
   - Implement shared contract instance retrieval logic
   - Add event emission for `ContractInstanceRetrievalEvent`
   - Integrate with existing database interfaces
   - Update simulation_helper.cpp to create and inject the component

### Phase 2: Virtual Gadget Implementation  
2. **Update Execution for Virtual Gadget** (`execution.hpp/.cpp`)
   - Implement `get_contract_instance()` method directly in execution
   - Add ContractInstanceManager dependency to Execution constructor
   - Handle standard memory read/write for dstOffset
   - Handle manual memory write for dstOffset+1 (non-standard)
   - Add member enum validation and selection logic
   - Update opcode dispatch in execution.cpp

3. **Update Execution Tests** (`execution.test.cpp`)
   - Remove GetContractInstance mocks (no longer needed)
   - Update Execution constructor calls to use ContractInstanceManager
   - Add tests for the get_contract_instance method

### Phase 3: PIL Virtual Gadget and Tracegen
4. **Add Virtual Gadget to Execution PIL** (`execution.pil`)
   - Add GetContractInstance virtual gadget columns following get_env_var pattern
   - Add member selection constraint logic
   - Add manual write constraint for dstOffset+1
   - Add bounds checking constraints
   - Add precomputed table lookup for member enum validation

5. **Add Contract Instance Retrieval PIL Gadget** (`contract_instance_retrieval.pil`)
   - Implement shared core gadget for contract instance validation
   - Add lookups to address derivation, nullifier checks, and update validation
   - Add error handling and constraint logic

6. **Update Execution Tracegen** (`execution_trace.cpp`)
   - Add virtual gadget trace generation for GetContractInstance
   - Handle member enum validation and selection trace data
   - Handle contract instance retrieval data from events
   - Add manual write trace handling for dstOffset+1

7. **Add Contract Instance Retrieval Tracegen** (`contract_instance_trace.cpp/.hpp`)
   - Implement trace generation for contract instance retrieval events
   - Handle event processing and PIL column population
   - Add interaction definitions and lookup management

8. **Update Precomputed Tables** (`precomputed.pil` and tracegen)
   - Add member enum validation table following get_env_var pattern
   - Include member selection flags (is_deployer, is_class_id, is_init_hash) but no output tag (all members are FF)
   - Update precomputed trace generation logic

### Phase 4: Bytecode Integration
9. **Modify Bytecode Manager** (`bytecode_manager.hpp/.cpp`)
   - Update to use shared ContractInstanceManager
   - Simplify bytecode-specific event emission
   - Remove duplicate contract instance validation logic

10. **Modify Bytecode Retrieval PIL Gadget** (`bc_retrieval.pil`)
    - Update to use shared contract instance retrieval lookup
    - Remove duplicate instance validation constraints
    - Focus on bytecode-specific class ID derivation

11. **Update Bytecode Tracegen** (`bytecode_trace.cpp`)
    - Update to work with shared contract instance data
    - Ensure compatibility with new shared architecture

### Phase 5: Testing - Simulation
12. **Contract Instance Manager Unit Tests** (`contract_instance_manager.test.cpp`)
    - Test core retrieval functionality
    - Test database integration and caching
    - Test error handling and edge cases

13. **Execution Integration Tests**
    - Test GetContractInstance opcode dispatch
    - Test virtual gadget implementation
    - Test member enum validation and selection
    - Test manual memory write for dstOffset+1
    - Test gas consumption and limits

### Phase 6: Testing - PIL and Tracegen
14. **Contract Instance Retrieval Tracegen Tests**
    - Test event processing and PIL column generation
    - Test lookup relationships and interactions
    - Test trace consistency and validation

15. **Virtual Gadget Tracegen Tests**
    - Test virtual gadget trace generation
    - Test member selection trace logic
    - Test manual write trace handling
    - Test precomputed table integration

### Phase 7: Testing - Constraining  
16. **Contract Instance Retrieval Constraint Tests**
    - Test core retrieval constraint logic
    - Test address derivation lookup integration
    - Test nullifier check constraint integration
    - Test update validation constraint integration

17. **Virtual Gadget Constraint Tests**
    - Test virtual gadget constraint logic
    - Test member selection constraints
    - Test manual write constraints
    - Test bounds checking constraints

### Phase 8: Integration Testing
18. **End-to-End Opcode Tests**
    - Deploy contracts and test GetContractInstance functionality
    - Test with various contract instance configurations
    - Test gas consumption and performance
    - Test interaction with other opcodes

19. **Bytecode Manager Integration Tests**
    - Verify shared component integration works correctly
    - Test contract instance validation consistency
    - Test event emission and trace generation
    - Validate backward compatibility

20. **Full PIL Circuit Integration Tests**
    - Test complete circuit with both GetContractInstance and bytecode retrieval
    - Verify constraint satisfaction and lookup integrity
    - Test performance and trace size implications
    - Validate security and correctness properties

## Test Plan

### Unit Tests

#### 1. C++ Simulation Tests
```cpp
TEST(GetContractInstanceTest, ValidContractInstance) {
    // Test successful retrieval of existing contract instance
    // Verify correct member extraction for each enum value
    // Validate memory writes (exists=true, correct member value)
}

TEST(GetContractInstanceTest, NonExistentContract) {
    // Test querying non-existent contract
    // Verify memory writes (exists=false, member_value=0)
}

TEST(GetContractInstanceTest, InvalidMemberEnum) {
    // Test invalid member enum handling
    // Should trigger opcode error
}

TEST(GetContractInstanceTest, IncorrectMemoryTags) {
    // Test address input with wrong memory tag
    // Should trigger addressing error
}
```

#### 2. PIL Constraint Tests
```cpp
TEST(GetContractInstanceConstraintTest, MemberSelection) {
    // Test member selection constraint for each enum value
    // Verify correct member is selected based on enum
}

TEST(GetContractInstanceConstraintTest, AddressDerivation) {
    // Test address derivation lookup interaction
    // Verify instance data produces correct contract address
}

TEST(GetContractInstanceConstraintTest, NullifierCheck) {
    // Test nullifier existence checking
    // Verify nullifier computation and lookup
}

TEST(GetContractInstanceConstraintTest, ContractUpdateCheck) {
    // Test contract update validation
    // Verify contract class update checking logic
}
```

### Integration Tests

#### 1. End-to-End Opcode Tests
- Deploy contract and verify GetContractInstance returns correct data
- Test with canonical addresses (magic address handling)
- Test gas consumption and limits
- Test interaction with other opcodes

#### 2. BytecodeManager Integration
- Verify shared validation logic works correctly
- Test contract update checking integration
- Validate nullifier computation consistency

### Performance Tests
- Benchmark opcode execution time
- Verify gas costs are appropriate
- Test with large numbers of contract instances

### Negative Tests
- Test with malformed contract instances
- Test address derivation mismatches  
- Test nullifier check failures
- Test memory access violations

## Future Considerations

1. **Magic Address Handling**: Currently planning to skip magic address handling like bytecode retrieval does, but this may need revisiting based on protocol requirements.

2. **Gas Limits**: Consider whether additional limits are needed beyond base gas costs (e.g., limits on number of unique contract instances accessed).

3. **Optimization**: The dual memory write pattern may be useful for other opcodes and could be generalized.

4. **Caching**: Contract instance lookups could benefit from caching strategies similar to bytecode management.

5. **Debugging Support**: Add comprehensive tracing and debugging support for instance resolution failures.
