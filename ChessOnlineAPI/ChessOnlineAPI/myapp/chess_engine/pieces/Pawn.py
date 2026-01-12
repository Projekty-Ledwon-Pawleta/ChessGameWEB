from .Figure import *

class Pawn(Figure):
    name = 'Pionek'
    first = True
    promotion = False

    def check_if_promotion(self):
        if self.color == 'Bialy' and self.row == 0:
            self.promotion = True
        elif self.color == 'Czarny' and self.row == 7:
            self.promotion = True

    def generate_possible_moves(self, board, en_passant_pos=None):
         from myapp.chess_engine.utils.Move import Move

         if self.color == 'Bialy':
            if board[self.row - 1][self.column] is None:
                self.move_list.append(Move((self.column, self.row), (self.column, self.row - 1), board))
                if self.row == 6 and board[self.row - 2][self.column] is None:
                    self.move_list.append(Move((self.column, self.row), (self.column, self.row - 2), board))
                    self.first = False

            if self.column - 1 >= 0:
                if board[self.row - 1][self.column - 1] is not None and board[self.row - 1][self.column - 1].color != 'Bialy':
                    self.move_list.append(Move((self.column, self.row), (self.column - 1, self.row - 1), board))
                elif (self.row - 1, self.column - 1) == en_passant_pos:
                    self.move_list.append(
                        Move((self.column, self.row), (self.column - 1, self.row - 1), board, castling=False,
                             en_passant=True))
            if self.column + 1 <= 7:
                if board[self.row - 1][self.column + 1] is not None and board[self.row - 1][self.column + 1].color != 'Bialy':
                    self.move_list.append(Move((self.column, self.row), (self.column + 1, self.row - 1), board))
                elif (self.row - 1, self.column + 1) == en_passant_pos:
                    self.move_list.append(
                        Move((self.column, self.row), (self.column + 1, self.row - 1), board, castling=False,
                             en_passant=True))

         else:
            if self.row<7:
                if board[self.row + 1][self.column] is None:
                    self.move_list.append(Move((self.column, self.row), (self.column, self.row + 1), board))
                    if self.row == 1 and board[self.row + 2][self.column] is None:
                        self.move_list.append(Move((self.column, self.row), (self.column, self.row + 2), board))
                        self.first = False
                if self.column - 1 >= 0:
                    if board[self.row + 1][self.column - 1] is not None and board[self.row + 1][self.column - 1].color != 'Czarny':
                        self.move_list.append(Move((self.column, self.row), (self.column - 1, self.row + 1), board))
                    elif (self.row + 1, self.column - 1) == en_passant_pos:
                        self.move_list.append(
                            Move((self.column, self.row), (self.column - 1, self.row + 1), board, castling=False,
                                 en_passant=True))
                if self.column + 1 <= 7:
                    if board[self.row + 1][self.column + 1] is not None and board[self.row + 1][self.column + 1].color != 'Czarny':
                        self.move_list.append(Move((self.column, self.row), (self.column + 1, self.row + 1), board))
                    elif (self.row + 1, self.column + 1) == en_passant_pos:
                        self.move_list.append(
                            Move((self.column, self.row), (self.column + 1, self.row + 1), board, castling=False,
                                 en_passant=True))

         return self.move_list
