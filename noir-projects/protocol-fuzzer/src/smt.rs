// Copyright 2022-2024 Protocol Labs
// SPDX-License-Identifier: Apache-2.0, MIT
use arbitrary::Unstructured;

/// State machine tests inspired by [ScalaCheck](https://github.com/typelevel/scalacheck/blob/main/doc/UserGuide.md#stateful-testing)
/// and [quickcheck-state-machine](https://hackage.haskell.org/package/quickcheck-state-machine).
pub trait StateMachine {
    /// System Under Test.
    type System;
    /// The idealised reference state we are testing against.
    type State: Clone;
    /// The random commands we can apply on the state in each step.
    type Command;
    /// The return result from command application.
    type Result;

    /// Generate a random initial state.
    fn gen_state(&mut self, u: &mut Unstructured) -> arbitrary::Result<Self::State>;

    /// Create a new System Under Test reflecting the given initial state.
    ///
    /// The [System] should free all of its resources when it goes out of scope.
    fn new_system(&mut self, state: &Self::State) -> Self::System;

    /// Generate a random command given the latest state.
    fn gen_command(
        &self,
        u: &mut Unstructured,
        state: &Self::State,
    ) -> arbitrary::Result<Self::Command>;

    /// Apply a command on the System Under Test.
    fn run_command(&self, system: &mut Self::System, cmd: &Self::Command) -> Self::Result;

    /// Execute a batch of commands, potentially in parallel.
    ///
    /// The default implementation runs them sequentially via `run_command`.
    /// Machines that want parallel execution should override this, delegating
    /// to their System (which holds the transport/bridge).
    fn run_command_batch(
        &self,
        system: &mut Self::System,
        cmds: &[Self::Command],
    ) -> Vec<Self::Result> {
        cmds.iter()
            .map(|cmd| self.run_command(system, cmd))
            .collect()
    }

    /// Use assertions to check that the result returned by the System Under Test
    /// was correct, given the model pre-state.
    fn check_result(&self, cmd: &Self::Command, pre_state: &Self::State, result: Self::Result);

    /// Apply a command on the model state.
    ///
    /// We could use `Cow` here if we wanted to preserve the history of state and
    /// also avoid cloning when there's no change.
    fn next_state(&self, cmd: &Self::Command, state: Self::State) -> Self::State;

    /// Use assertions to check that the state transition on the System Under Test
    /// was correct, by comparing to the model post-state.
    ///
    /// This can be used to check invariants which should always be true.
    ///
    /// Returns a flag indicating whether we should continue testing this system.
    fn check_system(
        &self,
        cmd: &Self::Command,
        post_state: &Self::State,
        post_system: &Self::System,
    ) -> bool;
}

/// Trait for commands that can be batched for parallel execution.
pub trait Batchable {
    /// Returns `true` if executing `self` and `other` concurrently could produce
    /// different results than executing them sequentially. Two commands conflict
    /// when either one must observe the other's effect to be correct, or when
    /// they touch the same exclusive resource (e.g. the same storage slot).
    /// Be conservative: false positives only shrink batches, false negatives
    /// silently corrupt the model.
    fn conflicts(&self, other: &Self) -> bool;
}

/// Run a state machine test by generating `max_steps` commands.
///
/// It is expected to panic if some post condition fails.
pub fn run<T: StateMachine>(
    u: &mut Unstructured,
    t: &mut T,
    max_steps: usize,
) -> arbitrary::Result<()> {
    let mut state = t.gen_state(u)?;
    let mut system = t.new_system(&state);
    for _ in 0..max_steps {
        ensure_has_randomness(u)?;
        let cmd = t.gen_command(u, &state)?;
        let res = t.run_command(&mut system, &cmd);
        t.check_result(&cmd, &state, res);
        state = t.next_state(&cmd, state);
        if !t.check_system(&cmd, &state, &system) {
            break;
        }
    }
    Ok(())
}

