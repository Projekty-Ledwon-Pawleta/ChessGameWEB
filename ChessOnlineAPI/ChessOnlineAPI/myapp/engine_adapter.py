# games/engine_adapter.py
import json
import re
from typing import Tuple, Dict, Any, List

from myapp.chess_engine.Engine import Board
from myapp.chess_engine.pieces.Pawn import Pawn
from myapp.chess_engine.pieces.Queen import Queen
from myapp.chess_engine.pieces.Bishop import Bishop
from myapp.chess_engine.pieces.King import King
from myapp.chess_engine.pieces.Knight import Knight
from myapp.chess_engine.pieces.Rook import Rook
from myapp.chess_engine.utils.Castling import CastlingRules
from myapp.chess_engine.utils.Move import Move

# Adjust import path to where you put your ChessGameManager
# Example: games/engine_impl/chess_manager.py contains ChessGameManager
from .chess_engine.Game_Manager import ChessGameManager

class EngineWrapper:
    """
    Adapter that:
      - serializes state as JSON: {"moves": [...], "board": [[...]], "checkmate": bool, "stalemate": bool}
      - reconstructs state by replaying moves
      - validate_and_apply applies a new move (user notation e.g. "e2e4" or your user_notation)
    """

    @staticmethod
    def _empty_state() -> Dict[str, Any]:
        mgr = ChessGameManager()
        return {
            "moves": [],
            "board": mgr.get_board_state(),
            "checkmate": mgr.is_checkmate(),
            "stalemate": mgr.is_stalemate(),
            "turn": mgr.get_game_turn(),
            "castling": mgr.get_board_castling_rules()
        }

    @staticmethod
    def get_initial_state() -> str:
        state = EngineWrapper._empty_state()
        return json.dumps(state)

    @staticmethod
    def _reconstruct_manager_from_state(state_json: str) -> Tuple[ChessGameManager, List[str]]:
        mgr = ChessGameManager()
        if not state_json:
            return mgr, []

        if isinstance(state_json, dict):
            obj = state_json
        else:
            if isinstance(state_json, (bytes, bytearray)):
                try:
                    state_text = state_json.decode("utf-8")
                except Exception:
                    return mgr, []
            else:
                state_text = state_json
            try:
                obj = json.loads(state_text)
            except Exception:
                return mgr, []

        moves = obj.get("moves", []) if isinstance(obj, dict) else []

        if not moves:
            moves = obj.get("state").get("moves", []) if "state" in obj else moves

        board_data = obj.get("board", None)
        if not board_data:
            board_data = obj.get("state").get("board", None) if "state" in obj else None

        def _make_piece_from_token(token: str, r: int, c: int):
            if token is None:
                return None
            if not isinstance(token, str) or len(token) < 2:
                return None
            color_char = token[0]  # 'b' or 'c'
            name = token[1:]       # e.g. "Pionek", "Wieza", ...
            color = "Bialy" if color_char == "b" else "Czarny"

            # Tworzymy obiekt figury z odpowiadającymi parametrami (r, c)
            if name == "Pionek":
                return Pawn(color, r, c)
            if name == "Wieza":
                return Rook(color, r, c)
            if name == "Skoczek":
                return Knight(color, r, c)
            if name == "Goniec":
                return Bishop(color, r, c)
            if name == "Krol":
                return King(color, r, c)
            if name == "Hetman":
                return Queen(color, r, c)
            return None
        
        # Jeżeli jest board -> zbuduj planszę bez replayowania ruchów
        if board_data and isinstance(board_data, list):
            b = Board()

            # zainicjuj pustą 8x8 planszę
            new_board = [[None for _ in range(8)] for _ in range(8)]
            white_king_pos = None
            black_king_pos = None

            for r in range(min(8, len(board_data))):
                row = board_data[r]
                if not isinstance(row, list):
                    continue
                for c in range(min(8, len(row))):
                    token = row[c]
                    piece = _make_piece_from_token(token, r, c)
                    new_board[r][c] = piece
                    if piece is not None and getattr(piece, "name", None) == "Krol":
                        if piece.color == "Bialy":
                            white_king_pos = (r, c)
                        else:
                            black_king_pos = (r, c)

            b.board = new_board
            b.move_history = []  # nie odtwarzamy historii ruchów tutaj

            # ustawienie turn (white_to_move). JSON używa "b" dla białych, "c" dla czarnych
            turn = obj.get("turn", None)
            if turn == "b":
                b.white_to_move = True
            elif turn == "c":
                b.white_to_move = False
            else:
                # fallback: jeżeli liczba ruchów parzysta -> biały do ruchu
                b.white_to_move = (len(moves) % 2 == 0)

            # Pozycje królów (fallback do domyślnych jeśli nie znalezione)
            if white_king_pos:
                b.white_king_pos = white_king_pos
            if black_king_pos:
                b.black_king_pos = black_king_pos

            # checkmate / stalemate
            
            b.checkmate = bool(obj.get("checkmate")) or bool(obj.get("state", {}).get("checkmate"))
            b.stalemate = bool(obj.get("stalemate")) or bool(obj.get("state", {}).get("stalemate"))

            # castling: odczytamy obiekt jeśli jest, inaczej None
            cm = obj.get("castling") or obj.get("state", {}).get("castling")

            if cm and isinstance(cm, dict):
                # CastlingRules(cH, cK, bH, bK) - dostosuj kolejność jeśli Twoja klasa inna
                b.castling_move = CastlingRules(
                    bool(cm.get("cH", False)),
                    bool(cm.get("cK", False)),
                    bool(cm.get("bH", False)),
                    bool(cm.get("bK", False))
                )       
            mgr.board = b

            return mgr, moves
        
        return mgr, moves


    @staticmethod
    def serialize_manager_state(mgr: ChessGameManager, moves: List[str]) -> str:
        state = {
            "moves": moves,
            "board": mgr.get_board_state(),
            "checkmate": mgr.is_checkmate(),
            "stalemate": mgr.is_stalemate(),
            "turn": mgr.get_game_turn(),
            "castling": mgr.get_board_castling_rules()
        }
        return json.dumps(state)

    
    @staticmethod
    def validate_and_apply(serialized_state: str, move_data: dict) -> Tuple[bool, str, Dict[str,Any]]:
        """
        Apply a move in your engine's user_notation.
        Returns:
          (True, new_serialized_state, info_dict) on success
          (False, original_serialized_state, {"error": "reason"}) on failure
        """
        try:
            mgr, moves = EngineWrapper._reconstruct_manager_from_state(serialized_state)
            # Check legal moves first (optional)
            legal = mgr.get_possible_moves()

            if not move_data or not isinstance(move_data, dict):
                return False, serialized_state, {"error": "invalid move_data"}

            fr = move_data.get("from")
            to = move_data.get("to")
            promo = move_data.get("promo") 

            if not fr or not to:
                return False, serialized_state, {"error": "missing from/to coordinates"}

            start_row, start_col = fr["r"], fr["c"]
            dest_row, dest_col = to["r"], to["c"]

            move_obj = Move(
                start=(start_col, start_row),
                dest=(dest_col, dest_row),
                board=mgr.board.board,
                promotion=promo != ""
            )

            check_if_en_passant(mgr, move_obj, start_row, start_col, dest_row, dest_col)

            check_if_castling(mgr, move_obj, start_row, start_col, dest_row, dest_col)

            resolved = check_if_conflict_notations(mgr, move_obj, legal)
            move_obj.user_notation = resolved

            ok = mgr.make_move(move_obj.user_notation, promo)
            if not ok:
                return False, serialized_state, {"error": "engine refused move"}

            moves.append(move_obj.user_notation)
            new_state = EngineWrapper.serialize_manager_state(mgr, moves)

            info = {
                "uci": move_obj.user_notation,
                "board": mgr.get_board_state(),
                "checkmate": mgr.is_checkmate(),
                "stalemate": mgr.is_stalemate(),
                "turn": mgr.get_game_turn(),
                "castling": mgr.get_board_castling_rules()
            }
            return True, new_state, info
        except Exception as e:
            return False, serialized_state, {"error": f"engine exception: {e}"}

    @staticmethod
    def legal_moves(serialized_state: str) -> List[str]:
        mgr, _ = EngineWrapper._reconstruct_manager_from_state(serialized_state)
        return mgr.get_possible_move_notations()
    
    @staticmethod
    def _is_uci_coord(s: str) -> bool:
        return bool(re.fullmatch(r'^[a-h][1-8][a-h][1-8]$', s.lower()))

    @staticmethod
    def _coord_to_indexes(square: str):
        """
        Converts algebraic square like 'e2' -> (row, col) with row, col in 0..7
        row 0 = top (rank 8), row 7 = bottom (rank 1)
        col 0 = 'a', col 7 = 'h'
        """
        files = 'abcdefgh'
        file_ch = square[0].lower()
        rank_ch = square[1]
        col = files.index(file_ch)
        row = 8 - int(rank_ch)  # rank '1' -> row 7; rank '8' -> row 0
        return row, col
    
