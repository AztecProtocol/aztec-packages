# @aztec/foundation

Version: v4.0.0-devnet.1-patch.0

## Quick Import Reference

```typescript
import {
  AbortError,
  BadRequestError,
  Buffer16,
  Buffer32,
  BufferReader,
  // ... and more
} from '@aztec/foundation';
```

## Classes

### AbortError

Represents an error thrown when an operation is aborted.

Extends: `Error`

**Constructor**
```typescript
new AbortError(message?: string)
```

**Properties**
- `readonly name: "AbortError"`

### BadRequestError

Extends: `Error`

**Constructor**
```typescript
new BadRequestError(message: string)
```

### Buffer16

A class representing a 16 byte Buffer.

**Constructor**
```typescript
new Buffer16(buffer: Buffer)
```

**Properties**
- `buffer: Buffer` - The buffer containing the hash.
- `static SIZE: number` - The size of the hash in bytes.
- `static ZERO: Buffer16` - Buffer16 with value zero.

**Methods**
- `[custom]() => string`
- `equals(hash: Buffer16) => boolean` - Checks if this hash and another hash are equal.
- `static fromBigInt(hash: bigint) => Buffer16` - Creates a Buffer16 from a bigint.
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Buffer16` - Creates a Buffer16 from a buffer.
- `static fromField(hash: Fr) => Buffer16`
- `static fromNumber(num: number) => Buffer16` - Converts a number into a Buffer16 object.
- `static fromString(str: string) => Buffer16` - Converts a hex string into a Buffer16 object.
- `isZero() => boolean` - Returns true if this hash is zero.
- `static random() => Buffer16` - Generates a random Buffer16.
- `toBigInt() => bigint` - Convert this hash to a big int.
- `toBuffer() => Buffer<ArrayBufferLike>` - Returns the raw buffer of the hash.
- `toJSON() => string`
- `toString() => string` - Convert this hash to a hex string.

### Buffer32

A class representing a 32 byte Buffer.

**Constructor**
```typescript
new Buffer32(buffer: Buffer)
```

**Properties**
- `buffer: Buffer` - The buffer containing the hash.
- `static SIZE: number` - The size of the hash in bytes.
- `static ZERO: Buffer32` - Buffer32 with value zero.

**Methods**
- `[custom]() => string`
- `equals(hash: Buffer32) => boolean` - Checks if this hash and another hash are equal.
- `static fromBigInt(hash: bigint) => Buffer32` - Creates a Buffer32 from a bigint.
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Buffer32` - Creates a Buffer32 from a buffer.
- `static fromBuffer28(buffer: Buffer) => Buffer32` - Converts this hash from a buffer of 28 bytes. Verifies the input is 28 bytes.
- `static fromField(hash: Fr) => Buffer32`
- `static fromNumber(num: number) => Buffer32` - Converts a number into a Buffer32 object.
- `static fromString(str: string) => Buffer32` - Converts a string into a Buffer32 object.
- `isZero() => boolean` - Returns true if this hash is zero.
- `static random() => Buffer32` - Generates a random Buffer32.
- `toBigInt() => bigint` - Convert this hash to a big int.
- `toBuffer() => Buffer<ArrayBufferLike>` - Returns the raw buffer of the hash.
- `toJSON() => string`
- `toString() => string` - Convert this hash to a hex string.

### BufferReader

The BufferReader class provides a utility for reading various data types from a buffer. It supports reading numbers, booleans, byte arrays, Fr and Fq field elements, vectors, arrays, objects, strings, and maps. It maintains an internal index to keep track of the current reading position in the buffer. Usage: Create a new instance of BufferReader with a buffer and an optional offset. Use the provided methods to read desired data types from the buffer. The reading methods automatically advance the internal index.

**Constructor**
```typescript
new BufferReader(buffer: Buffer, offset: number)
```

**Methods**
- `static asReader(bufferOrReader: Buffer<ArrayBufferLike> | Uint8Array<ArrayBufferLike> | BufferReader) => BufferReader` - Creates a BufferReader instance from either a Buffer or an existing BufferReader. If the input is a Buffer, it creates a new BufferReader with the given buffer. If the input is already a BufferReader, it returns the input unchanged.
- `getLength() => number` - Get the length of the reader's buffer.
- `isEmpty() => boolean` - Returns true if the underlying buffer has been consumed completely.
- `peekBytes(n?: number) => Buffer` - Returns a Buffer containing the next n bytes from the current buffer without modifying the reader's index position. If n is not provided or exceeds the remaining length of the buffer, it returns all bytes from the current position till the end of the buffer.
- `readArray<T, N extends number>(size: N, itemDeserializer: { fromBuffer: (reader: BufferReader) => T }) => Tuple<T, N>` - Read an array of a fixed size with elements of type T from the buffer. The 'itemDeserializer' object should have a 'fromBuffer' method that takes a BufferReader instance as input, and returns an instance of the desired deserialized data type T. This method will call the 'fromBuffer' method for each element in the array and return the resulting array.
- `readBigInt() => bigint` - Alias for readUInt256
- `readBoolean() => boolean` - Reads and returns the next boolean value from the buffer. Advances the internal index by 1, treating the byte at the current index as a boolean value. Returns true if the byte is non-zero, false otherwise.
- `readBuffer(maxSize?: number) => Buffer` - Reads a buffer from the current position of the reader and advances the index. The method first reads the size (number) of bytes to be read, and then returns a Buffer with that size containing the bytes. Useful for reading variable-length binary data encoded as (size, data) format.
- `readBufferArray(size: number) => Buffer<ArrayBufferLike>[]` - Read a variable sized Buffer array where elements are represented by length + data. The method consecutively looks for a number which is the size of the proceeding buffer, then reads the bytes until it reaches the end of the reader's internal buffer. NOTE: if `size` is not provided, this will run to the end of the reader's buffer.
- `readBytes(n: number) => Buffer` - Reads a specified number of bytes from the buffer and returns a new Buffer containing those bytes. Advances the reader's index by the number of bytes read. Throws an error if there are not enough bytes left in the buffer to satisfy the requested number of bytes.
- `readMap<T>(deserializer: { fromBuffer: (reader: BufferReader) => T }) => {}` - Reads and constructs a map object from the current buffer using the provided deserializer. The method reads the number of entries in the map, followed by iterating through each key-value pair. The key is read as a string, while the value is obtained using the passed deserializer's `fromBuffer` method. The resulting map object is returned, containing all the key-value pairs read from the buffer.
- `readNumber() => number` - Reads a 32-bit unsigned integer from the buffer at the current index position. Updates the index position by 4 bytes after reading the number.
- `readNumbers<N extends number>(count: N) => Tuple<number, N>` - Reads `count` 32-bit unsigned integers from the buffer at the current index position.
- `readNumberVector() => number[]` - Reads a vector of numbers from the buffer and returns it as an array of numbers. The method utilizes the 'readVector' method, passing a deserializer that reads numbers.
- `readObject<T>(deserializer: { fromBuffer: (reader: BufferReader) => T }) => T` - Reads a serialized object from a buffer and returns the deserialized object using the given deserializer.
- `readString(maxSize?: number) => string` - Reads a string from the buffer and returns it. The method first reads the size of the string, then reads the corresponding number of bytes from the buffer and converts them to a string.
- `readToEnd() => Buffer` - Reads until the end of the buffer.
- `readUInt128() => bigint` - Reads a 128-bit unsigned integer from the buffer at the current index position. Updates the index position by 16 bytes after reading the number. Assumes the number is stored in big-endian format.
- `readUInt16() => number` - Reads a 16-bit unsigned integer from the buffer at the current index position. Updates the index position by 2 bytes after reading the number.
- `readUInt256() => bigint` - Reads a 256-bit unsigned integer from the buffer at the current index position. Updates the index position by 32 bytes after reading the number. Assumes the number is stored in big-endian format.
- `readUint256Vector() => bigint[]` - Reads a vector of 256-bit unsigned integers from the buffer and returns it as an array of bigints. The method utilizes the 'readVector' method, passing a deserializer that reads bigints.
- `readUInt64() => bigint` - Reads a 256-bit unsigned integer from the buffer at the current index position. Updates the index position by 32 bytes after reading the number. Assumes the number is stored in big-endian format.
- `readUInt8() => number` - Reads a 8-bit unsigned integer from the buffer at the current index position. Updates the index position by 1 byte after reading the number.
- `readUint8Array() => Uint8Array` - Reads a buffer from the current position of the reader and advances the index. The method first reads the size (number) of bytes to be read, and then returns a Buffer with that size containing the bytes. Useful for reading variable-length binary data encoded as (size, data) format.
- `readVector<T>(itemDeserializer: { fromBuffer: (reader: BufferReader) => T }, maxSize?: number) => T[]` - Reads a vector of fixed size from the buffer and deserializes its elements using the provided itemDeserializer object. The 'itemDeserializer' object should have a 'fromBuffer' method that takes a BufferReader instance and returns the deserialized element. The method first reads the size of the vector (a number) from the buffer, then iterates through its elements, deserializing each one using the 'fromBuffer' method of 'itemDeserializer'.
- `readVectorUint8Prefix<T>(itemDeserializer: { fromBuffer: (reader: BufferReader) => T }) => T[]` - Reads a vector of fixed size from the buffer and deserializes its elements using the provided itemDeserializer object. The 'itemDeserializer' object should have a 'fromBuffer' method that takes a BufferReader instance and returns the deserialized element. The method first reads the size of the vector (a number) from the buffer, then iterates through its elements, deserializing each one using the 'fromBuffer' method of 'itemDeserializer'.
- `remainingBytes() => number` - Gets bytes remaining to be read from the buffer.

### DateProvider

Returns current datetime.

**Constructor**
```typescript
new DateProvider()
```

**Methods**
- `now() => number`
- `nowAsDate() => Date`
- `nowInSeconds() => number`

### EthAddress

