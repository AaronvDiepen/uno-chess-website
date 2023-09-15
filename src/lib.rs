use fixed::{types::extra::U31, FixedU32};

mod js_interface;
mod logger;
mod board_manager;
mod utils;

pub type Score = FixedU32<U31>;

pub use logger::Logger;
pub use board_manager::{BoardManager, Status};

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

// TODO:
//  Overall TODOs for the AI:
//   - Put the bot on Lichess and see how it does
//   - Implement search extensions for certain things
//   - Return partial results from a given depth (since with correct move
//     ordering they're guaranteed to be better)
//   - Use the killer heuristic
//   - Add the ability to export games (at least for people using the console)