/// Run a state machine test with batched parallel execution of non-conflicting commands.
///
/// Commands are generated sequentially and deterministically. Consecutive non-conflicting
/// state-changing commands are buffered into a batch and fired concurrently via
/// `StateMachine::run_command_batch()`. Non-state-changing commands (queries) and
/// conflicting commands flush the pending batch first.
pub fn run_batched<T>(
    u: &mut Unstructured,
    t: &mut T,
    max_steps: usize,
    max_batch_size: usize,
) -> arbitrary::Result<()>
where
    T: StateMachine,
    T::Command: Batchable,
{
    let state = t.gen_state(u)?;
    let mut system = t.new_system(&state);

    // Two parallel vecs (not Vec<(Cmd, State)>) so we can pass &[Command] to
    // run_command_batch without allocating a temporary vec of references.
    let mut batch_cmds: Vec<T::Command> = Vec::new();
    let mut batch_states: Vec<T::State> = Vec::new();
    // Model state tracks all generated commands (including those still pending
    // in the batch). Used for gen_command and pre-state snapshots.
    let mut model = state;

    let flush = |t: &T,
                 system: &mut T::System,
                 cmds: &[T::Command],
                 states: &[T::State],
                 post_state: &T::State|
     -> bool {
        let results = t.run_command_batch(system, cmds);
        let mut ok = true;
        for ((cmd, pre_state), result) in cmds.iter().zip(states).zip(results) {
            t.check_result(cmd, pre_state, result);
            ok = ok && t.check_system(cmd, post_state, system);
        }
        ok
    };

    for _ in 0..max_steps {
        ensure_has_randomness(u)?;
        let cmd = t.gen_command(u, &model)?;

        // Flush if the new command conflicts with anything in the batch or if
        // the batch is at capacity.
        if batch_cmds.len() >= max_batch_size || batch_cmds.iter().any(|prev| cmd.conflicts(prev)) {
            if !flush(t, &mut system, &batch_cmds, &batch_states, &model) {
                return Ok(());
            }
            batch_cmds.clear();
            batch_states.clear();
        }

        // Snapshot model *before* applying the command (for check_result later).
        batch_states.push(model.clone());
        model = t.next_state(&cmd, model);
        batch_cmds.push(cmd);
    }

    if !batch_cmds.is_empty() {
        flush(t, &mut system, &batch_cmds, &batch_states, &model);
    }

    Ok(())
}

/// Once we run out of randomness, most of the arbitrary data generated by it will
/// be zeroes, which is not very realistic. Calling this method can highlight
/// this and give us a chance to adjust the min/max size of the builder.
pub fn ensure_has_randomness(u: &Unstructured) -> arbitrary::Result<()> {
    assert!(
        !u.is_empty(),
        "Ran out of randomness; increase min/max size."
    );
    Ok(())
}

/// Default `arbtest` builder.
pub fn default_builder() -> arbtest::Builder {
    arbtest::builder()
}

/// Make a builder with a certain size of random byte vector.
///
/// If the size is less than what is needed by the test,
/// my experience is that it will generate a lot of zeroes
/// or other default values for anything as it runs out of
/// random bytes.
///
/// The maximum is 4_294_967_295.
pub fn fixed_size_builder(size: u32) -> arbtest::Builder {
    arbtest::builder().min_size(size).max_size(size)
}

/// Seed a new builder. The seed carries the size as well as the initial randomness.
pub fn seeded_builder(seed: u64) -> arbtest::Builder {
    arbtest::builder().seed(seed)
}

/// Run a state machine test as a `#[test]`.
///
/// # Example
///
/// ```ignore
/// state_machine_test!(counter, 100 ms, 32 bytes, 100 steps, CounterStateMachine { buggy: false });
/// state_machine_test!(counter_seed_1, 0x001a560e00000020, 100 steps, CounterStateMachine { buggy: true });
/// ```
///
/// If the test fails, it will print out the seed which can be used to reproduce the error.
/// One can use [state_machine_seed!] to do that with minimal changes to the parameters.
///
/// The machine instance is reused between tests, which makes it possible to use it for
/// caching resources that take a long time to initialize, without having to resort to
/// for example `lazy_static!` global variables.
#[macro_export]
macro_rules! state_machine_test {
    // Run on a fixed time and randomness size budget.
    ($name:ident, $ms:literal ms, $size:literal bytes, $steps:literal steps, $smt:expr) => {
        #[test]
        fn $name() {
            let machine = $smt;
            $crate::smt::fixed_size_builder($size)
                .budget_ms($ms)
                .run(|u| $crate::smt::run(u, &machine, $steps))
        }
    };

    // Run with a fixed randomness.
    ($name:ident, $size:literal bytes, $steps:literal steps, $smt:expr) => {
        #[test]
        fn $name() {
            let mut machine = $smt;
            $crate::smt::fixed_size_builder($size)
                .run(|u| $crate::smt::run(u, &mut machine, $steps))
        }
    };

    // Run for a certain number of steps varying the size.
    ($name:ident, $steps:literal steps, $smt:expr) => {
        #[test]
        fn $name() {
            let machine = $smt;
            $crate::smt::default_builder().run(|u| $crate::smt::run(u, &machine, $steps))
        }
    };

    // Reproduce a result.
    ($name:ident, $seed:literal, $steps:literal steps, $smt:expr) => {
        #[test]
        fn $name() {
            let machine = $smt;
            $crate::smt::seeded_builder($seed).run(|u| $crate::smt::run(u, &machine, $steps))
        }
    };
}

