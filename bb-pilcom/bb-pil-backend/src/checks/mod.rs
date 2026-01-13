mod isolated_columns_check;

use isolated_columns_check::isolated_committed_columns;
use powdr_ast::analyzed::Analyzed;
use powdr_number::FieldElement;

pub fn check<T: FieldElement>(analyzed: &Analyzed<T>) -> Result<(), String> {
    let isolated = isolated_committed_columns(analyzed);
    if isolated.len() > 0 {
        return Err(format!("Isolated committed columns detected: {:?}", isolated));
    }
    Ok(())
}
