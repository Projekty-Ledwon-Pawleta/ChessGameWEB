class Figure:

    def __init__(self, color, row, column):
        self.color = color
        self.row = row
        self.column = column
        self.move_list = []
        self.chosen = False

    def move(self):
         raise Exception("Not possible move")

    def generate_possible_moves(self, board):
        pass






