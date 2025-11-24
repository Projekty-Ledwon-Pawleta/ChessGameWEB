from ..pieces.Pawn import Pawn
from ..pieces.Figure import Figure

class Move:
    dictionary = {
        1: 'a',
        2: 'b',
        3: 'c',
        4: 'd',
        5: 'e',
        6: 'f',
        7: 'g',
        8: 'h'
    }
    r_dictionary = {
        'a': 1,
        'b': 2,
        'c': 3,
        'd': 4,
        'e': 5,
        'f': 6,
        'g': 6,
        'h': 7
    }

    def __init__(self, start, dest, board, castling = False, en_passant=False, promotion = False):
        self.start_x = start[1]
        self.start_y = start[0]
        self.dest_x = dest[1]
        self.dest_y = dest[0]
        self.moved_figure = board[self.start_x][self.start_y]
        self.caught_figure = board[self.dest_x][self.dest_y]
        self.notation = str(self.start_x) + str(self.start_y) + str(self.dest_x) + str(self.dest_y)
        self.promotion = promotion
        self.user_notation = ""
        if self.moved_figure is None:
            return

        if self.caught_figure is None:
            if self.moved_figure.name == 'Pionek':
                self.user_notation = str(self.dictionary[self.dest_y + 1]) + str(8 - self.dest_x)
            else:
                self.user_notation = self.moved_figure.name[0] + str(self.dictionary[self.dest_y + 1]) + str(8 - self.dest_x)
        else:
            if self.moved_figure.name == 'Pionek':
                self.user_notation = str(self.dictionary[self.start_y + 1]) + 'x' + str(self.dictionary[self.dest_y + 1]) + str(8 - self.dest_x)
            else:
                self.user_notation = self.moved_figure.name[0] + 'x' + str(self.dictionary[self.dest_y + 1]) + str(8 - self.dest_x)

        self.czy_en_passant = en_passant
        if self.czy_en_passant:
            if self.moved_figure.color == 'Bialy':
                self.caught_figure = Pawn("Czarny", self.dest_x + 1, self.dest_y)
            else:
                self.caught_figure = Pawn("Bialy", self.dest_x - 1, self.dest_y)
            self.user_notation = str(self.dictionary[self.start_y + 1]) + 'x' + str(self.dictionary[self.dest_y + 1]) + str(8 - self.dest_x)

        self.castling = castling
        if self.castling:
            if self.dest_y - self.start_y == 2:
                self.user_notation = '0-0'
            elif self.dest_y - self.start_y == -2:
                self.user_notation = '0-0-0'

    def __eq__(self, other):
        return self.notation == other.notation