def check_if_en_passant(mgr: ChessGameManager, move_obj: Move, start_row: int, start_col: int, dest_row: int, dest_col: int):
        moved_piece = mgr.board.board[start_row][start_col]
        if moved_piece and moved_piece.name == "Pionek":
            caught_piece = mgr.board.board[dest_row][dest_col]
            if abs(dest_col - start_col) == 1 and caught_piece is None:
                # pion bije na ukos puste pole → en passant
                if moved_piece.color == "Bialy":
                    target_piece = mgr.board.board[dest_row + 1][dest_col]
                else:
                    target_piece = mgr.board.board[dest_row - 1][dest_col]
                if target_piece and target_piece.name == "Pionek" and target_piece.color != moved_piece.color:
                    move_obj.czy_en_passant = True
                    move_obj.caught_figure = target_piece
                    move_obj.user_notation = f"{Move.dictionary[start_col + 1]}x{Move.dictionary[dest_col + 1]}{8 - dest_row}"   


def check_if_castling(mgr: ChessGameManager, move_obj: Move, start_row: int, start_col: int, dest_row: int, dest_col: int):
    moved_piece = mgr.board.board[start_row][start_col]
    if moved_piece and moved_piece.name == "Krol":
        if abs(dest_col - start_col) == 2:
            # Roszada królewska (0-0) lub hetmańska (0-0-0)
            move_obj.castling = True
            if dest_col - start_col == 2:
                move_obj.user_notation = "0-0"   # królewska
            else:
                move_obj.user_notation = "0-0-0" # hetmańska

