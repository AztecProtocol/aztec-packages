#ifndef AVM_TRANSPILER_H
#define AVM_TRANSPILER_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Result structure for transpilation operations
 *
 * Fields:
 * - success: 1 if successful, 0 if failed
 * - data: Pointer to output data (JSON string as bytes)
 * - length: Length of output data in bytes
 * - error_message: Error message if failed (null-terminated string)
 */
typedef struct {
    int success;
    unsigned char* data;
    size_t length;
    char* error_message;
} TranspileResult;

/**
 * Transpiles an ACIR contract artifact file to AVM bytecode
 *
 * @param input_path Path to input ACIR contract artifact JSON file
 * @param output_path Path to output transpiled contract artifact JSON file
 * @return TranspileResult containing success status, output data, or error message
 *
 * The function reads the ACIR contract from input_path, transpiles it to AVM bytecode,
 * and writes the result to output_path. The output data in the result contains
 * the same JSON that was written to the file.
 *
 * Call avm_free_result() to free the returned result.
 */
TranspileResult avm_transpile_file(const char* input_path, const char* output_path);

/**
 * Transpiles raw ACIR contract artifact bytecode to AVM bytecode
 *
 * @param input_data Pointer to input ACIR contract artifact JSON data
 * @param input_length Length of input data in bytes
 * @return TranspileResult containing success status, output data, or error message
 *
 * The function takes raw JSON bytes representing an ACIR contract artifact,
 * transpiles it to AVM bytecode, and returns the transpiled contract artifact
 * as JSON bytes in the result.
 *
 * Call avm_free_result() to free the returned result.
 */
TranspileResult avm_transpile_bytecode(const unsigned char* input_data, size_t input_length);

/**
 * Frees memory allocated by a TranspileResult
 *
 * @param result Pointer to TranspileResult to free
 *
 * This function must be called to free the memory allocated by
 * avm_transpile_file() and avm_transpile_bytecode().
 */
void avm_free_result(TranspileResult* result);

#ifdef __cplusplus
}
#endif

#endif /* AVM_TRANSPILER_H */