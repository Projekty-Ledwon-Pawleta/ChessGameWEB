# games/engine_adapter.py
import json
import re
from typing import Tuple, Dict, Any, List

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
            "turn": mgr.get_game_turn()
        }

    @staticmethod
    def get_initial_state() -> str:
        state = EngineWrapper._empty_state()
        return json.dumps(state)

    @staticmethod
    def _reconstruct_manager_from_state(state_json: str) -> Tuple[ChessGameManager, List[str]]:
        """
        Load JSON state, create ChessGameManager and replay moves from state["moves"].
        Returns (manager, moves_list)
        """
        mgr = ChessGameManager()
        if not state_json:
            return mgr, []

        moves = []

        # Jeśli dostaliśmy dict już zdeserializowany — użyj go bez parsowania
        if isinstance(state_json, dict):
            obj = state_json
            moves = obj.get("state", {}).get("moves", []) if isinstance(obj, dict) else []  
        else:
            # dopuszczalne typy wejścia: str, bytes, bytearray
            if isinstance(state_json, (bytes, bytearray)):
                try:
                    state_text = state_json.decode("utf-8")
                except Exception:
                    # niepoprawne bajty -> zwracamy świeżego managera
                    return mgr, []
            else:
                state_text = state_json

            try:
                obj = json.loads(state_text)
                moves = obj.get("moves", []) if isinstance(obj, dict) else []  
            except Exception:
                # corrupted or unparsable -> return fresh manager
                return mgr, []
              
        for m in moves:
            try:
                ok = mgr.make_move(m)
            except Exception:
                pass

        return mgr, moves

    @staticmethod
    def serialize_manager_state(mgr: ChessGameManager, moves: List[str]) -> str:
        state = {
            "moves": moves,
            "board": mgr.get_board_state(),
            "checkmate": mgr.is_checkmate(),
            "stalemate": mgr.is_stalemate(),
            "turn": mgr.get_game_turn()
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
            promo = move_data.get("promo", "H") 

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

            ok = mgr.make_move(move_obj.user_notation)
            if not ok:
                return False, serialized_state, {"error": "engine refused move"}

            moves.append(move_obj.user_notation)
            new_state = EngineWrapper.serialize_manager_state(mgr, moves)

            info = {
                "uci": move_obj.user_notation,
                "board": mgr.get_board_state(),
                "checkmate": mgr.is_checkmate(),
                "stalemate": mgr.is_stalemate(),
                "turn": mgr.get_game_turn()
            }
            return True, new_state, info
        except Exception as e:
            return False, serialized_state, {"error": f"engine exception: {e}"}

    @staticmethod
    def legal_moves(serialized_state: str) -> List[str]:
        mgr, _ = EngineWrapper._reconstruct_manager_from_state(serialized_state)
        return mgr.get_possible_moves()
    
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