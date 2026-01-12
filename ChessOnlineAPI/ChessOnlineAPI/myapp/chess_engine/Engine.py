from .pieces.Pawn import Pawn
from .pieces.Rook import Rook
from .pieces.Knight import Knight
from .pieces.Bishop import Bishop
from .pieces.King import King
from .pieces.Queen import Queen
from .utils.Move import Move
from .utils.Castling import CastlingRules

class Board:
    def __init__(self):
        self.board = [
            [Rook("Czarny", 0, 0), Knight("Czarny", 0, 1), Bishop("Czarny", 0, 2), Queen("Czarny", 0, 3), King("Czarny", 0, 4), Bishop("Czarny", 0, 5), Knight("Czarny", 0, 6), Rook("Czarny", 0, 7)],
            [Pawn("Czarny", 1, 0), Pawn("Czarny", 1, 1), Pawn("Czarny", 1, 2), Pawn("Czarny", 1, 3), Pawn("Czarny", 1, 4), Pawn("Czarny", 1, 5), Pawn("Czarny", 1, 6), Pawn("Czarny", 1, 7)],
            [None, None, None, None, None, None, None, None],
            [None, None, None, None, None, None, None, None],
            [None, None, None, None, None, None, None, None],
            [None, None, None, None, None, None, None, None],
            [Pawn("Bialy", 6, 0), Pawn("Bialy", 6, 1), Pawn("Bialy", 6, 2), Pawn("Bialy", 6, 3), Pawn("Bialy", 6, 4), Pawn("Bialy", 6, 5), Pawn("Bialy", 6, 6), Pawn("Bialy", 6, 7)],
            [Rook("Bialy", 7, 0), Knight("Bialy", 7, 1), Bishop("Bialy", 7, 2), Queen("Bialy", 7, 3), King("Bialy", 7, 4), Bishop("Bialy", 7, 5), Knight("Bialy", 7, 6), Rook("Bialy", 7, 7)]
        ]
        self.move_history = []
        self.white_to_move = True
        self.white_king_pos = (7, 4)
        self.black_king_pos = (0, 4)
        self.checkmate = False
        self.stalemate = False
        self.pawn_promotion = False
        self.castling_move = CastlingRules(True, True, True, True)
        self.castling_history = [CastlingRules(self.castling_move.cH, self.castling_move.cK, self.castling_move.bH, self.castling_move.bK)]
        self.you = "B"
        self.opponent = "C"
        self.en_passant_pos = ()

    def update_moves(self):
        temp_en_passant_rules = self.en_passant_pos
        temp_castling_rules = CastlingRules(self.castling_move.cH, self.castling_move.cK, self.castling_move.bH, self.castling_move.bK)

        moves = self.generate_moves()
        if self.white_to_move:
            self.moves_with_castling(self.white_king_pos[0], self.white_king_pos[1], moves,
                                     self.board[self.white_king_pos[0]][self.white_king_pos[1]].color)
        else:
            self.moves_with_castling(self.black_king_pos[0], self.black_king_pos[1], moves,
                                     self.board[self.black_king_pos[0]][self.black_king_pos[1]].color)

        if self.white_to_move:
            color = 'Bialy'
        else:
            color = 'Czarny'

        for move in range(len(moves) - 1, -1, -1):
            self.make_move(moves[move])

            if self.white_to_move:
                self.white_to_move = False
            else:
                self.white_to_move = True

            if self.if_check(color):
                moves.remove(moves[move])

            if self.white_to_move:
                self.white_to_move = False
            else:
                self.white_to_move = True

            self.undo_move()
        if len(moves) == 0:
            if self.if_check(color):
                self.checkmate = True
            else:
                self.stalemate = True
        else:
            self.checkmate = False
            self.stalemate = False

        self.en_passant_pos = temp_en_passant_rules        
        self.castling_move = temp_castling_rules

        for i in range(len(moves)):
            for j in range(i + 1, len(moves)):
                if moves[i].user_notation == moves[j].user_notation and moves[i].moved_figure.name != 'Pionek':
                    piece_letter = moves[i].user_notation[0]

                    # jeśli mają tę samą kolumnę -> rozróżniamy RZĘDEM (liczbą)
                    if moves[i].start_y == moves[j].start_y:
                        moves[i].user_notation = piece_letter + str(8 - moves[i].start_x) + moves[i].user_notation[1:]
                        moves[j].user_notation = piece_letter + str(8 - moves[j].start_x) + moves[j].user_notation[1:]
                    # jeśli mają ten sam rząd -> rozróżniamy KOLUMNĄ (literą)
                    elif moves[i].start_x == moves[j].start_x:
                        moves[i].user_notation = piece_letter + moves[i].dictionary[moves[i].start_y + 1] + moves[i].user_notation[1:]
                        moves[j].user_notation = piece_letter + moves[j].dictionary[moves[j].start_y + 1] + moves[j].user_notation[1:]
                    else:
                        # różne rzędy i kolumny - wystarczy podać KOLUMNĘ (file) dla każdego
                        moves[i].user_notation = piece_letter + moves[i].dictionary[moves[i].start_y + 1] + moves[i].user_notation[1:]
                        moves[j].user_notation = piece_letter + moves[j].dictionary[moves[j].start_y + 1] + moves[j].user_notation[1:]

        return moves

    def check_if_castling_possible(self, move):
        if move.moved_figure.name == 'Krol' and move.moved_figure.color == 'Bialy':
            self.castling_move.bK = False
            self.castling_move.bH = False
        elif move.moved_figure.name == 'Krol' and move.moved_figure.color == 'Czarny':
            self.castling_move.cK = False
            self.castling_move.cH = False
        elif move.moved_figure.name == 'Wieza' and move.moved_figure.color == 'Bialy':
            if move.start_x == 7:
                if move.start_y == 0:
                    self.castling_move.bH = False
                elif move.start_y == 7:
                    self.castling_move.bK = False
        elif move.moved_figure.name == 'Wieza' and move.moved_figure.color == 'Czarny':
            if move.start_x == 0:
                if move.start_y == 0:
                    self.castling_move.cH = False
                elif move.start_y == 7:
                    self.castling_move.cK = False

    def moves_with_castling(self, r, c, accurate_moves, color):
        if self.if_field_under_attack(r, c):
            return
        if (self.white_to_move and self.castling_move.bK) or (not self.white_to_move and self.castling_move.cK):
            if self.board[r][c+1] is None and self.board[r][c+2] is None:
                if not self.if_field_under_attack(r, c + 1) and not self.if_field_under_attack(r, c + 2):
                    accurate_moves.append(Move((c, r), (c + 2, r), self.board, castling=True))

        if (self.white_to_move and self.castling_move.bH) or (not self.white_to_move and self.castling_move.cH):
            if self.board[r][c-1] is None and self.board[r][c-2] is None and self.board[r][c-3] is None:
                if not self.if_field_under_attack(r, c - 1) and not self.if_field_under_attack(r, c - 2):
                    accurate_moves.append(Move((c, r), (c - 2, r), self.board, castling=True))


    def if_field_under_attack(self, r, c):

        original = self.white_to_move
        try:
            self.white_to_move = not original
            opponent_moves = self.generate_moves()
        finally:
            self.white_to_move = original

        for move in opponent_moves:
            if move.dest_x == r and move.dest_y == c:
                return True
        return False
    
    def if_check(self, color):
        original = self.white_to_move
        try:
            self.white_to_move = not original
            opponent_moves = self.generate_moves()
        finally:
            self.white_to_move = original

        for move in opponent_moves:
            if color == 'Bialy' and move.dest_x == self.white_king_pos[0] and move.dest_y == self.white_king_pos[1]:
                return True
            if color == 'Czarny' and move.dest_x == self.black_king_pos[0] and move.dest_y == self.black_king_pos[1]:
                return True
        return False


    def undo_move(self):
        if len(self.move_history) > 0:

            move = self.move_history.pop()
            self.board[move.start_x][move.start_y] = move.moved_figure
            self.board[move.dest_x][move.dest_y] = move.caught_figure
            self.board[move.start_x][move.start_y].row = move.start_x
            self.board[move.start_x][move.start_y].column = move.start_y

            if self.white_to_move:
                self.white_to_move = False
            else:
                self.white_to_move = True

            if move.moved_figure.name == 'Krol' and move.moved_figure.color == 'Bialy':
                self.white_king_pos = (move.start_x, move.start_y)
            elif move.moved_figure.name == 'Krol' and move.moved_figure.color == 'Czarny':
                self.black_king_pos = (move.start_x, move.start_y)

            if move.czy_en_passant:
                self.board[move.dest_x][move.dest_y] = None
                self.board[move.start_x][move.dest_y] = move.caught_figure
                self.en_passant_pos = (move.dest_x, move.dest_y)

            if move.moved_figure.name == 'Pionek' and (move.start_x - move.dest_x == -2 or move.start_x - move.dest_x == 2):
                self.en_passant_pos = ()


            self.castling_history.pop()
            new_rules = self.castling_history[-1]
            self.castling_move = CastlingRules(new_rules.cH, new_rules.cK, new_rules.bH, new_rules.bK)

            if move.castling:
                if move.dest_y - move.start_y == 2:
                    self.board[move.dest_x][move.dest_y + 1] = self.board[move.dest_x][move.dest_y - 1]
                    self.board[move.dest_x][move.dest_y - 1] = None
                    self.board[move.dest_x][move.dest_y + 1].column = move.dest_y + 1
                else:
                    self.board[move.dest_x][move.dest_y - 2] = self.board[move.dest_x][move.dest_y + 1]
                    self.board[move.dest_x][move.dest_y + 1] = None
                    self.board[move.dest_x][move.dest_y - 2].column = move.dest_y - 2


    def promotion(self):
        if len(self.move_history) != 0:
            last_move = self.move_history[-1]
            figure = last_move.moved_figure
            if figure.name == 'Pionek':
                figure.check_if_promotion()
                if figure.promotion == True:
                    self.pawn_promotion = True
                    last_move.promotion = True

    def promote_pawn(self, promotion_type):
        last_move = self.move_history[-1]
        color = last_move.moved_figure.color
        pawn = last_move.moved_figure


        if(promotion_type == 'H'):
            last_move.user_notation += 'H'
            self.board[pawn.row][pawn.column] = Queen(color, pawn.row, pawn.column)
            return
        
        if(promotion_type == 'W'):
            last_move.user_notation += 'W'
            self.board[pawn.row][pawn.column] = Rook(color, pawn.row, pawn.column)
            return
        
        if(promotion_type == 'S'):
            last_move.user_notation += 'S'
            self.board[pawn.row][pawn.column] = Knight(color, pawn.row, pawn.column)
            return
        
        if(promotion_type == 'G'):
            last_move.user_notation += 'G'
            self.board[pawn.row][pawn.column] = Bishop(color, pawn.row, pawn.column)
            return
            

    def generate_moves(self):
        possible_moves = []
        for r in range(len(self.board)):
            for c in range(len(self.board[r])):
                piece = self.board[r][c]
                if piece is not None:
                    if (piece.color == 'Bialy' and self.white_to_move) or (piece.color == 'Czarny' and not self.white_to_move):
                        if piece.name == 'Pionek':
                            possible_moves += piece.generate_possible_moves(self.board, self.en_passant_pos)
                        else:
                            possible_moves += piece.generate_possible_moves(self.board)
                            
                    piece.move_list = []

        return possible_moves

    def make_move(self, move):
            self.board[move.start_x][move.start_y].row = move.dest_x
            self.board[move.start_x][move.start_y].column = move.dest_y
            self.board[move.start_x][move.start_y] = None
            self.board[move.dest_x][move.dest_y] = move.moved_figure
            self.move_history.append(move)

            if self.white_to_move:
                self.white_to_move = False
            else:
                self.white_to_move = True

            if move.moved_figure.name == 'Krol' and move.moved_figure.color == "Bialy":
                self.white_king_pos = (move.dest_x, move.dest_y)
            elif move.moved_figure.name == 'Krol' and move.moved_figure.color == "Czarny":
                self.black_king_pos = (move.dest_x, move.dest_y)

            if move.czy_en_passant:
                if not self.white_to_move:
                    self.board[move.dest_x + 1][move.dest_y] = None
                else:
                    self.board[move.dest_x - 1][move.dest_y] = None



            if move.moved_figure.name == 'Pionek' and (move.dest_x - move.start_x == -2 or move.dest_x - move.start_x == 2):
                self.en_passant_pos = ((move.start_x + move.dest_x) // 2, move.start_y)
            else:
                self.en_passant_pos = ()


            if move.castling:
                if move.dest_y - move.start_y == 2:
                    self.board[move.dest_x][move.dest_y - 1] = self.board[move.dest_x][move.dest_y + 1]
                    self.board[move.dest_x][move.dest_y + 1] = None
                    self.board[move.dest_x][move.dest_y - 1].column = move.dest_y - 1

                else:
                    self.board[move.dest_x][move.dest_y + 1] = self.board[move.dest_x][move.dest_y - 2]
                    self.board[move.dest_x][move.dest_y - 2] = None
                    self.board[move.dest_x][move.dest_y + 1].column = move.dest_y + 1

            self.check_if_castling_possible(move)
            self.castling_history.append(CastlingRules(self.castling_move.cH, self.castling_move.cK, self.castling_move.bH, self.castling_move.bK))