def check_if_conflict_notations(mgr: ChessGameManager, move_obj: Move, legal_moves: list) -> str:
    """
    legal_moves: lista obiektów Move (lub ewentualnie listę notacji — funkcja obsłuży obie opcje)
    Zwraca poprawioną notację dla move_obj (dodaje disambiguator jeśli potrzeba).
    """
    base = move_obj.user_notation

    if move_obj is None or getattr(move_obj, 'moved_figure', None) is None:
        return base
    # pomijamy pionki i roszady
    if move_obj.moved_figure.name == 'Pionek':
        return base
    if base in ('0-0', '0-0-0', 'O-O', 'O-O-O'):
        return base

    piece_letter = base[0]
    has_capture = 'x' in base

    # konwersja współrzędnych dest -> notacja (np. (dest_y,dest_x) -> 'e5')
    def dest_to_square(dest_x, dest_y):
        # dest_x = row index (0..7), dest_y = col index (0..7)
        try:
            file_letter = Move.dictionary[dest_y + 1]
        except Exception:
            file_letter = chr(ord('a') + dest_y)
        rank = str(8 - dest_x)
        return file_letter + rank

    target_square = dest_to_square(move_obj.dest_x, move_obj.dest_y)

    # Zbuduj listę konkurentów: inne ruchy z legal_moves prowadzące na to samo pole,
    # tej samej klasy/typu i tego samego koloru (pomijamy nasz move_obj)
    competitors = []
    for m in legal_moves:
        # jeśli legal_moves są notacjami (str) — pominąć
        if not hasattr(m, 'dest_x'):
            continue
        # pomiń ten sam ruch
        if m.start_x == move_obj.start_x and m.start_y == move_obj.start_y and m.dest_x == move_obj.dest_x and m.dest_y == move_obj.dest_y:
            continue
        # musi prowadzić na to samo pole docelowe
        if m.dest_x != move_obj.dest_x or m.dest_y != move_obj.dest_y:
            continue
        # musi być ten sam typ figury (po klasie lub po .name)
        same_class = m.moved_figure.__class__.__name__ == move_obj.moved_figure.__class__.__name__
        same_name = getattr(m.moved_figure, 'name', None) == getattr(move_obj.moved_figure, 'name', None)
        if not (same_class or same_name):
            continue
        # musi być ten sam kolor (używamy koloru ruszanej figury)
        moved_color = getattr(move_obj.moved_figure, 'color', None)
        m_color = getattr(m.moved_figure, 'color', None)
        if moved_color is not None and m_color is not None and moved_color != m_color:
            continue
        # to jest konkurent
        competitors.append(m)

    # jeśli brak konkurentów -> nie trzeba disambiguatora
    if not competitors:
        return base

    # helpery do tworzenia disambiguatorów i notacji
    def col_to_file_letter(col_idx: int) -> str:
        try:
            return Move.dictionary[col_idx + 1]
        except Exception:
            return chr(ord('a') + col_idx)

    def row_idx_to_rank_number(row_idx: int) -> str:
        return str(8 - row_idx)

    def make_notation(piece_letter, disamb, has_x, target):
        return piece_letter + disamb + ('x' if has_x else '') + target

    # nasze disambiguatory (dla move_obj)
    my_file = col_to_file_letter(move_obj.start_y)
    my_rank = row_idx_to_rank_number(move_obj.start_x)
    my_both = my_file + my_rank

    # konstrukcja notacji konkurentów przy różnych wyborach disambiguatora
    def competitor_notation_with_choice(comp_move, choice):
        # choice: 'file'|'rank'|'both'|'' (none)
        if choice == 'file':
            d = col_to_file_letter(comp_move.start_y)
        elif choice == 'rank':
            d = row_idx_to_rank_number(comp_move.start_x)
        elif choice == 'both':
            d = col_to_file_letter(comp_move.start_y) + row_idx_to_rank_number(comp_move.start_x)
        else:
            d = ''
        # capture dla konkurenta sprawdzamy po jego user_notation (może być lepiej: check jeśli caught_figure != None)
        comp_has_x = 'x' in getattr(comp_move, 'user_notation', '')
        return make_notation(piece_letter, d, comp_has_x, dest_to_square(comp_move.dest_x, comp_move.dest_y))

    # spróbuj file
    my_not_file = make_notation(piece_letter, my_file, has_capture, target_square)
    competitor_file_notations = {competitor_notation_with_choice(c, 'file') for c in competitors}
    if my_not_file not in competitor_file_notations:
        return my_not_file

    # spróbuj rank
    my_not_rank = make_notation(piece_letter, my_rank, has_capture, target_square)
    competitor_rank_notations = {competitor_notation_with_choice(c, 'rank') for c in competitors}
    if my_not_rank not in competitor_rank_notations:
        return my_not_rank

    # w ostateczności użyj obu (file+rank)
    my_not_both = make_notation(piece_letter, my_both, has_capture, target_square)
    return my_not_both
