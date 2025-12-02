from .Engine import Board

class ChessGameManager:
    def __init__(self):
        self.board = Board()

    def get_possible_moves(self):
        return self.board.update_moves()
    
    def get_possible_move_notations(self):
        possible_moves = self.board.update_moves()
        return [move.user_notation for move in possible_moves]

    def make_move(self, move_notation, promotion_type=None):
        possible_moves = self.board.update_moves()
        
        for move in possible_moves:
            if move.user_notation == move_notation:
                self.board.make_move(move)
                
                if promotion_type:
                    self.promote_pawn(promotion_type)

                return True
        return False

    def get_board_state(self):
        data = [[piece.color[0].lower() + piece.name if piece else None for piece in row] for row in self.board.board]
        return data
    
    def get_board_castling_rules(self):
         return self.board.castling_move.serialize()

    def is_checkmate(self):
        return self.board.checkmate

    def is_stalemate(self):
        return self.board.stalemate

    def promote_pawn(self, promotion_type):
        self.board.promote_pawn(promotion_type)

    def get_game_turn(self):
        return 'b' if self.board.white_to_move else 'c'