from .Figure import *
from ..utils.Move import Move

class Queen(Figure):
    name = 'Hetman'

    def generate_possible_moves(self, board):
        for field in range(1, self.row + 1):
             if board[self.row - field][self.column] is None:
                self.move_list.append(Move((self.column, self.row), (self.column, self.row - field), board))
             else:
                if board[self.row - field][self.column].color != self.color:
                    self.move_list.append(Move((self.column, self.row), (self.column, self.row - field), board))
                break

        for field in range(self.row + 1, len(board)):
             #print(pole)
             if board[field][self.column] is None:
                self.move_list.append(Move((self.column, self.row), (self.column, field), board))
             else:
                if board[field][self.column].color != self.color:
                    self.move_list.append(Move((self.column, self.row), (self.column, field), board))
                break

        for field in range(1, self.column + 1):
            if board[self.row][self.column - field] is None:
                self.move_list.append(Move((self.column, self.row), (self.column - field, self.row), board))
            else:
                if board[self.row][self.column - field].color != self.color:
                    self.move_list.append(Move((self.column, self.row), (self.column - field, self.row), board))
                break

        for field in range(self.column + 1, len(board)):
             #print(pole)
             if board[self.row][field] is None:
                self.move_list.append(Move((self.column, self.row), (field, self.row), board))
             else:
                if board[self.row][field].color != self.color:
                    self.move_list.append(Move((self.column, self.row), (field, self.row), board))
                break

        for field in range(1, min(self.row + 1, self.column + 1)):
             #print(pole)
             if board[self.row - field][self.column - field] is None:
                self.move_list.append(Move((self.column, self.row), (self.column - field, self.row - field), board))
             else:
                if board[self.row - field][self.column - field].color != self.color:
                    self.move_list.append(Move((self.column, self.row), (self.column - field, self.row - field), board))
                break

        for field in range(1, min(self.row + 1, len(board) - self.column)):
            if board[self.row - field][self.column + field] is None:
                self.move_list.append(Move((self.column, self.row), (self.column + field, self.row - field), board))
            else:
                if board[self.row - field][self.column + field].color != self.color:
                    self.move_list.append(Move((self.column, self.row), (self.column + field, self.row - field), board))
                break

        for field in range(1, min(len(board) - self.row, len(board) - self.column)):
            if board[self.row + field][self.column + field] is None:
                self.move_list.append(Move((self.column, self.row), (self.column + field, self.row + field), board))
            else:
                if board[self.row + field][self.column + field].color != self.color:
                    self.move_list.append(Move((self.column, self.row), (self.column + field, self.row + field), board))
                break

        for field in range(1, min(len(board) - self.row, self.column + 1)):
            if board[self.row + field][self.column - field] is None:
                self.move_list.append(Move((self.column, self.row), (self.column - field, self.row + field), board))
            else:
                if board[self.row + field][self.column - field].color != self.color:
                    self.move_list.append(Move((self.column, self.row), (self.column - field, self.row + field), board))
                break

        return self.move_list
