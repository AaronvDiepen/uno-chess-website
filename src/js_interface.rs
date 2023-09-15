use chess::{ChessMove, Color::*, Square, ALL_PIECES};
use js_sys::{Array, JsString};
use wasm_bindgen::prelude::*;

use crate::board_manager::{BoardManager, Status};

// TODO: Persist the current game (and possibly other state) between page loads

#[wasm_bindgen]
pub struct JSInterface {
    board: BoardManager,
    board_history: Vec<BoardManager>,
    move_history: Vec<ChessMove>,
}

#[wasm_bindgen]
impl JSInterface {
    pub fn js_initial_interface() -> Self {
        crate::utils::set_panic_hook();
        JSInterface {
            board: BoardManager::initial_board(),
            board_history: Vec::new(),
            move_history: Vec::new(),
        }
    }

    pub fn js_piece(&self, file: usize, rank: usize) -> Option<JsString> {
        let square = make_square(file, rank);
        match self.board.get_piece(square) {
            Some((p, c)) => Some(p.to_string(c).into()),
            _ => None,
        }
    }

    pub fn js_history(&self) -> Array {
        let history = Array::new();
        for (i, board) in self.board_history.iter().enumerate() {
            let js_board = Array::new();
            for file in 0..8 {
                let js_file = Array::new();
                for rank in 0..8 {
                    let square = make_square(file, rank);
                    let sq_info = Array::new();
                    sq_info.push(
                        &match board.get_piece(square) {
                            Some((p, c)) => Some(p.to_string(c)),
                            _ => None,
                        }
                        .into(),
                    );
                    sq_info.push(
                        &(self.move_history[i].get_source() == square
                            || self.move_history[i].get_dest() == square)
                            .into(),
                    );
                    js_file.push(&sq_info.into());
                }
                js_board.push(&js_file.into());
            }
            history.push(&js_board.into());
        }
        history
    }

    pub fn js_piece_color(&self, file: usize, rank: usize) -> JsString {
        let square = make_square(file, rank);
        match self.board.get_piece(square) {
            Some((_, White)) => "white".into(),
            Some((_, Black)) => "black".into(),
            _ => "empty".into(),
        }
    }

    pub fn js_checked_squares(&self) -> Array {
        let checked_kings = Array::new();
        if !self.board.get_status().is_in_progress() {
            return checked_kings;
        }
        if self.board.in_check() {
            checked_kings.push(&square_to_array(
                self.board
                    .king_square(self.board.get_side_to_move())
            ));
        }
        checked_kings
    }

    pub fn js_moves_from(&self, file: usize, rank: usize) -> Array {
        let square = make_square(file, rank);
        let moves = self.board.moves_from(square);
        let js_moves = Array::new();
        for m in moves {
            let arr_mv = move_to_array(*m);
            js_moves.push(&arr_mv);
        }
        js_moves
    }

    /// Returns:
    /// - `Some(true)` if the move is legal and has a promotion
    /// - `Some(false)` if the move is legal and does not have a promotion
    /// - `None` if the move is illegal
    pub fn js_check_move(
        &self, from_file: usize, from_rank: usize, to_file: usize, to_rank: usize,
    ) -> Option<bool> {
        let from = make_square(from_file, from_rank);
        let to = make_square(to_file, to_rank);
        let m = ChessMove::new(from, to, None);
        let mp = ChessMove::new(from, to, Some(ALL_PIECES[1]));
        if self.board.all_moves().find(| x | **x == m ).is_some() {
            Some(false)
        } else if self.board.all_moves().find(| x | **x == mp ).is_some() {
            Some(true)
        } else {
            None
        }
    }

    pub fn js_apply_move(
        &mut self, from_file: usize, from_rank: usize, to_file: usize, to_rank: usize,
        promotion: Option<usize>,
    ) {
        let from = make_square(from_file, from_rank);
        let to = make_square(to_file, to_rank);
        let m = ChessMove::new(from, to, promotion.map(|i| ALL_PIECES[i]));
        self.board.apply_move(m);
        self.move_history.push(m);
    }

    pub fn js_get_side_to_move(&self) -> JsString {
        if self.board.get_side_to_move().to_index() == 0 {
            "white".into()
        } else {
            "black".into()
        }
    }

    pub fn js_status(&self) -> JsString { self.board.get_status().into() }

}

impl From<Status> for JsString {
    fn from(r: Status) -> JsString {
        match r {
            Status::InProgress => "in progress".into(),
            Status::Win(White) => "white".into(),
            Status::Win(Black) => "black".into(),
            Status::Draw => "draw".into(),
        }
    }
}

fn square_to_array(s: Square) -> Array {
    let js_square = Array::new();
    js_square.push(&s.get_file().to_index().into());
    js_square.push(&s.get_rank().to_index().into());
    js_square
}

fn move_to_array(m: ChessMove) -> Array {
    let js_move = Array::new();
    js_move.push(&m.get_source().get_file().to_index().into());
    js_move.push(&m.get_source().get_rank().to_index().into());
    js_move.push(&m.get_dest().get_file().to_index().into());
    js_move.push(&m.get_dest().get_rank().to_index().into());
    js_move.push(&m.get_promotion().map(|p| p.to_index()).into());
    js_move
}

fn make_square(file: usize, rank: usize) -> Square {
    Square::make_square(chess::Rank::from_index(rank), chess::File::from_index(file))
}