Represents an Ethereum address as a 20-byte buffer and provides various utility methods for converting between different representations, generating random addresses, validating checksums, and comparing addresses. EthAddress can be instantiated using a buffer or string, and can be serialized/deserialized from a buffer or BufferReader.

**Constructor**
```typescript
new EthAddress(buffer: Buffer)
```

**Properties**
- `static schema: unknown`
- `static SIZE_IN_BYTES: number` - The size of an Ethereum address in bytes.
- `static ZERO: EthAddress` - Represents a zero Ethereum address with 20 bytes filled with zeros.

**Methods**
- `[custom]() => string`
- `static areEqual(a: string | EthAddress, b: string | EthAddress) => boolean`
- `static checkAddressChecksum(address: string) => boolean` - Checks if the given Ethereum address has a valid checksum. The input 'address' should be prefixed with '0x' or not, and have exactly 40 hex characters. Returns true if the address has a valid checksum, false otherwise.
- `equals(rhs: EthAddress) => boolean` - Checks whether the given EthAddress instance is equal to the current instance. Equality is determined by comparing the underlying byte buffers of both instances.
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => EthAddress` - Deserializes from a buffer or reader, corresponding to a write in cpp.
- `static fromField(fr: Fr) => EthAddress` - Converts a field to a eth address.
- `static fromFields(fields: Fr[] | FieldReader) => EthAddress`
- `static fromNumber(num: number | bigint) => EthAddress` - Converts a number into an address. Useful for testing.
- `static fromPlainObject(obj: any) => EthAddress` - Creates an EthAddress from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack). Handles buffers (20 or 32 bytes), strings, or existing instances.
- `static fromString(address: string) => EthAddress` - Creates an EthAddress instance from a valid Ethereum address string. The input 'address' can be either in checksum format or lowercase, and it can be prefixed with '0x'. Throws an error if the input is not a valid Ethereum address.
- `static isAddress(address: string) => boolean` - Determines if the given string represents a valid Ethereum address. A valid address should meet the following criteria: 1. Contains exactly 40 hex characters (excluding an optional '0x' prefix). 2. Is either all lowercase, all uppercase, or has a valid checksum based on EIP-55.
- `isZero() => boolean` - Checks if the EthAddress instance represents a zero address. A zero address consists of 20 bytes filled with zeros and is considered an invalid address.
- `static random() => EthAddress` - Create a random EthAddress instance with 20 random bytes. This method generates a new Ethereum address with a randomly generated set of 20 bytes. It is useful for generating test addresses or unique identifiers.
- `toBuffer() => Buffer<ArrayBufferLike>` - Returns a 20-byte buffer representation of the Ethereum address.
- `toBuffer32() => Buffer<ArrayBuffer>` - Returns a 32-byte buffer representation of the Ethereum address, with the original 20-byte address occupying the last 20 bytes and the first 12 bytes being zero-filled. This format is commonly used in smart contracts when handling addresses as 32-byte values.
- `static toChecksumAddress(address: string) => string` - Converts an Ethereum address to its checksum format. The input 'address' should be prefixed with '0x' or not, and have exactly 40 hex characters. The checksum format is created by capitalizing certain characters in the hex string based on the hash of the lowercase address. Throws an error if the input address is invalid.
- `toChecksumString() => string` - Returns the Ethereum address as a checksummed string. The output string will have characters in the correct upper or lowercase form, according to EIP-55. This provides a way to verify if an address is typed correctly, by checking the character casing.
- `toField() => Fr` - Returns a new field with the same contents as this EthAddress.
- `toJSON() => string`
- `toString() => string` - Converts the Ethereum address to a hex-encoded string. The resulting string is prefixed with '0x' and has exactly 40 hex characters. This method can be used to represent the EthAddress instance in the widely used hexadecimal format.

### FieldReader

The FieldReader class provides a utility for reading various data types from a field array. Usage: Create a new instance of FieldReader with an array of fields and an optional offset. Use the provided methods to read desired data types from the field array. The reading methods automatically advance the internal index.

**Constructor**
```typescript
new FieldReader(fields: Fr[], offset: number)
```

**Properties**
- `cursor: unknown`

**Methods**
- `static asReader(fields: Fr[] | FieldReader) => FieldReader` - Creates a FieldReader instance from either a field array or an existing FieldReader.
- `isFinished() => boolean` - Returns whether the reader has finished reading all fields.
- `peekField() => Fr` - Peeks at the next field without advancing the cursor.
- `readArray<T, N extends number>(size: N, itemDeserializer: { fromFields: (reader: FieldReader) => T }) => Tuple<T, N>` - Read an array of a fixed size with elements of type T from the field array. The 'itemDeserializer' object should have a 'fromFields' method that takes a FieldReader instance as input, and returns an instance of the desired deserialized data type T. This method will call the 'fromFields' method for each element in the array and return the resulting array.
- `readBoolean() => boolean` - Reads and returns the next boolean value from the field array. Advances the internal index by 1, treating the field at the current index as a boolean value. Returns true if the field is non-zero, false otherwise. Throw if the value is not 0 or 1.
- `readField() => Fr` - Reads a single field from the array.
- `readFieldArray<N extends number>(size: N) => Tuple<Fr, N>` - Read an array of a fixed size field array.
- `readFq() => Fq` - Reads a Fq from the array.
- `readObject<T>(deserializer: { fromFields: (reader: FieldReader) => T }) => T` - Reads a serialized object from a field array and returns the deserialized object using the given deserializer.
- `readU32() => number` - Reads a 32-bit unsigned integer from the field array at the current index position. Updates the index position by 1 after reading the number. Throw if the value is greater than 2 ** 32.
- `readU64() => bigint` - Reads a 64-bit unsigned integer from the field array at the current index position. Updates the index position by 1 after reading the number. Throw if the value is greater than 2 ** 64.
- `remainingFields() => number`
- `skip(n: number) => void` - Skips the next n fields.

### InterruptError

Represents an error thrown when an operation is interrupted unexpectedly. This custom error class extends the built-in Error class in JavaScript and can be used to handle cases where a process or task is terminated before completion.

Extends: `Error`

**Constructor**
```typescript
new InterruptError(message?: string)
```

**Properties**
- `readonly name: "InterruptError"`

### InterruptibleSleep

InterruptibleSleep is a utility class that allows you to create an interruptible sleep function. The sleep function can be interrupted at any time by calling the `interrupt` method, which can also specify whether the sleep should throw an error or just return. This is useful when you need to terminate long-running processes or perform cleanup tasks in response to external events.

**Constructor**
```typescript
new InterruptibleSleep()
```

**Methods**
- `interrupt(sleepShouldThrow: boolean) => void` - Interrupts the current sleep operation and optionally throws an error if specified. By default, when interrupted, the sleep operation will resolve without throwing. If 'sleepShouldThrow' is set to true, the sleep operation will throw an InterruptError instead.
- `sleep(ms: number) => Promise<void>` - Sleep for a specified amount of time in milliseconds. The sleep function will pause the execution of the current async function for the given time period, allowing other tasks to run before resuming.

### ManualDateProvider

A date provider for tests that only advances time via explicit advanceTime() calls. Unlike TestDateProvider, this does NOT track real time progression - time is completely frozen until explicitly advanced. This eliminates flakiness from tests taking varying amounts of real time to execute.

Extends: `DateProvider`

**Constructor**
```typescript
new ManualDateProvider(initialTimeMs: number)
```

**Methods**
- `advanceTime(seconds: number) => void` - Advances the time by the given number of seconds.
- `advanceTimeMs(ms: number) => void` - Advances the time by the given number of milliseconds.
- `now() => number`
- `nowAsDate() => Date`
- `nowInSeconds() => number`
- `setTime(timeMs: number) => void` - Sets the current time to the given timestamp in milliseconds.

### NoRetryError

An error that indicates that the operation should not be retried.

Extends: `Error`

**Constructor**
```typescript
new NoRetryError(message?: string)
```

### SecretValue

A class wrapping a secret value to protect it from accidently being leaked in logs

**Constructor**
```typescript
new SecretValue(value: T, redactedValue: string)
```

**Methods**
- `[custom]() => string`
- `getValue() => T` - Returns the wrapped value
- `static schema<O>(valueSchema: ZodType<O, any, any>) => ZodType<SecretValue<O>, any, any>` - Returns a Zod schema
- `toJSON() => string` - Returns a redacted string representation of the value
- `toString() => string` - Returns a redacted string representation of the value

### TestDateProvider

Returns current datetime and allows to override it.

Extends: `DateProvider`

**Constructor**
```typescript
new TestDateProvider(logger: Logger)
```

**Methods**
- `advanceTime(seconds: number) => void` - Advances the time by the given number of seconds.
- `now() => number`
- `nowAsDate() => Date`
- `nowInSeconds() => number`
- `setTime(timeMs: number) => void`

### TimeoutError

An error thrown when an action times out.

Extends: `Error`

**Constructor**
```typescript
new TimeoutError(message?: string)
```

**Properties**
- `readonly name: "TimeoutError"`

### TimeoutTask

TimeoutTask class creates an instance for managing and executing a given asynchronous function with a specified timeout duration. The task will be automatically interrupted if it exceeds the given timeout duration, and will throw a custom error message. Additional information such as execution time can be retrieved using getTime method after the task has been executed.

**Constructor**
```typescript
new TimeoutTask(fn: (signal: AbortSignal) => Promise<T>, timeout: number, errorFn: () => Error, onAbort?: () => void)
```

**Methods**
- `exec() => Promise<T>` - Executes the given function with a specified timeout. If the function takes longer than the timeout, it will be interrupted and an error will be thrown. The total execution time of the function will be stored in the totalTime property.
- `getInterruptPromise() => Promise<never> | undefined` - Returns the interrupt promise associated with the TimeoutTask instance. The interrupt promise is used internally to reject the task when a timeout occurs. This method can be helpful when debugging or tracking the state of the task.
- `getTime() => number` - Get the total time spent on the most recent execution of the wrapped function. This method provides the duration from the start to the end of the function execution, whether it completed or timed out.

### Timer

Timer class to measure time intervals in milliseconds and seconds. Upon instantiation, it stores the current timestamp as the starting point. The 'ms()' method returns the elapsed time in milliseconds, while the 's()' method returns the elapsed time in seconds.

**Constructor**
```typescript
new Timer()
```

**Methods**
- `ms() => number` - Returns the elapsed time in milliseconds since the Timer instance was created. Provides a simple and convenient way to measure the time duration between two events or monitor performance of specific code sections.
- `s() => number` - Returns the time elapsed since the Timer instance was created, in seconds. The value is calculated by subtracting the initial start time from the current time and dividing the result by 1000 to convert milliseconds to seconds.
- `us() => number` - Return microseconds.

### TypeRegistry

Register a class here that has a toJSON method that returns: ``` { "type": "ExampleClassName", "value": <result of ExampleClassName.toString()> } ``` and has an e.g. ExampleClassName.fromString(string) method. This means you can then easily serialize/deserialize the type using JSON.stringify and JSON.parse.

**Constructor**
```typescript
new TypeRegistry()
```

**Methods**
- `static getConstructor(typeName: string) => Deserializable | undefined`
- `static register(typeName: string, constructor: Deserializable) => void`

### ZodNullableOptional

Extends: `ZodOptional<T>`

**Constructor**
```typescript
new ZodNullableOptional(def: ZodOptionalDef)
```

**Properties**
- `_isNullableOptional: boolean`

**Methods**
- `_parse(input: ParseInput) => ParseReturnType<T["_output"] | undefined>`
- `static create<T extends ZodTypeAny>(type: T) => ZodNullableOptional<T>`

## Interfaces

### ConfigMapping

**Properties**
- `defaultValue?: any`
- `deprecatedFallback?: { env: EnvVar; message?: string }[]` - List of deprecated env vars that are still supported but will log a warning. These should also be included in the fallback array for parsing.
- `description: string`
- `env?: EnvVar`
- `fallback?: EnvVar[]`
- `isBoolean?: boolean`
- `nested?: Record<string, ConfigMapping>`
- `parseEnv?: (val: string) => any`
- `printDefault?: (val: any) => string`

### Fq

Branding to ensure fields are not interchangeable types.

Extends: `BaseField`

**Properties**
- `_branding: "Fq"` - Brand.
- `hi: unknown`
- `lo: unknown`
- `size: unknown`
- `value: unknown`

**Methods**
- `[custom]() => string`
- `add(rhs: Fq) => Fq`
- `cmp(rhs: BaseField) => -1 | 0 | 1`
- `equals(rhs: BaseField) => boolean`
- `isEmpty() => boolean`
- `isZero() => boolean`
- `lt(rhs: BaseField) => boolean`
- `modulus() => bigint`
- `sqrt() => Promise<Fq | null>` - Computes a square root of the field element.
- `toBigInt() => bigint`
- `toBool() => boolean`
- `toBuffer() => Buffer` - Converts the bigint to a Buffer.
- `toField() => Fq`
- `toFields() => Fr[]`
- `toFriendlyJSON() => string`
- `toJSON() => string`
- `toNumber() => number` - Converts this field to a number. Throws if the underlying value is greater than MAX_SAFE_INTEGER.
- `toNumberUnsafe() => number` - Converts this field to a number. May cause loss of precision if the underlying value is greater than MAX_SAFE_INTEGER.
- `toShortString() => string`
- `toString() => string`

### Fr

Branding to ensure fields are not interchangeable types.

Extends: `BaseField`

**Properties**
- `_branding: "Fr"` - Brand.
- `size: unknown`
- `value: unknown`

**Methods**
- `[custom]() => string`
- `add(rhs: Fr) => Fr` - Arithmetic
- `cmp(rhs: BaseField) => -1 | 0 | 1`
- `div(rhs: Fr) => Fr`
- `ediv(rhs: Fr) => Fr`
- `equals(rhs: BaseField) => boolean`
- `isEmpty() => boolean`
- `isZero() => boolean`
- `lt(rhs: BaseField) => boolean`
- `modulus() => bigint`
- `mul(rhs: Fr) => Fr`
- `negate() => Fr`
- `sqrt() => Promise<Fr | null>` - Computes a square root of the field element.
- `square() => Fr`
- `sub(rhs: Fr) => Fr`
- `toBigInt() => bigint`
- `toBool() => boolean`
- `toBuffer() => Buffer` - Converts the bigint to a Buffer.
- `toField() => Fr`
- `toFriendlyJSON() => string`
- `toJSON() => string`
- `toNumber() => number` - Converts this field to a number. Throws if the underlying value is greater than MAX_SAFE_INTEGER.
- `toNumberUnsafe() => number` - Converts this field to a number. May cause loss of precision if the underlying value is greater than MAX_SAFE_INTEGER.
- `toShortString() => string`
- `toString() => string`

### FromBuffer

A deserializer

**Methods**
- `fromBuffer(buffer: Buffer) => T` - Deserializes an object from a buffer

### Point

Represents a Point on an elliptic curve with x and y coordinates. The Point class provides methods for creating instances from different input types, converting instances to various output formats, and checking the equality of points. Clean up this class.

**Properties**
- `inf: unknown`
- `readonly isInfinite: boolean` - Whether the point is at infinity
- `readonly kind: "point"` - Used to differentiate this class from AztecAddress
- `readonly x: Fr` - The point's x coordinate
- `readonly y: Fr` - The point's y coordinate

**Methods**
- `equals(rhs: Point) => boolean` - Check if two Point instances are equal by comparing their buffer values. Returns true if the buffer values are the same, and false otherwise.
- `hash() => Promise<Fr>`
- `isOnGrumpkin() => boolean`
- `isZero() => boolean`
- `toBigInts() => { isInfinite: bigint; x: bigint; y: bigint }` - Returns the contents of the point as BigInts.
- `toBuffer() => Buffer<ArrayBufferLike>` - Converts the Point instance to a Buffer representation of the coordinates.
- `toCompressedBuffer() => Buffer<ArrayBufferLike>` - Converts the Point instance to a compressed Buffer representation of the coordinates.
- `toFields() => Fr[]` - Returns the contents of the point as an array of 2 fields.
- `toJSON() => string`
- `toNoirStruct() => { is_infinite: boolean; x: Fr; y: Fr }`
- `toShortString() => string` - Generate a short string representation of the Point instance. The returned string includes the first 10 and last 4 characters of the full string representation, with '...' in between to indicate truncation. This is useful for displaying or logging purposes when the full string representation may be too long.
- `toString() => string` - Convert the Point instance to a hexadecimal string representation. The output string is prefixed with '0x' and consists of exactly 128 hex characters, representing the concatenated x and y coordinates of the point.
- `toWrappedNoirStruct() => { inner: { is_infinite: boolean; x: Fr; y: Fr } }`
- `toXAndSign() => []` - Returns the x coordinate and the sign of the y coordinate.

### TypedEventEmitter

Type-safe Event Emitter type

**Methods**
- `emit<K extends string | number | symbol>(event: K, ...args: Parameters<TEventMap[K]>) => boolean`
- `off<K extends string | number | symbol>(event: K, listener: TEventMap[K]) => this`
- `on<K extends string | number | symbol>(event: K, listener: TEventMap[K]) => this`
- `once<K extends string | number | symbol>(event: K, listener: TEventMap[K]) => this`
- `removeAllListeners<K extends string | number | symbol>(event: K) => this`
- `removeListener<K extends string | number | symbol>(event: K, listener: TEventMap[K]) => this`

## Functions

### addLogBindingsHandler
```typescript
function addLogBindingsHandler(handler: LogBindingsHandler) => void
```

### addLogDataHandler
```typescript
function addLogDataHandler(handler: LogDataHandler) => void
```

### applyStringFormatting
```typescript
function applyStringFormatting(formatStr: string, args: Printable[]) => string
```
Format a debug string filling in `'{0}'` entries with their corresponding values from the args array, amd `'{}'` with the whole array.

### areArraysEqual
```typescript
function areArraysEqual<T>(a: T[], b: T[], eq: (a: T, b: T) => boolean) => boolean
```
Returns whether two arrays are equal. The arrays are equal if they have the same length and all elements are equal.

### arrayNonEmptyLength
```typescript
function arrayNonEmptyLength<T>(arr: T[], isEmpty: (item: T) => boolean) => number
```
Returns the number of non-empty items in an array.

### arraySerializedSizeOfNonEmpty
```typescript
function arraySerializedSizeOfNonEmpty(arr: { isZero: () => boolean } | { isEmpty: () => boolean } & { toBuffer: () => Buffer }[]) => number
```
Returns the serialized size of all non-empty items in an array.

### assertLength
```typescript
function assertLength<T, N extends number>(array: T[], n: N) => Tuple<T, N>
```
Check an array size, and cast it to a tuple.

### assertRequired
```typescript
function assertRequired<T extends object>(obj: T) => Required<T>
```
Asserts all values in object are not undefined.

### backoffGenerator
```typescript
function backoffGenerator() => Generator<number, void, unknown>
```
Generates a backoff sequence for retrying operations with an increasing delay. The backoff sequence follows this pattern: 1, 1, 1, 2, 4, 8, 16, 32, 64, ... This generator can be used in combination with the `retry` function to perform retries with exponential backoff and capped at 64 seconds between attempts.

### bigintConfigHelper
```typescript
function bigintConfigHelper(defaultVal?: bigint) => Pick<ConfigMapping, "parseEnv" | "defaultValue">
```
Generates parseEnv and default values for a numerical config value.

### bigintToUInt128BE
```typescript
function bigintToUInt128BE(n: bigint, bufferSize: number) => Buffer<ArrayBufferLike>
```
Convert a bigint to a big-endian unsigned 128-bit integer Buffer.

### bigintToUInt64BE
```typescript
function bigintToUInt64BE(n: bigint, bufferSize: number) => Buffer<ArrayBuffer>
```
Convert a bigint to a big-endian unsigned 64-bit integer Buffer.

### boolToBuffer
```typescript
function boolToBuffer(value: boolean, bufferSize: number) => Buffer
```
Serializes a boolean to a buffer.

### boolToByte
```typescript
function boolToByte(b: boolean) => Buffer<ArrayBuffer>
```
Convert a boolean value to its corresponding byte representation in a Buffer of size 1. The function takes a boolean value and writes it into a new buffer as either 1 (true) or 0 (false). This method is useful for converting a boolean value into a binary format that can be stored or transmitted easily.

### booleanConfigHelper
```typescript
function booleanConfigHelper(defaultVal: boolean) => Required<Pick<ConfigMapping, "parseEnv" | "defaultValue" | "isBoolean"> & { parseVal: (val: string) => boolean }>
```
Generates parseEnv and default values for a boolean config value.

### bufferSchemaFor
```typescript
function bufferSchemaFor<TClass extends {}>(klazz: TClass, refinement?: (buf: Buffer) => boolean) => ZodType<unknown, any, string>
```
Creates a schema that accepts a base64 string and uses it to hydrate an instance.

### chunk
```typescript
function chunk<T>(items: T[], chunkSize: number) => T[][]
```
Splits the given iterable into chunks of the given size. Last chunk may be of smaller than the requested size.

### chunkBy
```typescript
function chunkBy<T, U>(items: T[], fn: (item: T) => U) => T[][]
```
Splits the given iterable into chunks based on the key returned by the given function. Items must be contiguous to be included in the same chunk.

### chunkWrapAround
```typescript
function chunkWrapAround<T>(items: T[], chunkSize: number) => T[][]
```
Splits the given array into chunks of the given size, wrapping around to the beginning if the last chunk would be smaller than the requested size. Returns empty array for empty input. Returns single chunk with all items if chunkSize <= 0.

### compact
```typescript
function compact<T extends object>(obj: T) => { [key: string]: unknown }
```
Returns a new object where all keys with undefined values have been removed.

### compactArray
```typescript
function compactArray<T>(arr: T | undefined[]) => T[]
```
Removes all undefined elements from the array.

### countWhile
```typescript
function countWhile<T>(collection: T[], predicate: (x: T) => boolean) => number
```
Counts how many items from the beginning of the array match the given predicate.

### createConsoleLogger
```typescript
function createConsoleLogger(prefix?: string) => LogFn
```
Creates a Logger function with an optional prefix for log messages. If a prefix is provided, the created logger will prepend it to each log message. If no prefix is provided, the default console.log will be returned.

### createLibp2pComponentLogger
```typescript
function createLibp2pComponentLogger(namespace: string, bindings?: LoggerBindings) => ComponentLogger
```
Creates a libp2p compatible logger that wraps our pino logger. This adapter implements the ComponentLogger interface required by libp2p.

### createLogger
```typescript
function createLogger(module: string, bindings?: LoggerBindings) => Logger
```

### deserializeArrayFromVector
```typescript
function deserializeArrayFromVector<T>(deserialize: DeserializeFn<T>, vector: Buffer, offset: number) => { adv: number; elem: T[] }
```
Deserializes an array from a vector on an element-by-element basis.

### deserializeBigInt
```typescript
function deserializeBigInt(buf: Buffer, offset: number, width: number) => { adv: number; elem: bigint }
```
Deserialize a big integer from a buffer, given an offset and width. Reads the specified number of bytes from the buffer starting at the offset, converts it to a big integer, and returns the deserialized result along with the number of bytes read (advanced).

### deserializeBool
```typescript
function deserializeBool(buf: Buffer, offset: number) => { adv: number; elem: number }
```
Deserialize a boolean value from a given buffer at the specified offset. Reads a single byte at the provided offset in the buffer and returns the deserialized boolean value along with the number of bytes read (adv).

### deserializeField
```typescript
function deserializeField(buf: Buffer, offset: number) => { adv: number; elem: Buffer<ArrayBuffer> }
```
Deserialize the 256-bit number at address `offset`.

### deserializeInt32
```typescript
function deserializeInt32(buf: Buffer, offset: number) => { adv: number; elem: number }
```
Deserialize a signed 32-bit integer from a buffer at the given offset. The input 'buf' should be a Buffer containing binary data, and 'offset' should be the position in the buffer where the signed 32-bit integer starts. Returns an object with both the deserialized integer (elem) and the number of bytes advanced in the buffer (adv, always equal to 4).

### deserializeUInt32
```typescript
function deserializeUInt32(buf: Buffer, offset: number) => { adv: number; elem: number }
```
Deserialize a 4-byte unsigned integer from a buffer, starting at the specified offset. The deserialization reads 4 bytes from the given buffer and converts it into a number. Returns an object containing the deserialized unsigned integer and the number of bytes advanced (4).

### elapsed
```typescript
function elapsed<T>(fn: Promise<T> | () => T | Promise<T>) => Promise<[]>
```
Measures the elapsed execution time of a function call or promise once it is awaited.

### elapsedSync
```typescript
function elapsedSync<T>(fn: () => T) => []
```
Measures the elapsed execution time of a synchronous function call once it is awaited.

### enumConfigHelper
```typescript
function enumConfigHelper<T extends string>(values: T[], defaultValue?: NoInfer<T>) => Pick<ConfigMapping, "parseEnv" | "defaultValue">
```
Generates parseEnv for an enum-like config value.

### executeTimeout
```typescript
function executeTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeout: number, errorOrFnName?: string | () => Error, onAbort?: () => void) => Promise<T>
```
Executes a function with a timeout.

### filterAsync
```typescript
function filterAsync<T>(arr: T[], fn: (item: T) => Promise<boolean>) => Promise<T[]>
```
Filters an array with an async predicate. Fires all predicate promises in parallel.

### floatConfigHelper
```typescript
function floatConfigHelper(defaultVal: number, validationFn?: (val: number) => void) => Pick<ConfigMapping, "parseEnv" | "defaultValue">
```
Generates parseEnv and default values for a numerical config value.

### formatLogMessage
```typescript
function formatLogMessage(log: LogObject, messageKey: string) => string
```
Formats a log message with per-actor coloring. Actor, module, and instanceId share the same color.

### from2Fields
```typescript
function from2Fields(field1: Fr, field2: Fr) => Buffer
```
Reconstructs the original 32 bytes of data from 2 field elements.

### fromBigInt
```typescript
function fromBigInt(value: bigint) => SlotNumber
```

### fromEntries
```typescript
function fromEntries<T extends readonly readonly [][]>(entries: T) => { [key: string]: unknown }
```
Equivalent to Object.fromEntries but preserves types.

### fromFieldsTuple
```typescript
function fromFieldsTuple(fields: []) => Buffer
```

### fromString
```typescript
function fromString(value: string) => SlotNumber
```

### getActiveNetworkName
```typescript
function getActiveNetworkName(name?: string) => NetworkNames
```

### getActorColor
```typescript
function getActorColor(actor: string) => Color
```
Returns the color function assigned to a given actor, assigning a new one if needed.

### getConfigFromMappings
```typescript
function getConfigFromMappings<T>(configMappings: ConfigMappingsType<T>) => T
```

### getDefaultConfig
```typescript
function getDefaultConfig<T>(configMappings: ConfigMappingsType<T>) => T
```
Extracts the default configuration values from the given configuration mappings.

### getEntries
```typescript
function getEntries<T extends Record<PropertyKey, unknown>>(obj: T) => { [key: string]: unknown }[keyof T][]
```
Equivalent to Object.entries but preserves types.

### getKeys
```typescript
function getKeys<T extends object>(obj: T) => keyof T[]
```
Equivalent to Object.keys but preserves types.

### getValueFromEnvWithFallback
```typescript
function getValueFromEnvWithFallback<T>(env: EnvVar | undefined, parseFunc: (val: string) => T | undefined, defaultValue: T | undefined, fallback?: EnvVar[]) => T | undefined
```
Shared utility function to get a value from environment variables with fallback support. This can be used by both getConfigFromMappings and CLI utilities.

### hexSchemaFor
```typescript
function hexSchemaFor<TClass extends {} | {}>(klazz: TClass, refinement?: (input: string) => boolean) => ZodType<unknown, any, string>
```
Creates a schema that accepts a hex string and uses it to hydrate an instance.

### isArrayEmpty
```typescript
function isArrayEmpty<T>(arr: T[], isEmpty: (item: T) => boolean) => boolean
```
Returns if an array is composed of empty items.

### isBooleanConfigValue
```typescript
function isBooleanConfigValue<T>(obj: T, key: keyof T) => boolean
```

### isDefined
```typescript
function isDefined<T>(value: T | undefined) => boolean
```
Is defined type guard

### isErrorClass
```typescript
function isErrorClass<T extends Error>(value: unknown, errorClass: (...args: any[]) => T) => boolean
```
Type guard for error classes

### isValid
```typescript
function isValid(value: unknown) => boolean
```

### jsonParseWithSchema
```typescript
function jsonParseWithSchema<T>(json: string, schema: ZodFor<T>) => T
```
Parses a json string and then feeds it to a zod schema.

### jsonStringify
```typescript
function jsonStringify(obj: unknown, prettify?: boolean) => string
```
JSON.stringify helper that stringifies bigints, buffers, maps, and sets.

### makeBackoff
```typescript
function makeBackoff(retries: number[]) => Generator<number, void, unknown>
```
Generates a backoff sequence based on the array of retry intervals to use with the `retry` function.

### mapSchema
```typescript
function mapSchema<TKey, TValue>(key: ZodFor<TKey>, value: ZodFor<TValue>) => ZodFor<Map<TKey, TValue>>
```
Creates a schema for a js Map type that matches the serialization used in jsonStringify.

### mapTuple
```typescript
function mapTuple<T extends any[], F extends (item: T[number]) => any>(tuple: T, fn: F) => MapTuple<T, F>
```
Annoyingly, mapping a tuple does not preserve length. This is a helper to preserve length during a map operation.

### mapValues
```typescript
function mapValues<K extends string | number | symbol, T, U>(obj: Record<K, T>, fn: (value: T, key: K) => U) => Record<K, U>
```
Returns a new object with the same keys and where each value has been passed through the mapping function.

### maxBy
```typescript
function maxBy<T>(arr: T[], fn: (x: T) => number | bigint) => T | undefined
```
Returns the element of the array that has the maximum value of the given function. In case of a tie, returns the first element with the maximum value.

### mean
```typescript
function mean(values: number[]) => number | undefined
```
Computes the mean of a numeric array. Returns undefined if the array is empty.

### median
```typescript
function median(arr: number[]) => number | undefined
```
Computes the median of a numeric array. Returns undefined if array is empty.

### merge
```typescript
function merge<T extends object, U extends object>(obj1: T, obj2: U | undefined) => T & { [key: string]: unknown }
```
Returns the result of merging two objects ignoring properties with undefined values.

### numToInt32BE
```typescript
function numToInt32BE(n: number, bufferSize: number) => Buffer<ArrayBuffer>
```
Serialize a number into a big-endian signed 32-bit integer Buffer with the specified buffer size. This function converts the input number into its binary representation and stores it in a Buffer with the provided buffer size. By default, the buffer size is set to 4 bytes which represents a 32-bit integer. The function will use the last 4 bytes of the buffer to store the serialized number. If the input number is outside the range of a 32-bit signed integer, the resulting serialization may be incorrect due to truncation.

### numToUInt16BE
```typescript
function numToUInt16BE(n: number, bufferSize: number) => Buffer<ArrayBuffer>
```

### numToUInt32BE
```typescript
function numToUInt32BE(n: number, bufferSize: number) => Buffer<ArrayBuffer>
```
Convert a number to a big-endian unsigned 32-bit integer Buffer. This function takes a number and an optional buffer size as input and creates a Buffer with the specified size (defaults to 4) containing the big-endian representation of the input number as an unsigned 32-bit integer. Note that the bufferSize should be greater than or equal to 4, otherwise the output Buffer might truncate the serialized value.

### numToUInt32LE
```typescript
function numToUInt32LE(n: number, bufferSize: number) => Buffer<ArrayBuffer>
```
Convert a number into a 4-byte little-endian unsigned integer buffer. The input number is serialized as an unsigned 32-bit integer in little-endian byte order, and returned as a Buffer of specified size (defaults to 4). If the provided bufferSize is greater than 4, the additional bytes will be padded with zeros.

### numToUInt8
```typescript
function numToUInt8(n: number) => Buffer<ArrayBuffer>
```
Convert a number to an 8-bit unsigned integer and return it as a Buffer of length 1. The input number is written as an 8-bit unsigned integer into the buffer. This function is useful for converting small numeric values to a standardized binary format that can be easily stored or transmitted.

### numberConfigHelper
```typescript
function numberConfigHelper(defaultVal: number) => Pick<ConfigMapping, "parseEnv" | "defaultValue">
```
Generates parseEnv and default values for a numerical config value.

### omit
```typescript
function omit<T extends object, K extends string | number | symbol>(object: T, ...props: K[]) => Omit<T, K>
```
Returns a new object by omitting the given keys.

### omitConfigMappings
```typescript
function omitConfigMappings<T, K extends string | number | symbol>(configMappings: ConfigMappingsType<T>, keysToFilter: K[]) => ConfigMappingsType<Omit<T, K>>
```
Filters out a service's config mappings to exclude certain keys.

### optional
```typescript
function optional<T extends ZodTypeAny>(schema: T) => ZodNullableOptional<T>
```
Declares a parameter as optional. Use this over z.optional in order to accept nulls as undefineds. This is required as JSON does not have an undefined type, and null is used to represent it, so we need to convert nulls to undefineds as we parse.

### optionalNumberConfigHelper
```typescript
function optionalNumberConfigHelper() => Pick<ConfigMapping, "parseEnv">
```
Generates parseEnv for an optional numerical config value.

### overwriteLoggingStream
```typescript
function overwriteLoggingStream(stream: Writable) => void
```
Overwrites the logging stream with a different destination. Used by jest/setup.mjs to set up a pretty logger.

### padArrayEnd
```typescript
function padArrayEnd<T, N extends number>(arr: T[], elem: T, length: N, errorMsg: string) => Tuple<T, N>
```
Pads an array to the target length by appending an element to its end. Throws if target length exceeds the input array length. Does not modify the input array.

### padArrayStart
```typescript
function padArrayStart<T, N extends number>(arr: T[], elem: T, length: N) => Tuple<T, N>
```
Pads an array to the target length by prepending elements at the beginning. Throws if target length exceeds the input array length. Does not modify the input array.

### parse
```typescript
function parse<T extends [] | []>(args: IArguments, ...schemas: T) => AssertArray<{ [key: string]: unknown }>
```
Parses the given arguments using a tuple from the provided schemas.

### parseBooleanEnv
```typescript
function parseBooleanEnv(val: string | undefined) => boolean
```
Parses an env var as boolean. Returns true only if value is 1, true, or TRUE.

### parseWithOptionals
```typescript
function parseWithOptionals<T extends AnyZodTuple>(args: any[], schema: T) => Promise<T["_output"]>
```
Parses the given arguments against a tuple, allowing empty for optional items.

### partition
```typescript
function partition<T>(items: T[], predicate: (item: T) => boolean) => []
```
Partitions the given iterable into two arrays based on the predicate.

### percentageConfigHelper
```typescript
function percentageConfigHelper(defaultVal: number) => Pick<ConfigMapping, "parseEnv" | "defaultValue">
```
Parses an environment variable to a 0-1 percentage value

### pick
```typescript
function pick<T extends object, U extends string | number | symbol>(object: T, ...props: U[]) => Pick<T, U>
```
Returns a new object by picking the given keys.

### pickConfigMappings
```typescript
function pickConfigMappings<T, K extends string | number | symbol>(configMappings: ConfigMappingsType<T>, keys: K[]) => ConfigMappingsType<Pick<T, K>>
```
Picks specific keys from the given configuration mappings.

### pickFromSchema
```typescript
function pickFromSchema<T extends object, S extends ZodObject<ZodRawShape, UnknownKeysParam, ZodTypeAny, {}, {}>>(obj: T, schema: S) => Partial<T>
```
Given an already parsed and validated object, extracts the keys defined in the given schema. Does not validate again.

### prefixBufferWithLength
```typescript
function prefixBufferWithLength(buf: Buffer) => Buffer<ArrayBuffer>
```
Adds a 4-byte byte-length prefix to a buffer.

### randomBigInt
```typescript
function randomBigInt(max: bigint) => bigint
```
Generate a random bigint less than max.

### randomBoolean
```typescript
function randomBoolean() => boolean
```
Generate a random boolean value.

### randomBytes
```typescript
function randomBytes(len: number) => Buffer<ArrayBufferLike>
```

### randomInt
```typescript
function randomInt(max: number) => number
```
Generate a random integer less than max.

### registerLoggingStream
```typescript
function registerLoggingStream(stream: Writable) => void
```
Registers an additional destination to the pino logger. Use only when working with destinations, not worker transports.

### removeArrayPaddingEnd
```typescript
function removeArrayPaddingEnd<T>(arr: T[], isEmpty: (item: T) => boolean) => T[]
```
Removes the right-padding for an array. Does not modify original array.

### removeLogBindingsHandler
```typescript
function removeLogBindingsHandler(handler: LogBindingsHandler) => void
```

### resetActorColors
```typescript
function resetActorColors() => void
```
Resets the actor-to-color mapping. Useful for testing.

### resolveLogger
```typescript
function resolveLogger(module: string, loggerOrBindings?: LoggerBindings | Logger) => Logger
```
Returns a logger for the given module. If loggerOrBindings is already a Logger, returns it directly. Otherwise, creates a new logger with the given module name and bindings.

### resolver
```typescript
function resolver(_: any, value: any) => any
```

### retry
```typescript
function retry<Result>(fn: () => Promise<Result>, name: string, backoff: Generator<number, void, unknown>, log: Logger, failSilently: boolean) => Promise<Result>
```
Retry a given asynchronous function with a specific backoff strategy, until it succeeds or backoff generator ends. It logs the error and retry interval in case an error is caught. The function can be named for better log output.

### retryFastUntil
```typescript
function retryFastUntil<T>(fn: () => T | Promise<T | undefined> | undefined, name: string, timeout: number, interval: number) => Promise<NonNullable<Awaited<T>>>
```
Convenience wrapper around retryUntil with fast polling for tests. Uses 10s timeout and 100ms polling interval by default.

### retryUntil
```typescript
function retryUntil<T>(fn: () => T | Promise<T | undefined> | undefined, name: string, timeout: number, interval: number) => Promise<NonNullable<Awaited<T>>>
```
Retry an asynchronous function until it returns a truthy value or the specified timeout is exceeded. The function is retried periodically with a fixed interval between attempts. The operation can be named for better error messages. Will never timeout if the value is 0.

### reviver
```typescript
function reviver(key: string, value: any) => any
```

### schemaHasMethod
```typescript
function schemaHasMethod(schema: ApiSchema, methodName: string) => boolean
```
Return whether an API schema defines a valid function schema for a given method name.

### secretFqConfigHelper
```typescript
function secretFqConfigHelper(defaultValue: Fq) => Required<Pick<ConfigMapping, "parseEnv" | "defaultValue" | "isBoolean"> & { parseVal: (val: string) => SecretValue<Fq> }>
```

### secretFrConfigHelper
```typescript
function secretFrConfigHelper() => Required<Pick<ConfigMapping, "parseEnv" | "defaultValue" | "isBoolean"> & { parseVal: (val: string) => SecretValue<Fr | undefined> }>
```

### secretStringConfigHelper
```typescript
function secretStringConfigHelper() => Required<Pick<ConfigMapping, "parseEnv" | "defaultValue" | "isBoolean"> & { parseVal: (val: string) => SecretValue<string | undefined> }>
```

### secretValueConfigHelper
```typescript
function secretValueConfigHelper<T>(parse: (val: string | undefined) => T) => Required<Pick<ConfigMapping, "parseEnv" | "defaultValue" | "isBoolean"> & { parseVal: (val: string) => SecretValue<T> }>
```

### serializeArrayOfBufferableToVector
```typescript
function serializeArrayOfBufferableToVector(objs: Bufferable[], prefixLength: number) => Buffer
```
For serializing an array of fixed length buffers.

### serializeBigInt
```typescript
function serializeBigInt(n: bigint, width: number) => Buffer<ArrayBufferLike>
```
Serialize a BigInt value into a Buffer of specified width. The function converts the input BigInt into its big-endian representation and stores it in a Buffer of the given width. If the width is not provided, a default value of 32 bytes will be used. It is important to provide an appropriate width to avoid truncation or incorrect serialization of large BigInt values.

### serializeDate
```typescript
function serializeDate(date: Date) => Buffer<ArrayBufferLike>
```
Serializes a Date object into a Buffer containing its timestamp as a big integer value. The resulting Buffer has a fixed width of 8 bytes, representing a 64-bit big-endian integer. This function is useful for converting date values into a binary format that can be stored or transmitted easily.

### serializeToBuffer
```typescript
function serializeToBuffer(...objs: Bufferable[]) => Buffer
```
Serializes a list of objects contiguously.

### serializeToBufferArray
```typescript
function serializeToBufferArray(...objs: Bufferable[]) => Buffer<ArrayBufferLike>[]
```
Serializes a list of objects contiguously.

### serializeToFields
```typescript
function serializeToFields(...objs: Fieldable[]) => Fr[]
```
Serializes a list of objects contiguously.

### setSchema
```typescript
function setSchema<T>(value: ZodFor<T>) => ZodFor<Set<T>>
```
Creates a schema for a js Set type that matches the serialization used in jsonStringify.

### sleep
```typescript
function sleep<T>(ms: number, returnValue?: T) => Promise<T>
```
Puts the current execution context to sleep for a specified duration. This simulates a blocking sleep operation by using an asynchronous function and a Promise that resolves after the given duration. The sleep function can be interrupted by the 'interrupt' method of the InterruptibleSleep class.

### sleepUntil
```typescript
function sleepUntil<T>(target: Date, now: Date, returnValue?: T) => Promise<T>
```
Sleeps until the target date

### stdDev
```typescript
function stdDev(values: number[]) => number | undefined
```
Computes the standard deviation of a numeric array. Returns undefined if there are less than 2 points.

### sum
```typescript
function sum(arr: number[]) => number
```
Computes the sum of a numeric array.

### timeoutPromise
```typescript
function timeoutPromise(timeoutMs: number, errorMessage?: string) => Promise<never>
```
Returns a promise that rejects after the given timeout

### times
```typescript
function times<T>(n: number, fn: (i: number) => T) => T[]
```
Executes the given function n times and returns the results in an array.

### timesAsync
```typescript
function timesAsync<T>(n: number, fn: (i: number) => Promise<T>) => Promise<T[]>
```
Executes the given async function n times and returns the results in an array. Awaits each execution before starting the next one.

### timesParallel
```typescript
function timesParallel<T>(n: number, fn: (i: number) => Promise<T>) => Promise<T[]>
```
Executes the given async function n times in parallel and returns the results in an array.

### to2Fields
```typescript
function to2Fields(buf: Buffer) => []
```
Stores full 256 bits of information in 2 fields.

### toBigInt
```typescript
function toBigInt(buf: Buffer) => bigint
```
Parse a buffer as a big integer.

### toFriendlyJSON
```typescript
function toFriendlyJSON(obj: object) => string
```
Returns a user-friendly JSON representation of an object, showing buffers as hex strings.

### toHumanReadable
```typescript
function toHumanReadable(buf: Buffer, maxLen?: number) => string
```

### truncateAndPad
```typescript
function truncateAndPad(buf: Buffer) => Buffer
```
Truncates SHA hashes to match Noir's truncated version

### tryJsonStringify
```typescript
function tryJsonStringify(obj: any, prettify?: boolean) => string | undefined
```
Calls jsonStringify but swallows errors. Use for logging, when you don't want to potentially introduce another thing that throws.

### uint8ArrayToNum
```typescript
function uint8ArrayToNum(array: Uint8Array) => number
```
Cast a uint8 array to a number.

### unfreeze
```typescript
function unfreeze<T>(obj: T) => Writeable<T>
```
Removes readonly modifiers for an object.

### unique
```typescript
function unique<T>(arr: T[]) => T[]
```
Removes duplicates from the given array.

### variance
```typescript
function variance(values: number[]) => number | undefined
```
Computes the variance of a numeric array. Returns undefined if there are less than 2 points.

### zodFor
```typescript
function zodFor<T>() => <S extends ZodType<any, any, any>>(schema: unknown) => S
```
Creates a schema validator that enforces all properties of type T are present in the schema. This provides compile-time safety to ensure schemas don't miss optional properties.

## Types

### ApiSchemaFor
```typescript
type ApiSchemaFor = { [key: string]: unknown }
```
Maps all functions in an interface to their schema representation.

### Bufferable
```typescript
type Bufferable = boolean | Buffer | Uint8Array | number | bigint | string | { toBuffer: () => Buffer } | Bufferable[]
```
A type that can be written to a buffer.

### ConfigMappingsType
```typescript
type ConfigMappingsType = Record<keyof T, ConfigMapping>
```

### EnvVar
```typescript
type EnvVar = "REGISTRY_CONTRACT_ADDRESS" | "FEE_ASSET_HANDLER_CONTRACT_ADDRESS" | "SLASH_FACTORY_CONTRACT_ADDRESS" | "ACVM_BINARY_PATH" | "ACVM_WORKING_DIRECTORY" | "API_KEY" | "API_PREFIX" | "ARCHIVER_MAX_LOGS" | "ARCHIVER_POLLING_INTERVAL_MS" | "ARCHIVER_URL" | "ARCHIVER_VIEM_POLLING_INTERVAL_MS" | "ARCHIVER_BATCH_SIZE" | "AZTEC_ADMIN_PORT" | "AZTEC_NODE_ADMIN_URL" | "AZTEC_NODE_URL" | "AZTEC_PORT" | "BB_BINARY_PATH" | "BB_SKIP_CLEANUP" | "BB_WORKING_DIRECTORY" | "BB_NUM_IVC_VERIFIERS" | "BB_IVC_CONCURRENCY" | "BOOTSTRAP_NODES" | "BLOB_ARCHIVE_API_URL" | "BLOB_FILE_STORE_URLS" | "BLOB_FILE_STORE_UPLOAD_URL" | "BLOB_HEALTHCHECK_UPLOAD_INTERVAL_MINUTES" | "BOT_DA_GAS_LIMIT" | "BOT_FEE_PAYMENT_METHOD" | "BOT_MIN_FEE_PADDING" | "BOT_FLUSH_SETUP_TRANSACTIONS" | "BOT_FOLLOW_CHAIN" | "BOT_L2_GAS_LIMIT" | "BOT_MAX_PENDING_TXS" | "BOT_NO_START" | "BOT_L1_MNEMONIC" | "BOT_L1_PRIVATE_KEY" | "BOT_L1_TO_L2_TIMEOUT_SECONDS" | "BOT_PRIVATE_KEY" | "BOT_ACCOUNT_SALT" | "BOT_PRIVATE_TRANSFERS_PER_TX" | "BOT_PUBLIC_TRANSFERS_PER_TX" | "BOT_RECIPIENT_ENCRYPTION_SECRET" | "BOT_TOKEN_CONTRACT" | "BOT_TOKEN_SALT" | "BOT_TX_INTERVAL_SECONDS" | "BOT_TX_MINED_WAIT_SECONDS" | "BOT_MAX_CONSECUTIVE_ERRORS" | "BOT_STOP_WHEN_UNHEALTHY" | "BOT_AMM_TXS" | "COINBASE" | "CRS_PATH" | "DATA_DIRECTORY" | "DATA_STORE_MAP_SIZE_KB" | "ARCHIVER_STORE_MAP_SIZE_KB" | "BLOB_SINK_MAP_SIZE_KB" | "P2P_STORE_MAP_SIZE_KB" | "PROVER_BROKER_STORE_MAP_SIZE_KB" | "WS_DB_MAP_SIZE_KB" | "ARCHIVE_TREE_MAP_SIZE_KB" | "NULLIFIER_TREE_MAP_SIZE_KB" | "NOTE_HASH_TREE_MAP_SIZE_KB" | "MESSAGE_TREE_MAP_SIZE_KB" | "PUBLIC_DATA_TREE_MAP_SIZE_KB" | "DEBUG" | "DEBUG_P2P_DISABLE_COLOCATION_PENALTY" | "ETHEREUM_HOSTS" | "ETHEREUM_DEBUG_HOSTS" | "ETHEREUM_ALLOW_NO_DEBUG_HOSTS" | "FEE_RECIPIENT" | "FORCE_COLOR" | "GOVERNANCE_PROPOSER_PAYLOAD_ADDRESS" | "KEY_STORE_DIRECTORY" | "L1_CHAIN_ID" | "L1_CONSENSUS_HOST_URLS" | "L1_CONSENSUS_HOST_API_KEYS" | "L1_CONSENSUS_HOST_API_KEY_HEADERS" | "LOG_JSON" | "LOG_MULTILINE" | "LOG_NO_COLOR_PER_ACTOR" | "LOG_LEVEL" | "MNEMONIC" | "NETWORK" | "NETWORK_CONFIG_LOCATION" | "NO_PXE" | "USE_GCLOUD_LOGGING" | "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT" | "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT" | "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT" | "OTEL_COLLECT_INTERVAL_MS" | "OTEL_EXCLUDE_METRICS" | "OTEL_INCLUDE_METRICS" | "OTEL_EXPORT_TIMEOUT_MS" | "PUBLIC_OTEL_EXPORTER_OTLP_METRICS_ENDPOINT" | "PUBLIC_OTEL_INCLUDE_METRICS" | "PUBLIC_OTEL_COLLECT_FROM" | "PUBLIC_OTEL_OPT_OUT" | "P2P_BATCH_TX_REQUESTER_SMART_PARALLEL_WORKER_COUNT" | "P2P_BATCH_TX_REQUESTER_DUMB_PARALLEL_WORKER_COUNT" | "P2P_BATCH_TX_REQUESTER_TX_BATCH_SIZE" | "P2P_BATCH_TX_REQUESTER_BAD_PEER_THRESHOLD" | "P2P_BLOCK_CHECK_INTERVAL_MS" | "P2P_SLOT_CHECK_INTERVAL_MS" | "P2P_BLOCK_REQUEST_BATCH_SIZE" | "P2P_BOOTSTRAP_NODE_ENR_VERSION_CHECK" | "P2P_BOOTSTRAP_NODES_AS_FULL_PEERS" | "P2P_ENABLED" | "P2P_DISCOVERY_DISABLED" | "P2P_GOSSIPSUB_D" | "P2P_GOSSIPSUB_DHI" | "P2P_GOSSIPSUB_DLO" | "P2P_GOSSIPSUB_DLAZY" | "P2P_GOSSIPSUB_FLOOD_PUBLISH" | "P2P_GOSSIPSUB_INTERVAL_MS" | "P2P_GOSSIPSUB_MCACHE_GOSSIP" | "P2P_GOSSIPSUB_MCACHE_LENGTH" | "P2P_GOSSIPSUB_SEEN_TTL" | "P2P_GOSSIPSUB_TX_INVALID_MESSAGE_DELIVERIES_DECAY" | "P2P_GOSSIPSUB_TX_INVALID_MESSAGE_DELIVERIES_WEIGHT" | "P2P_GOSSIPSUB_TX_TOPIC_WEIGHT" | "P2P_L2_QUEUE_SIZE" | "P2P_MAX_PEERS" | "P2P_PEER_CHECK_INTERVAL_MS" | "P2P_PEER_PENALTY_VALUES" | "P2P_QUERY_FOR_IP" | "P2P_REQRESP_INDIVIDUAL_REQUEST_TIMEOUT_MS" | "P2P_REQRESP_DIAL_TIMEOUT_MS" | "P2P_REQRESP_OVERALL_REQUEST_TIMEOUT_MS" | "P2P_DISABLE_STATUS_HANDSHAKE" | "P2P_ALLOW_ONLY_VALIDATORS" | "P2P_MAX_AUTH_FAILED_ATTEMPTS_ALLOWED" | "P2P_REQRESP_OPTIMISTIC_NEGOTIATION" | "P2P_DOUBLE_SPEND_SEVERE_PEER_PENALTY_WINDOW" | "P2P_LISTEN_ADDR" | "P2P_PORT" | "P2P_BROADCAST_PORT" | "P2P_IP" | "P2P_ARCHIVED_TX_LIMIT" | "P2P_TRUSTED_PEERS" | "P2P_PRIVATE_PEERS" | "P2P_PREFERRED_PEERS" | "P2P_MAX_PENDING_TX_COUNT" | "P2P_SEEN_MSG_CACHE_SIZE" | "P2P_DROP_TX" | "P2P_DROP_TX_CHANCE" | "P2P_TX_POOL_DELETE_TXS_AFTER_REORG" | "DEBUG_P2P_INSTRUMENT_MESSAGES" | "PEER_ID_PRIVATE_KEY" | "PEER_ID_PRIVATE_KEY_PATH" | "PROVER_AGENT_COUNT" | "PROVER_AGENT_PROOF_TYPES" | "PROVER_AGENT_POLL_INTERVAL_MS" | "PROVER_BROKER_HOST" | "PROVER_BROKER_JOB_TIMEOUT_MS" | "PROVER_BROKER_POLL_INTERVAL_MS" | "PROVER_BROKER_JOB_MAX_RETRIES" | "PROVER_BROKER_BATCH_INTERVAL_MS" | "PROVER_BROKER_BATCH_SIZE" | "PROVER_BROKER_MAX_EPOCHS_TO_KEEP_RESULTS_FOR" | "PROVER_BROKER_DEBUG_REPLAY_ENABLED" | "PROVER_CANCEL_JOBS_ON_STOP" | "PROVER_COORDINATION_NODE_URLS" | "PROVER_PROOF_STORE" | "PROVER_FAILED_PROOF_STORE" | "PROVER_NODE_FAILED_EPOCH_STORE" | "PROVER_NODE_DISABLE_PROOF_PUBLISH" | "PROVER_ID" | "PROVER_NODE_POLLING_INTERVAL_MS" | "PROVER_NODE_MAX_PENDING_JOBS" | "PROVER_NODE_MAX_PARALLEL_BLOCKS_PER_EPOCH" | "PROVER_NODE_TX_GATHERING_INTERVAL_MS" | "PROVER_NODE_TX_GATHERING_BATCH_SIZE" | "PROVER_NODE_TX_GATHERING_MAX_PARALLEL_REQUESTS_PER_NODE" | "PROVER_NODE_TX_GATHERING_TIMEOUT_MS" | "PROVER_PUBLISHER_PRIVATE_KEY" | "PROVER_PUBLISHER_PRIVATE_KEYS" | "PROVER_PUBLISHER_ADDRESSES" | "PROVER_PUBLISHER_ALLOW_INVALID_STATES" | "PROVER_PUBLISHER_FORWARDER_ADDRESS" | "PROVER_REAL_PROOFS" | "PROVER_TEST_DELAY_FACTOR" | "PROVER_TEST_DELAY_MS" | "PROVER_TEST_DELAY_TYPE" | "PROVER_TEST_VERIFICATION_DELAY_MS" | "PXE_L2_BLOCK_BATCH_SIZE" | "PXE_PROVER_ENABLED" | "PXE_SYNC_CHAIN_TIP" | "RPC_MAX_BATCH_SIZE" | "RPC_MAX_BODY_SIZE" | "RPC_SIMULATE_PUBLIC_MAX_GAS_LIMIT" | "RPC_SIMULATE_PUBLIC_MAX_DEBUG_LOG_MEMORY_READS" | "SENTINEL_ENABLED" | "SENTINEL_HISTORY_LENGTH_IN_EPOCHS" | "SENTINEL_HISTORIC_PROVEN_PERFORMANCE_LENGTH_IN_EPOCHS" | "SEQ_MAX_BLOCK_SIZE_IN_BYTES" | "SEQ_MAX_TX_PER_BLOCK" | "SEQ_MIN_TX_PER_BLOCK" | "SEQ_PUBLISH_TXS_WITH_PROPOSALS" | "SEQ_MAX_DA_BLOCK_GAS" | "SEQ_MAX_L2_BLOCK_GAS" | "SEQ_PUBLISHER_PRIVATE_KEY" | "SEQ_PUBLISHER_PRIVATE_KEYS" | "SEQ_PUBLISHER_ADDRESSES" | "SEQ_PUBLISHER_ALLOW_INVALID_STATES" | "SEQ_PUBLISHER_FORWARDER_ADDRESS" | "SEQ_POLLING_INTERVAL_MS" | "SEQ_ENFORCE_TIME_TABLE" | "SEQ_L1_PUBLISHING_TIME_ALLOWANCE_IN_SLOT" | "SEQ_ATTESTATION_PROPAGATION_TIME" | "SEQ_BLOCK_DURATION_MS" | "SEQ_BUILD_CHECKPOINT_IF_EMPTY" | "SEQ_SECONDS_BEFORE_INVALIDATING_BLOCK_AS_COMMITTEE_MEMBER" | "SEQ_SECONDS_BEFORE_INVALIDATING_BLOCK_AS_NON_COMMITTEE_MEMBER" | "SLASH_MIN_PENALTY_PERCENTAGE" | "SLASH_MAX_PENALTY_PERCENTAGE" | "SLASH_VALIDATORS_ALWAYS" | "SLASH_VALIDATORS_NEVER" | "SLASH_PRUNE_PENALTY" | "SLASH_DATA_WITHHOLDING_PENALTY" | "SLASH_INACTIVITY_PENALTY" | "SLASH_INACTIVITY_TARGET_PERCENTAGE" | "SLASH_INACTIVITY_CONSECUTIVE_EPOCH_THRESHOLD" | "SLASH_INVALID_BLOCK_PENALTY" | "SLASH_DUPLICATE_PROPOSAL_PENALTY" | "SLASH_DUPLICATE_ATTESTATION_PENALTY" | "SLASH_OVERRIDE_PAYLOAD" | "SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY" | "SLASH_ATTEST_DESCENDANT_OF_INVALID_PENALTY" | "SLASH_UNKNOWN_PENALTY" | "SLASH_GRACE_PERIOD_L2_SLOTS" | "SLASH_OFFENSE_EXPIRATION_ROUNDS" | "SLASH_MAX_PAYLOAD_SIZE" | "SLASH_EXECUTE_ROUNDS_LOOK_BACK" | "SYNC_MODE" | "SYNC_SNAPSHOTS_URLS" | "SYNC_SNAPSHOTS_URL" | "TELEMETRY" | "TEST_ACCOUNTS" | "SPONSORED_FPC" | "TX_COLLECTION_FAST_NODES_TIMEOUT_BEFORE_REQ_RESP_MS" | "TX_COLLECTION_SLOW_NODES_INTERVAL_MS" | "TX_COLLECTION_SLOW_REQ_RESP_INTERVAL_MS" | "TX_COLLECTION_SLOW_REQ_RESP_TIMEOUT_MS" | "TX_COLLECTION_RECONCILE_INTERVAL_MS" | "TX_COLLECTION_DISABLE_SLOW_DURING_FAST_REQUESTS" | "TX_COLLECTION_FAST_NODE_INTERVAL_MS" | "TX_COLLECTION_FAST_MAX_PARALLEL_REQUESTS_PER_NODE" | "TX_COLLECTION_NODE_RPC_MAX_BATCH_SIZE" | "TX_COLLECTION_NODE_RPC_URLS" | "TX_COLLECTION_MISSING_TXS_COLLECTOR_TYPE" | "TX_COLLECTION_FILE_STORE_URLS" | "TX_COLLECTION_FILE_STORE_SLOW_DELAY_MS" | "TX_COLLECTION_FILE_STORE_FAST_DELAY_MS" | "TX_FILE_STORE_URL" | "TX_FILE_STORE_UPLOAD_CONCURRENCY" | "TX_FILE_STORE_MAX_QUEUE_SIZE" | "TX_FILE_STORE_ENABLED" | "TX_PUBLIC_SETUP_ALLOWLIST" | "TXE_PORT" | "TRANSACTIONS_DISABLED" | "VALIDATOR_ATTESTATIONS_POLLING_INTERVAL_MS" | "VALIDATOR_DISABLED" | "VALIDATOR_PRIVATE_KEYS" | "VALIDATOR_PRIVATE_KEY" | "VALIDATOR_REEXECUTE" | "VALIDATOR_ADDRESSES" | "ROLLUP_VERSION" | "WS_BLOCK_CHECK_INTERVAL_MS" | "WS_BLOCK_REQUEST_BATCH_SIZE" | "L1_READER_VIEM_POLLING_INTERVAL_MS" | "WS_DATA_DIRECTORY" | "WS_NUM_HISTORIC_BLOCKS" | "ETHEREUM_SLOT_DURATION" | "AZTEC_SLOT_DURATION" | "AZTEC_EPOCH_DURATION" | "AZTEC_TARGET_COMMITTEE_SIZE" | "AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET" | "AZTEC_LAG_IN_EPOCHS_FOR_RANDAO" | "AZTEC_INBOX_LAG" | "AZTEC_PROOF_SUBMISSION_EPOCHS" | "AZTEC_ACTIVATION_THRESHOLD" | "AZTEC_EJECTION_THRESHOLD" | "AZTEC_LOCAL_EJECTION_THRESHOLD" | "AZTEC_MANA_TARGET" | "AZTEC_PROVING_COST_PER_MANA" | "AZTEC_INITIAL_ETH_PER_FEE_ASSET" | "AZTEC_SLASHING_QUORUM" | "AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS" | "AZTEC_SLASHING_LIFETIME_IN_ROUNDS" | "AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS" | "AZTEC_SLASHING_VETOER" | "AZTEC_SLASHING_OFFSET_IN_ROUNDS" | "AZTEC_SLASHING_DISABLE_DURATION" | "AZTEC_SLASH_AMOUNT_SMALL" | "AZTEC_SLASH_AMOUNT_MEDIUM" | "AZTEC_SLASH_AMOUNT_LARGE" | "AZTEC_SLASHER_FLAVOR" | "AZTEC_GOVERNANCE_PROPOSER_QUORUM" | "AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE" | "AZTEC_GOVERNANCE_VOTING_DURATION" | "AZTEC_EXIT_DELAY_SECONDS" | "L1_GAS_LIMIT_BUFFER_PERCENTAGE" | "L1_GAS_PRICE_MAX" | "L1_FEE_PER_GAS_GWEI_MAX" | "L1_BLOB_FEE_PER_GAS_MAX" | "L1_BLOB_FEE_PER_GAS_GWEI_MAX" | "L1_PRIORITY_FEE_BUMP_PERCENTAGE" | "L1_PRIORITY_FEE_RETRY_BUMP_PERCENTAGE" | "L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI" | "L1_FIXED_PRIORITY_FEE_PER_GAS" | "L1_FIXED_PRIORITY_FEE_PER_GAS_GWEI" | "L1_TX_MONITOR_MAX_ATTEMPTS" | "L1_TX_MONITOR_CHECK_INTERVAL_MS" | "L1_TX_MONITOR_STALL_TIME_MS" | "L1_TX_MONITOR_TX_TIMEOUT_MS" | "L1_TX_MONITOR_CANCEL_TX_ON_TIMEOUT" | "L1_TX_MONITOR_TX_CANCELLATION_TIMEOUT_MS" | "L1_TX_MONITOR_TX_UNSEEN_CONSIDERED_DROPPED_MS" | "FAUCET_MNEMONIC_ADDRESS_INDEX" | "FAUCET_ETH_AMOUNT" | "FAUCET_INTERVAL_MS" | "FAUCET_L1_ASSETS" | "K8S_POD_NAME" | "K8S_POD_UID" | "K8S_NAMESPACE_NAME" | "VALIDATOR_REEXECUTE_DEADLINE_MS" | "AUTO_UPDATE" | "AUTO_UPDATE_URL" | "WEB3_SIGNER_URL" | "SKIP_ARCHIVER_INITIAL_SYNC" | "BLOB_ALLOW_EMPTY_SOURCES" | "FISHERMAN_MODE" | "MAX_ALLOWED_ETH_CLIENT_DRIFT_SECONDS" | "LEGACY_BLS_CLI" | "DEBUG_FORCE_TX_PROOF_VERIFICATION" | "VALIDATOR_HA_SIGNING_ENABLED" | "VALIDATOR_HA_NODE_ID" | "VALIDATOR_HA_POLLING_INTERVAL_MS" | "VALIDATOR_HA_SIGNING_TIMEOUT_MS" | "VALIDATOR_HA_MAX_STUCK_DUTIES_AGE_MS" | "VALIDATOR_HA_OLD_DUTIES_MAX_AGE_H" | "VALIDATOR_HA_DATABASE_URL" | "VALIDATOR_HA_RUN_MIGRATIONS" | "VALIDATOR_HA_POOL_MAX" | "VALIDATOR_HA_POOL_MIN" | "VALIDATOR_HA_POOL_IDLE_TIMEOUT_MS" | "VALIDATOR_HA_POOL_CONNECTION_TIMEOUT_MS"
```

### EpochNumber
```typescript
type EpochNumber = Branded<number, "EpochNumber">
```
Creates an EpochNumber from a number.

### Fieldable
```typescript
type Fieldable = Fr | boolean | number | bigint | Buffer | { toFr: () => Fr } | { toField: () => Fr } | { toFields: () => Fr[] } | Fieldable[]
```
A type that can be converted to a Field or a Field array.

### FieldsOf
```typescript
type FieldsOf = { [key: string]: unknown }
```
Strips methods of a type.

### FunctionsOf
```typescript
type FunctionsOf = { [key: string]: unknown }
```
Extracts methods of a type.

### LogData
```typescript
type LogData = Record<string, string | number | bigint | boolean | {} | undefined | null>
```
Structured log data to include with the message.

### LogFn
```typescript
type LogFn = (msg: string, data?: unknown) => void
```
A callable logger instance.

### LogLevel
```typescript
type LogLevel = typeof LogLevels[number]
```

### LogLevels
```typescript
type LogLevels = readonly []
```

### Logger
```typescript
type Logger = { [key: string]: unknown } & { error: ErrorLogFn } & { createChild: (childModule: string) => Logger; getBindings: () => LoggerBindings; ... }
```
Logger that supports multiple severity levels.

### LoggerBindings
```typescript
type LoggerBindings = unknown
```
Optional bindings to pass to createLogger for additional context.

### NetworkConfig
```typescript
type NetworkConfig = z.infer<typeof NetworkConfigSchema>
```

### NetworkConfigMap
```typescript
type NetworkConfigMap = z.infer<typeof NetworkConfigMapSchema>
```

### NetworkNames
```typescript
type NetworkNames = "local" | "staging-ignition" | "staging-public" | "testnet" | "mainnet" | "next-net" | "devnet"
```

### PartialBy
```typescript
type PartialBy = Omit<T, K> & Partial<Pick<T, K>>
```
Marks a set of properties of a type as optional.

### Prettify
```typescript
type Prettify = { [key: string]: unknown } & {}
```
Resolves a record-like type. Lifted from viem.

### Serializable
```typescript
type Serializable = Bufferable & Fieldable
```

### SlotNumber
```typescript
type SlotNumber = Branded<number, "SlotNumber">
```
Creates a SlotNumber from a number.

### Tuple
```typescript
type Tuple = unknown
```
Represents a fixed-length array.

### Writeable
```typescript
type Writeable = { [key: string]: unknown }
```
Removes readonly modifiers for a type.

### ZERO
```typescript
type ZERO = SlotNumber
```
The zero slot value.

### levels
```typescript
type levels = { labels: any; values: { verbose: number } }
```

### logFilters
```typescript
type logFilters = LogFilters
```

### logLevel
```typescript
type logLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "verbose" | "silent"
```

### logger
```typescript
type logger = Logger<"verbose", boolean>
```

### pinoPrettyOpts
```typescript
type pinoPrettyOpts = { colorize: boolean; customColors: string; ... }
```
Pino-pretty options for direct use (e.g., jest/setup.mjs). Includes function-based messageFormat for per-actor coloring when enabled.

### schemas
```typescript
type schemas = { BigInt: ZodPipeline<ZodUnion<[]>, ZodBigInt>; Boolean: ZodUnion<[]>; ... }
```
