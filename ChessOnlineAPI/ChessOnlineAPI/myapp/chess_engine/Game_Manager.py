from .Engine import Board
from .utils.Move import Move

class ChessGameManager:
    def __init__(self):
        self.board = Board()

    def get_possible_moves(self):
        possible_moves = self.board.update_moves()
        return [move.user_notation for move in possible_moves]

    def make_move(self, move_notation):
        possible_moves = self.board.update_moves()

        print("possible moves:", possible_moves)

        for move in possible_moves:
            if move.user_notation == move_notation:
                self.board.make_move(move)
                return True
        return False

    def get_board_state(self):
        data = [[piece.color[0].lower() + piece.name if piece else None for piece in row] for row in self.board.board]
        print(data)
        return data

    def is_checkmate(self):
        return self.board.checkmate

    def is_stalemate(self):
        return self.board.stalemate

    def promote_pawn(self, promotion_type):
        self.board.promote_pawn(promotion_type)

    def get_game_turn(self):
        return 'b' if self.board.white_to_move else 'c'