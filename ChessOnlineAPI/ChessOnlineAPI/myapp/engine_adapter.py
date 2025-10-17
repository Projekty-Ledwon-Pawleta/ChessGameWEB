# games/engine_adapter.py
import json
from typing import Tuple, Dict, Any, List

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
        try:
            obj = json.loads(state_json)
        except Exception:
            # corrupted, return fresh manager
            return mgr, []

        moves = obj.get("moves", [])
        for m in moves:
            # assume make_move returns True/False
            ok = mgr.make_move(m)
            if not ok:
                # If replay fails (shouldn't in normal cases), ignore or break
                # we continue to keep manager as close as possible
                pass
        return mgr, moves

    @staticmethod
    def serialize_manager_state(mgr: ChessGameManager, moves: List[str]) -> str:
        state = {
            "moves": moves,
            "board": mgr.get_board_state(),
            "checkmate": mgr.is_checkmate(),
            "stalemate": mgr.is_stalemate(),
        }
        return json.dumps(state)

    @staticmethod
    def validate_and_apply(serialized_state: str, move_notation: str) -> Tuple[bool, str, Dict[str,Any]]:
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
            if move_notation not in legal:
                return False, serialized_state, {"error": "illegal move", "legal_moves": legal}

            # Apply
            ok = mgr.make_move(move_notation)
            if not ok:
                return False, serialized_state, {"error": "engine refused move"}

            # append to moves
            moves.append(move_notation)
            new_state = EngineWrapper.serialize_manager_state(mgr, moves)

            info = {
                "uci": move_notation,   # using user_notation as canonical here
                "board": mgr.get_board_state(),
                "checkmate": mgr.is_checkmate(),
                "stalemate": mgr.is_stalemate(),
            }
            return True, new_state, info
        except Exception as e:
            return False, serialized_state, {"error": f"engine exception: {e}"}

    @staticmethod
    def legal_moves(serialized_state: str) -> List[str]:
        mgr, _ = EngineWrapper._reconstruct_manager_from_state(serialized_state)
        return mgr.get_possible_moves()
