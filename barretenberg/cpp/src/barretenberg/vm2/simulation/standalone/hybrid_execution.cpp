#include "barretenberg/vm2/simulation/standalone/hybrid_execution.hpp"

#include "barretenberg/common/bb_bench.hpp"

namespace bb::avm2::simulation {

// This context interface is a top-level enqueued one.
// NOTE: For the moment this trace is not returning the context back.
EnqueuedCallResult HybridExecution::execute(std::unique_ptr<ContextInterface> enqueued_call_context)
{
    BB_BENCH_NAME("HybridExecution::execute");
    external_call_stack.push(std::move(enqueued_call_context));
    std::vector<FF> enqueued_call_output;

    while (!external_call_stack.empty()) {
        // We fix the context at this point. Even if the opcode changes the stack
        // we'll always use this in the loop.
        auto& context = *external_call_stack.top();

        try {
            auto pc = context.get_pc();

            //// Temporality group 1 starts ////

            // We try to get the bytecode id. This can throw if the contract is not deployed or if we have retrieved too
            // many unique class ids. Note: bytecode_id is tracked in context events, not in the top-level execution
            // event. It is already included in the before_context_event (defaulting to 0 on error/not-found).
            context.get_bytecode_manager().get_bytecode_id();

            //// Temporality group 2 starts ////

            // We try to fetch an instruction.
            Instruction instruction = context.get_bytecode_manager().read_instruction(pc);

            debug("@", pc, " ", instruction.to_string());
            context.set_next_pc(pc + static_cast<uint32_t>(instruction.size_in_bytes()));

            //// Temporality group 4 starts ////

            // Resolve the operands.
            AddressingEvent addressing_event; // FIXME(fcarreiro): shouldn't need this.
            auto addressing = execution_components.make_addressing(addressing_event);
            std::vector<Operand> resolved_operands = addressing->resolve(instruction, context.get_memory());

            //// Temporality group 5+ starts ////
            GasEvent gas_event; // FIXME(fcarreiro): shouldn't need this.
            gas_tracker = execution_components.make_gas_tracker(gas_event, instruction, context);
            dispatch_opcode(instruction.get_exec_opcode(), context, resolved_operands);
        }
        // TODO(fcarreiro): handle this in a better way.
        catch (const BytecodeRetrievalError& e) {
            vinfo("Bytecode retrieval error:: ", e.what());
            handle_exceptional_halt(context);
        } catch (const InstructionFetchingError& e) {
            vinfo("Instruction fetching error: ", e.what());
            handle_exceptional_halt(context);
        } catch (const AddressingException& e) {
            vinfo("Addressing exception: ", e.what());
            handle_exceptional_halt(context);
        } catch (const RegisterValidationException& e) {
            vinfo("Register validation exception: ", e.what());
            handle_exceptional_halt(context);
        } catch (const OutOfGasException& e) {
            vinfo("Out of gas exception: ", e.what());
            handle_exceptional_halt(context);
        } catch (const OpcodeExecutionException& e) {
            vinfo("Opcode execution exception: ", e.what());
            handle_exceptional_halt(context);
        } catch (const std::exception& e) {
            // This is a coding error, we should not get here.
            // All exceptions should fall in the above catch blocks.
            info("An unhandled exception occurred: ", e.what());
            throw e;
        }

        // We always do what follows. "Finally".
        // Move on to the next pc.
        context.set_pc(context.get_next_pc());
        execution_id_manager.increment_execution_id();

        // If the context has halted, we need to exit the external call.
        // The external call stack is expected to be popped.
        if (context.halted()) {
            // If this is the top-level enqueued call (only one context left), capture the return data
            // before the context and its memory are destroyed by handle_exit_call.
            // NOTE: Simulation for witgen does not attempt to do this.
            if (external_call_stack.size() == 1) {
                enqueued_call_output = extract_return_data(context);
            }
            handle_exit_call();
        }
    }

    ExecutionResult result = get_execution_result();
    return {
        .success = result.success,
        .gas_used = result.gas_used,
        .output = std::move(enqueued_call_output),
    };
}

// TODO: this is a DOS vector if the return data is large. This is also a problem in TS.
std::vector<FF> HybridExecution::extract_return_data(ContextInterface& context)
{
    auto& memory = context.get_memory();
    const auto& result = get_execution_result();
    std::vector<FF> output;

    try {
        output.reserve(result.rd_size);
        // TODO: perform checks.
        for (uint32_t addr = result.rd_offset; addr < result.rd_offset + result.rd_size; addr++) {
            output.push_back(memory.get(addr).as_ff());
        }
        return output;
    } catch (const std::exception& e) {
        vinfo("HybridExecution::extract_return_data: error extracting return data: ", e.what());
        return {};
    }
}

} // namespace bb::avm2::simulation
