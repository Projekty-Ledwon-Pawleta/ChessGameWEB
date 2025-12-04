from .Figure import *
from ..utils.Move import Move

class King(Figure):
    name = 'Krol'
    pierwszy = True

    def generate_possible_moves(self, board):
        if self.row > 0:
            if board[self.row - 1][self.column] is None:
                self.move_list.append(Move((self.column, self.row), (self.column, self.row - 1), board))
            else:
                if board[self.row - 1][self.column].color != board[self.row][self.column].color:
                    self.move_list.append(Move((self.column, self.row), (self.column, self.row - 1), board))
            if self.column > 0:
                if board[self.row - 1][self.column - 1] is None:
                    self.move_list.append(Move((self.column, self.row), (self.column - 1, self.row - 1), board))
                else:
                    if board[self.row - 1][self.column - 1].color != board[self.row][self.column].color:
                        self.move_list.append(Move((self.column, self.row), (self.column - 1, self.row - 1), board))
            if self.column < 7:
                if board[self.row - 1][self.column + 1] is None:
                    self.move_list.append(Move((self.column, self.row), (self.column + 1, self.row - 1), board))
                else:
                    if board[self.row - 1][self.column + 1].color != board[self.row][self.column].color:
                        self.move_list.append(Move((self.column, self.row), (self.column + 1, self.row - 1), board))

        if self.row < 7:
            if board[self.row + 1][self.column] is None:
                self.move_list.append(Move((self.column, self.row), (self.column, self.row + 1), board))
            else:
                if board[self.row + 1][self.column].color != board[self.row][self.column].color:
                    self.move_list.append(Move((self.column, self.row), (self.column, self.row + 1), board))
            if self.column > 0:
                if board[self.row + 1][self.column - 1] is None:
                    self.move_list.append(Move((self.column, self.row), (self.column - 1, self.row + 1), board))
                else:
                    if board[self.row + 1][self.column - 1].color != board[self.row][self.column].color:
                        self.move_list.append(Move((self.column, self.row), (self.column - 1, self.row + 1), board))
            if self.column < 7:
                if board[self.row + 1][self.column + 1] is None:
                    self.move_list.append(Move((self.column, self.row), (self.column + 1, self.row + 1), board))
                else:
                    if board[self.row + 1][self.column + 1].color != board[self.row][self.column].color:
                        self.move_list.append(Move((self.column, self.row), (self.column + 1, self.row + 1), board))

        if self.column > 0:
            if board[self.row][self.column - 1] is None:
                self.move_list.append(Move((self.column, self.row), (self.column - 1, self.row), board))
            else:
                if board[self.row][self.column - 1].color != board[self.row][self.column].color:
                    self.move_list.append(Move((self.column, self.row), (self.column - 1, self.row), board))
        if self.column < 7:
            if board[self.row][self.column + 1] is None:
                self.move_list.append(Move((self.column, self.row), (self.column + 1, self.row), board))
            else:
                if board[self.row][self.column + 1].color != board[self.row][self.column].color:
                    self.move_list.append(Move((self.column, self.row), (self.column + 1, self.row), board))


        return self.move_list
