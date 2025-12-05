// utility: konwersje pomiędzy współrzędnymi tablicy (r,c) a nazwą pola 'e4'
const files = 'abcdefgh';
const ranks = '87654321';

export function squareNameToRC(sq) {
  if (!sq || typeof sq !== 'string' || sq.length !== 2) return null;
  const file = files.indexOf(sq[0]);
  const rank = ranks.indexOf(sq[1]);
  if (file === -1 || rank === -1) return null;
  return { r: rank, c: file };
}

export function rcToSquareName(r, c) {
  if (r < 0 || r > 7 || c < 0 || c > 7) return null;
  return `${files[c]}${ranks[r]}`;
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

export function colorOfPieceAt(cellValue, row) {
  if (!cellValue) return null;
  const cleaned = String(cellValue).replace(/\s+/g, '');
  if (/^[bc]/.test(cleaned)) return cleaned[0];
  const inferred = inferColorFromRow(row);
  if (inferred) return inferred;
  // fallback: check which colored asset exists
  if (pieceMap['b' + cleaned] && !pieceMap['c' + cleaned]) return 'b';
  if (pieceMap['c' + cleaned] && !pieceMap['b' + cleaned]) return 'c';
  return null;
}

// sprawdza czy na polu jest figura przeciwnika (zakłada format board[][] wartości jak u Ciebie)
function isOpponentAt(board, r, c, myColor) {
  const v = board[r] && board[r][c];
  if (!v) return false;
  const col = colorOfPieceAt(v, r);
  return col && myColor && col !== myColor;
}

function isEmpty(board, r, c) {
  return !(board[r] && board[r][c]);
}

// sprawdza czy ścieżka pomiędzy (sr,sc) a (r,c) jest pusta (wyłączając końcowe pole)
export function isPathClear(board, sr, sc, r, c) {
  const dr = Math.sign(r - sr);
  const dc = Math.sign(c - sc);
  let cr = sr + dr;
  let cc = sc + dc;
  while (cr !== r || cc !== c) {
    if (!inBounds(cr, cc)) return false;
    if (!isEmpty(board, cr, cc)) return false;
    cr += dr;
    cc += dc;
  }
  return true;
}

// mapowanie liter typu figury -> canonical type
export function canonicalPieceType(pt) {
  if (!pt) return null;
  const s = String(pt).trim();
  const letter = s[0].toUpperCase();
  // heurystyka z przykładów: S - Skoczek, H - Hetman (queen), G - Goniec (bishop), K - Król (king)
  // P - pawn/pion, R - rook/wieża (jeśli masz inną literę dla wieży, dodaj tutaj)
  if (letter === 'S') return 'knight';
  if (letter === 'H') return 'queen';
  if (letter === 'G') return 'bishop';
  if (letter === 'K') return 'king';
  if (letter === 'R' || letter === 'W') return 'rook'; // 'W' if someone uses 'Wieza'
  if (letter === 'Q') return 'queen';
  if (letter === 'B') return 'bishop';
  if (letter === 'P' || /pawn|pion/i.test(s)) return 'pawn';
  // fallback: jeśli pojedyncza litera a-h to nie jest typ — zwracamy null (bezpieczeństwo)
  return letter;
}

export function pieceTypeFromCell(cellValue, row) {
  if (!cellValue) return null;
  const key = normalizedPieceKey(cellValue, row);
  // usuń prefiks koloru
  return key.replace(/^[bc]/, '');
}

export function normalizedPieceKey(piece, row) {
  if (!piece) return null;
  const cleaned = piece.replace(/\s+/g, '');
  // already has color prefix
  if (/^[bc]/.test(cleaned)) return cleaned;
  const inferred = inferColorFromRow(row);
  if (inferred) return inferred + cleaned;
  // fallback: prefer 'b' if available, else 'c', else return cleaned
  if (pieceMap['b' + cleaned]) return 'b' + cleaned;
  if (pieceMap['c' + cleaned]) return 'c' + cleaned;
  return cleaned;
}

// --- nowe helpery / rozszerzenia ---

/**
 * Rozszyfrowuje pojedynczy wpis legalMoves na tablicę docelowych pól (np. "O-O" -> ["g1"] dla białych, ["g8"] dla czarnych).
 * Zwraca tablicę stringów z nazwami pól (może być pustą tablicą, jeśli nie da się nic wyciągnąć).
 *
 * selected: { r, c } - koordynaty aktualnie zaznaczonej figury (potrzebne do roszady)
 * selectedColor: 'b'|'c' - kolor zaznaczonej figury (potrzebny do roszady i en-passant heurystyki)
 * board: plansza (do weryfikacji en-passant - istnieje sąsiedni pion)
 */
export function parseMoveToDests(mv, selected, selectedColor, board) {
  if (!mv || typeof mv !== 'string') return [];

  // normalize
  const s = mv.trim();

  // handle castling: accept O-O, O-O-O, 0-0, 0-0-0 (case-insensitive)
  const low = s.toLowerCase();
  if (low === 'o-o' || low === '0-0') {
    // short castle -> king goes to g1/g8 depending on color and starting row
    if (!selected || typeof selectedColor === 'undefined' || selectedColor === null) {
      // if no selected info, return both possibilities (conservative)
      return ['g1', 'g8'];
    }
    // determine rank for king destination
    const kingRow = selectedColor === 'b' ? 7 : 0; // white 'b' -> row7 (rank1), black 'c' -> row0 (rank8)
    const destRank = ranks[kingRow]; // '1' or '8'
    return [`g${destRank}`];
  }
  if (low === 'o-o-o' || low === '0-0-0') {
    if (!selected || typeof selectedColor === 'undefined' || selectedColor === null) {
      return ['c1', 'c8'];
    }
    const kingRow = selectedColor === 'b' ? 7 : 0;
    const destRank = ranks[kingRow];
    return [`c${destRank}`];
  }

  // standard case: last two chars are destination square
  const possibleDest = s.slice(-2);
  if (/^[a-h][1-8]$/.test(possibleDest)) {
    return [possibleDest];
  }

  // fallback - nic nie rozpoznano
  return [];
}

export function extractPieceTypeFromSAN(mv) {
  if (!mv) return null;

  const s = mv.trim();

  const first = s[0];

  switch (first) {
    case "K": return "Krol";
    case "H": return "Hetman";
    case "W": return "Wieza";
    case "G": return "Goniec";
    case "S": return "Skoczek";
    default: return "Pionek";
  }
}


export function canPieceReach(board, sr, sc, r, c, pieceTypeRaw, myColor, mvRaw = null) {
  if (!inBounds(sr, sc) || !inBounds(r, c)) return false;
  if (sr === r && sc === c) return false;

  const type = canonicalPieceType(pieceTypeRaw);
  if (!type) return false;

  // Can't capture own piece
  const destVal = board[r] && board[r][c];
  if (destVal) {
    const destCol = colorOfPieceAt(destVal, r);
    if (destCol && myColor && destCol === myColor) return false;
  }

  const dr = r - sr;
  const dc = c - sc;
  const adr = Math.abs(dr);
  const adc = Math.abs(dc);

  // KNIGHT
  if (type === 'knight') {
    return (adr === 1 && adc === 2) || (adr === 2 && adc === 1);
  }

  // KING (rozszerzenie: akceptuj roszadę jeśli mvRaw wskazuje O-O / O-O-O)
  if (type === 'king') {
    // normalny krok
    if (Math.max(adr, adc) === 1) return true;

    if (mvRaw && typeof mvRaw === 'string') {
      const low = mvRaw.toLowerCase();
      // krótka roszada
      if (low === 'o-o' || low === '0-0') {
        // dla białych docelowe g1 -> row7 col6, dla czarnych g8 -> row0 col6
        const targetRow = myColor === 'b' ? 7 : 0;
        const targetCol = 6; // g
        return r === targetRow && c === targetCol;
      }
      // długa roszada
      if (low === 'o-o-o' || low === '0-0-0') {
        const targetRow = myColor === 'b' ? 7 : 0;
        const targetCol = 2; // c
        return r === targetRow && c === targetCol;
      }
    }

    return false;
  }

  // ROOK
  if (type === 'rook') {
    if (dr !== 0 && dc !== 0) return false;
    return isPathClear(board, sr, sc, r, c);
  }

  // BISHOP
  if (type === 'bishop') {
    if (adr !== adc) return false;
    return isPathClear(board, sr, sc, r, c);
  }

  // QUEEN
  if (type === 'queen') {
    if (adr === adc) return isPathClear(board, sr, sc, r, c);
    if (dr === 0 || dc === 0) return isPathClear(board, sr, sc, r, c);
    return false;
  }

  // PAWN - rozbudowane o en-passant
  if (type === 'pawn') {
    const dir = myColor === 'b' ? -1 : 1;
    const startRowForDouble = myColor === 'b' ? 6 : 1;

    // single forward
    if (dc === 0 && dr === dir) {
      return isEmpty(board, r, c);
    }

    // double forward
    if (dc === 0 && dr === 2 * dir && sr === startRowForDouble) {
      const midr = sr + dir;
      return isEmpty(board, midr, sc) && isEmpty(board, r, c);
    }

    // diagonal capture (normalne)
    if (Math.abs(dc) === 1 && dr === dir) {
      // normalne bicie
      if (isOpponentAt(board, r, c, myColor)) return true;

      // en-passant: docelowe pole jest puste, ale istnieje przeciwnik-pionek na (sr, dest_c)
      // (serwer powinien dać taki ruch tylko gdy en-passant możliwe)
      const capturedPawnRow = sr; // w en-passant bijemy pionka, który stoi na tej samej linii co nasz pion
      const capturedPawnCol = c;
      if (isEmpty(board, r, c) && (board[capturedPawnRow] && board[capturedPawnRow][capturedPawnCol])) {
        const capVal = board[capturedPawnRow][capturedPawnCol];
        const capCol = colorOfPieceAt(capVal, capturedPawnRow);
        // musi być pion przeciwnika
        if (capCol && capCol !== myColor) {
          // dodatkowo sprawdź czy to rzeczywiście pion (heurystyka)
          const capType = canonicalPieceType(pieceTypeFromCell(capVal, capturedPawnRow));
          if (capType === 'pawn') {
            // dopuszczamy en-passant
            return true;
          }
        }
      }

      return false;
    }

    return false;
  }

  return false;
}


