use dep::aztec::macros::aztec;

#[aztec]
pub contract SalaryPayroll {
    // zaroori imports
    use dep::aztec::macros::{functions::{public}, storage::storage};
    use dep::aztec::prelude::{AztecAddress};

    #[public]
    fn add_employee(_employee_id: u64, salary: u64) -> pub bool {
        assert(salary >= 1);
        assert(salary <= 1_000_000);
        true
    }

    #[public]
    fn withdraw_salary(_employee_id: u64) -> pub bool {
        true
    }
}