/// Run a state machine test as a `#[test]` with a `seed` to reproduce a failure.
///
/// # Example
///
/// ```ignore
/// state_machine_seed!(counter, 0x001a560e00000020, 100 steps, CounterStateMachine { buggy: true });
/// ```
#[macro_export]
macro_rules! state_machine_seed {
    ($name:ident, $seed:literal, $steps:literal steps, $smt:expr) => {
        paste::paste! {
          #[test]
          fn [<$name _with_seed_ $seed>]() {
            let machine = $smt;
            $crate::smt::seeded_builder($seed)
                .run(|u| $crate::smt::run(u, &machine, $steps))
          }
        }
    };
}

#[cfg(test)]
mod tests {
    use arbitrary::{Result, Unstructured};

    use super::{StateMachine, fixed_size_builder, seeded_builder};

    /// A sample System Under Test.
    struct Counter {
        n: i32,
    }

    impl Counter {
        pub fn new() -> Self {
            Self { n: 0 }
        }
        pub fn get(&self) -> i32 {
            self.n
        }
        pub fn inc(&mut self) {
            self.n += 1;
        }
        pub fn dec(&mut self) {
            self.n -= 1;
        }
        pub fn reset(&mut self) {
            self.n = 0;
        }
    }

    #[derive(Clone, Copy)]
    enum CounterCommand {
        Get,
        Inc,
        Dec,
        Reset,
    }

    struct CounterStateMachine {
        /// Introduce some bug to check the negative case.
        buggy: bool,
    }

    impl StateMachine for CounterStateMachine {
        type System = Counter;
        type State = i32;
        type Command = &'static CounterCommand;
        type Result = Option<i32>;

        fn gen_state(&mut self, u: &mut Unstructured) -> Result<Self::State> {
            if self.buggy {
                Ok(u.arbitrary::<i32>()?.abs() + 1)
            } else {
                Ok(0)
            }
        }

        fn new_system(&mut self, _state: &Self::State) -> Self::System {
            Counter::new()
        }

        fn gen_command(&self, u: &mut Unstructured, _state: &Self::State) -> Result<Self::Command> {
            use CounterCommand::*;
            u.choose(&[Get, Inc, Dec, Reset])
        }

        fn run_command(&self, system: &mut Self::System, cmd: &Self::Command) -> Self::Result {
            use CounterCommand::*;
            match cmd {
                Get => return Some(system.get()),
                Inc => system.inc(),
                Dec => system.dec(),
                Reset => system.reset(),
            }
            None
        }

        fn check_result(&self, cmd: &Self::Command, pre_state: &Self::State, result: Self::Result) {
            if let CounterCommand::Get = cmd {
                assert_eq!(result.as_ref(), Some(pre_state))
            }
        }

        fn next_state(&self, cmd: &Self::Command, state: Self::State) -> Self::State {
            use CounterCommand::*;
            match cmd {
                Inc => state + 1,
                Dec => state - 1,
                Reset => 0,
                Get => state,
            }
        }

        fn check_system(
            &self,
            _cmd: &Self::Command,
            post_state: &Self::State,
            post_system: &Self::System,
        ) -> bool {
            // We can check the state if we want to, or we can wait for a Get command.
            assert_eq!(post_state, &post_system.get());
            true
        }
    }

    state_machine_test!(counter, 512 bytes, 100 steps, CounterStateMachine { buggy: false });

    /// Test the equivalent of:
    ///
    /// ```ignore
    /// state_machine_test!(counter, 512 bytes, 100 steps, CounterStateMachine { buggy: true });
    /// ```
    ///
    /// Which would have an output like:
    ///
    /// ```text
    /// ---- smt::tests::counter_with_seed stdout ----
    /// thread 'smt::tests::counter panicked at 'assertion failed: `(left == right)`
    ///   left: `296607493`,
    ///  right: `1`', testing/integration/src/smt.rs:233:13
    ///
    ///
    /// arb_test failed!
    ///     Seed: 0x4327d37100000200
    /// ```
    #[test]
    #[should_panic]
    fn counter_with_bug() {
        let mut t = CounterStateMachine { buggy: true };
        fixed_size_builder(512).run(|u| super::run(u, &mut t, 100))
    }

    /// Test the equivalent of:
    ///
    /// ```ignore
    /// state_machine_seed!(counter, 0x4327d37100000200, 100 steps, CounterStateMachine { buggy: true });
    /// ```
    #[test]
    #[should_panic]
    fn counter_with_seed() {
        let mut t = CounterStateMachine { buggy: true };
        seeded_builder(0x4327d37100000200).run(|u| super::run(u, &mut t, 100))
    }
}
