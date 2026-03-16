use std::meta::ctstring::AsCtString;

/// Generates a coded error type from struct fields.
///
/// Each `field: ()` entry becomes a named constructor with an auto-assigned numeric code. Given:
///
/// ```noir
/// #[error_enum]
/// pub struct DecryptError {
///     empty_ciphertext: (),
///     invalid_header: (),
/// }
/// ```
///
/// The macro rewrites the struct and generates an impl block equivalent to:
///
/// ```noir
/// pub struct DecryptError { _code: u8 }
///
/// impl DecryptError {
///     // One constructor per field, codes assigned sequentially from 1
///     pub fn empty_ciphertext() -> Self { Self { _code: 1 } }
///     pub fn invalid_header() -> Self { Self { _code: 2 } }
///
///     // Accessor for the numeric code
///     pub fn code(self) -> u8 { self._code }
///
///     // Comptime metadata: pairs each code with its field name as a reason string. The returned Quoted is the
///     // type itself, needed by `warn_with_reason!` to annotate the closure parameter.
///     pub comptime fn metadata() -> (Quoted, [(u8, CtString); 2]) {
///         (quote { DecryptError }, [(1, "empty_ciphertext"), (2, "invalid_header")])
///     }
/// }
///
/// impl Eq for DecryptError { ... }
/// ```
pub comptime fn error_enum(s: TypeDefinition) -> Quoted {
    let typ = s.as_type();
    let fields = s.fields_as_written();
    let n = fields.len();

    let mut constructors_list = @[];
    let mut error_reason_entries_list = @[];

    for i in 0..n {
        let (name, _typ, _vis) = fields[i];
        let code = (i as u8) + 1;
        let reason_str = f"{name}".as_ctstring().as_quoted_str();

        constructors_list = constructors_list.push_back(quote { pub fn $name() -> Self { Self { _code: $code } } });
        error_reason_entries_list = error_reason_entries_list.push_back(quote { ($code, $reason_str.as_ctstring()) });
    }

    let constructors = constructors_list.join(quote {});
    let error_reason_entries = error_reason_entries_list.join(quote {,});

    // Rewrite the struct body to `DecryptError { _code: u8 }`, discarding the original `field: ()` declarations.
    // `set_fields` takes an array of (name, type, visibility) tuples. We leave visibility empty so `_code` is private,
    // which forces callers to use the generated constructors (e.g. `DecryptError::empty_ciphertext()`) instead of
    // constructing the struct directly.
    let u8_type = quote { u8 }.as_type();
    s.set_fields(@[(quote { _code }, u8_type, quote { })]);

    quote {
        impl $typ {
            $constructors

            pub fn code(self) -> u8 {
                self._code
            }

            pub comptime fn metadata() -> (Quoted, [(u8, CtString); $n]) {
                (quote { $typ }, [$error_reason_entries])
            }
        }

        impl Eq for $typ {
            fn eq(self, other: Self) -> bool {
                self._code == other._code
            }
        }
    }
}

/// Builds a warning-logger closure for error enums.
///
/// Returns a closure `|err| -> err` that matches the error code, logs a warning prefixed with `[aztec-nr]`, and
/// returns the error. The `message_fn` closure receives each error's reason string and returns the full log message.
/// The `context` is spliced as `{0}`, `{1}`, etc.
///
/// ## Example
///
/// ```noir
/// let _ = AES128::decrypt(ciphertext, recipient)
///     .map(|plaintext| process(plaintext))
///     .map_err(warn_with_reason!(
///         DecryptError::metadata(),
///         |reason| f"Could not decrypt from tx {{0}}, ignoring. Reason: {reason}".as_ctstring(),
///         quote { [message_context.tx_hash] },
///     ));
/// ```
///
/// For an error with code 1 (`empty_ciphertext`) and tx_hash `0xdead`, this logs:
///
/// ```text
/// WARN: [aztec-nr] Could not decrypt from tx 0x...dead, ignoring. Reason: empty_ciphertext
/// ```
pub comptime fn warn_with_reason<let N: u32>(
    metadata: (Quoted, [(u8, CtString); N]),
    message_fn: fn(CtString) -> CtString,
    context: Quoted,
) -> Quoted {
    let (error_enum, reasons) = metadata;

    // For each error reason we generate an `if __err.code() == N { log(...) }` block. Joining them with `else`
    // produces an `if ... else if ... else if ...` chain that matches the error code and logs the right message.
    let mut branches_list = @[];
    for i in 0..N {
        let (code, reason) = reasons[i];
        let msg = message_fn(reason).as_quoted_str();
        branches_list = branches_list.push_back(
            quote { if __err.code() == $code { crate::logging::aztecnr_warn_log_format!($msg)(__err_ctx); } },
        );
    }
    let branches = branches_list.join(quote { else });

    // Return a closure that takes a coded error, logs a warning, and returns the error.
    quote {
        |__err: $error_enum| -> $error_enum {
            let __err_ctx = $context;
            $branches
            __err
        }
    }
}
