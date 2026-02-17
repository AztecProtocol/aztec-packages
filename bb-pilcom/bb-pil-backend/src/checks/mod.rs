mod isolated_columns_check;
mod single_graph_component_check;
mod utils;

use isolated_columns_check::isolated_committed_columns;
use powdr_ast::analyzed::Analyzed;
use powdr_number::FieldElement;
use single_graph_component_check::single_graph_component_check;

pub fn check<T: FieldElement>(analyzed: &Analyzed<T>) -> Result<(), String> {
    let isolated = isolated_committed_columns(analyzed);
    if isolated.len() > 0 {
        return Err(format!("Isolated committed columns detected: {:?}", isolated));
    }
    let result = single_graph_component_check(analyzed);
    if result.is_err() {
        return Err(result.unwrap_err());
    }
    Ok(())
}
