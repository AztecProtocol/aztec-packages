use aztec::macros::aztec;

/// Bytecode-shape repro from https://github.com/AztecProtocol/aztec-nr/issues/35.
///
/// 15 `#[external("public")]` functions, each doing one storage read, one storage write,
/// and one `self.emit(Updated { .. })`. Pinned here so that:
///   - `nargo expand` is snapshotted in `noir-projects/labs/contract-snapshots`, making any
///     change to the macro boilerplate visible across all 15 call sites in a single review.
///   - `bytecodeSizeBytes/PublicFnsWithEmitRepro` lands on the bench dashboard, so any
///     improvement (or regression) in the per-public-fn emit shape is tracked over time.
#[aztec]
pub contract PublicFnsWithEmitRepro {
    use aztec::macros::events::event;
    use aztec::macros::functions::external;
    use aztec::macros::storage::storage;
    use aztec::state_vars::PublicMutable;

    #[event]
    struct Updated {
        new_value: u64,
    }

    #[storage]
    struct Storage<Context> {
        value: PublicMutable<u64, Context>,
    }

    #[external("public")]
    fn fn_01(v: u64) {
        let old = self.storage.value.read();
        self.storage.value.write(old + v + 1);
        self.emit(Updated { new_value: old + v + 1 });
    }
    #[external("public")]
    fn fn_02(v: u64) {
        let old = self.storage.value.read();
        self.storage.value.write(old + v + 2);
        self.emit(Updated { new_value: old + v + 2 });
    }
    #[external("public")]
    fn fn_03(v: u64) {
        let old = self.storage.value.read();
        self.storage.value.write(old + v + 3);
        self.emit(Updated { new_value: old + v + 3 });
    }
    #[external("public")]
    fn fn_04(v: u64) {
        let old = self.storage.value.read();
        self.storage.value.write(old + v + 4);
        self.emit(Updated { new_value: old + v + 4 });
    }
    #[external("public")]
    fn fn_05(v: u64) {
        let old = self.storage.value.read();
        self.storage.value.write(old + v + 5);
        self.emit(Updated { new_value: old + v + 5 });
    }
    #[external("public")]
    fn fn_06(v: u64) {
        let old = self.storage.value.read();
        self.storage.value.write(old + v + 6);
        self.emit(Updated { new_value: old + v + 6 });
    }
    #[external("public")]
    fn fn_07(v: u64) {
        let old = self.storage.value.read();
        self.storage.value.write(old + v + 7);
        self.emit(Updated { new_value: old + v + 7 });
    }
    #[external("public")]
    fn fn_08(v: u64) {
        let old = self.storage.value.read();
        self.storage.value.write(old + v + 8);
        self.emit(Updated { new_value: old + v + 8 });
    }
    #[external("public")]
    fn fn_09(v: u64) {
        let old = self.storage.value.read();
        self.storage.value.write(old + v + 9);
        self.emit(Updated { new_value: old + v + 9 });
    }
    #[external("public")]
    fn fn_10(v: u64) {
        let old = self.storage.value.read();
        self.storage.value.write(old + v + 10);
        self.emit(Updated { new_value: old + v + 10 });
    }
    #[external("public")]
    fn fn_11(v: u64) {
        let old = self.storage.value.read();
        self.storage.value.write(old + v + 11);
        self.emit(Updated { new_value: old + v + 11 });
    }
    #[external("public")]
    fn fn_12(v: u64) {
        let old = self.storage.value.read();
        self.storage.value.write(old + v + 12);
        self.emit(Updated { new_value: old + v + 12 });
    }
    #[external("public")]
    fn fn_13(v: u64) {
        let old = self.storage.value.read();
        self.storage.value.write(old + v + 13);
        self.emit(Updated { new_value: old + v + 13 });
    }
    #[external("public")]
    fn fn_14(v: u64) {
        let old = self.storage.value.read();
        self.storage.value.write(old + v + 14);
        self.emit(Updated { new_value: old + v + 14 });
    }
    #[external("public")]
    fn fn_15(v: u64) {
        let old = self.storage.value.read();
        self.storage.value.write(old + v + 15);
        self.emit(Updated { new_value: old + v + 15 });
    }
}
