use std::{convert::TryInto, slice::Iter};

use chess::{
    Board, BoardBuilder, CastleRights, ChessMove, Color, Piece, Square, MoveGen, BoardStatus,
};

// use crate::zobrist::Zobrist;

pub struct BoardManager {
    board: Board,
    moves: Vec<ChessMove>
}

#[derive(Copy, Clone, Debug)]
pub enum Status {
    InProgress,
    Win(Color),
    Draw,
}

impl Status {
    pub fn is_in_progress(&self) -> bool { matches!(self, Status::InProgress) }
}

impl BoardManager {
    pub fn get_side_to_move(&self) -> Color { self.board.side_to_move() }
    pub fn get_castle_rights(&self, color: Color) -> CastleRights {
        self.board.castle_rights(color)
    }
    // pub fn get_dead_moves(&self) -> u8 { self.dead_moves }
    pub fn get_status(&self) -> Status { 
        match self.board.status() {
            BoardStatus::Ongoing => Status::InProgress,
            BoardStatus::Stalemate => Status::Draw,
            BoardStatus::Checkmate => Status::Win(!self.board.side_to_move())
        }
    }
    // pub fn get_white_pieces(&self) -> BitBoard { self.white_pieces }
    // pub fn get_black_pieces(&self) -> BitBoard { self.black_pieces }
    // pub fn get_zobrist_hash(&self) -> u64 { self.zobrist_hash }

    pub fn initial_board() -> BoardManager {
        let board = BoardBuilder::default().try_into().unwrap();
        let moves = MoveGen::new_legal(&board).collect::<Vec<ChessMove>>();
        BoardManager {
            board,
            moves,
        }
    }

    pub fn moves_from(&self, sq: Square) -> Vec<&ChessMove> {
        self.moves.iter().filter(| chess_move | chess_move.get_source() == sq).collect()
    }

    pub fn apply_move(&mut self, m: ChessMove) {
        assert!(self.moves.contains(&m));
        self.apply_move_unchecked(m);
    }

    pub fn apply_move_unchecked(&mut self, m: ChessMove) {
        self.board = self.board.make_move_new(m);
        self.moves = MoveGen::new_legal(&self.board).collect();
    }

    pub fn all_moves(&self) -> Iter<'_, ChessMove> {
        self.moves.iter()
    }

    pub fn in_check(&self) -> bool {
        self.board.checkers().popcnt() > 0
    }

    pub fn king_square(&self, color: Color) -> Square {
        self.board.king_square(color)
    }

    pub fn get_piece(&self, sq: Square) -> Option<(Piece, Color)> {
        match self.board.piece_on(sq)  {
            Some(piece) => {
                Some((piece, self.board.color_on(sq).unwrap()))
            }
            None => None
        }
    }
}
