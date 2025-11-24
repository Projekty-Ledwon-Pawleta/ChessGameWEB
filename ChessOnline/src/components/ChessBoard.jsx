// src/components/ChessBoard.jsx
import React, { useEffect, useState, useMemo } from 'react';
import pieceMap from './pieceMap';
import * as chessValidator from './validate_moves.js';
import wsClient from '../api/wsClient';

// helpery
function emptyBoard() {
  return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
}

function prettySquareName(row, col) {
  const files = 'abcdefgh';
  const ranks = '87654321';
  return `${files[col]}${ranks[row]}`;
}

function sanForMove(cellValue, sr, sc, r, c, board) {
  const dest = prettySquareName(r, c);
  if (!cellValue) return dest;

  
  // Bezpiecznie określ typ kanoniczny ('pawn','knight','bishop','rook','queen','king')
  const rawType = chessValidator.pieceTypeFromCell(cellValue, sr);
  const canon = chessValidator.canonicalPieceType(rawType);

  if (canon === 'king' && sr === r) {
    const dc = c - sc;
    if (dc === 2) {
      return '0-0'; // roszada krótka
    }
    if (dc === -2) {
      return '0-0-0'; // roszada długa
    }
  }

  const fromFile = 'abcdefgh'[sc];

  // detect whether destination occupied (normal capture)
  const destVal = board[r] && board[r][c];
  const destOccupied = Boolean(destVal);

  // EN PASSANT detection (ruch diagonalny pionem na puste pole, a na sr,c jest pion przeciwnika)
  const dr = r - sr;
  const dc = c - sc;
  let isEnPassant = false;
  if (canon === 'pawn' && Math.abs(dc) === 1 && Math.abs(dr) === 1 && !destOccupied) {
    const capturedPawnRow = sr; // pion przeciwnika stoi w sr, c (przed ruchem)
    const capturedPawnCol = c;
    const capVal = board[capturedPawnRow] && board[capturedPawnRow][capturedPawnCol];
    if (capVal) {
      const capType = chessValidator.canonicalPieceType(
        chessValidator.pieceTypeFromCell(capVal, capturedPawnRow) || capVal
      );
      if (capType === 'pawn') isEnPassant = true;
    }
  }

  // mapa canonical -> polska litera notacji (puste dla pionka)
  const letterMap = {
    knight: 'S',
    bishop: 'G',
    rook: 'R', // zmień na 'W' jeśli serwer tak używa
    queen: 'H',
    king: 'K'
  };

  if (canon === 'pawn') {
    // capture (standard capture or en-passant) -> e.g. 'exd5'
    if (destOccupied || isEnPassant) {
      return `${fromFile}x${dest}`;
    }
    // zwykły ruch -> 'e4'
    return dest;
  }

  // dla figur: pobierz literę
  const pieceLetter = letterMap[canon] || String(rawType || '').slice(0,1).toUpperCase();

  if (!pieceLetter) {
    // fallback -> zwracamy dest (bezpieczne)
    return dest;
  }

  // figura bicie vs ruch normalny
  if (destOccupied) {
    return `${pieceLetter}x${dest}`;
  }
  return `${pieceLetter}${dest}`;
}


export default function ChessBoard({ defaultRoom = 'testroom', wsHost = undefined }) {
  const [board, setBoard] = useState(emptyBoard()); // board pochodzi z serwera
  const [selected, setSelected] = useState(null); // {r,c}
  const [turn, setTurn] = useState(null); // opcjonalnie: 'b' lub 'c' — ustawiany z serwera
  const [connected, setConnected] = useState(false);

  // nowe: lista legalnych ruchów w notacji serwera (np. ["e5","Sa3","Ke2"...])
  const [legalMoves, setLegalMoves] = useState([]);

  useEffect(() => {
    // Podłącz się automatycznie do serwera przy mount
    try {
      wsClient.connect({ host: wsHost, room: defaultRoom });
    } catch (e) {
      // connect może rzucić jeśli np. room === null — ignorujemy, użytkownik może podłączyć z innego miejsca
      console.warn('wsClient.connect error:', e);
    }

    // Subskrypcje wiadomości od serwera — serwer powinien wysyłać 'connected', 'sync' albo 'move' z polem state.board
    const unsubOpen = wsClient.on('open', () => setConnected(true));
    const unsubClose = wsClient.on('close', () => setConnected(false));

    const unsubConnected = wsClient.on('connected', (msg) => {
      console.log("msg", msg)

      if (msg && msg.state && msg.state.state && msg.state.state.board) {
        setBoard(msg.state.state.board);
        if (msg.state.state.turn) setTurn(msg.state.state.turn);
      }

      const legalFromMsg = msg?.state?.state?.legal_moves ?? msg?.state?.legal_moves ?? [];
      if (Array.isArray(legalFromMsg)) setLegalMoves(legalFromMsg);
      else setLegalMoves([]);
    });

    const unsubMove = wsClient.on('move', (msg) => {
      console.log("msg", msg)

      if (msg && msg.move && msg.move.state && msg.move.state.board) {
        setBoard(msg.move.state.board);
        if (msg.move.state.turn) setTurn(msg.move.state.turn);
      } else if (msg && msg.state && msg.state.state && msg.state.state.board) {
        setBoard(msg.state.state.board);
        if (msg.state.state.turn) setTurn(msg.state.state.turn);
      }

      const legalFromMsg =
        msg?.move?.state?.legal_moves ??
        msg?.move?.legal_moves ??
        msg?.state?.state?.legal_moves ??
        msg?.state?.legal_moves ??
        [];
      if (Array.isArray(legalFromMsg)) setLegalMoves(legalFromMsg);
      else setLegalMoves([]);
    });

    // NOWE: obsługa odpowiedzi z serwera z listą legalnych ruchów
    const unsubLegal = wsClient.on('legal_moves', (msg) => {
      console.log("msg", msg)

      // obsłuż różne kształty: {moves: [...]}, {state: {state: {legal_moves: [...]}}}, {legal_moves: [...]}
      const movesFromMsg =
        msg?.moves ?? 
        msg?.legal_moves ??
        msg?.state?.state?.legal_moves ??
        msg?.state?.legal_moves ??
        [];
      if (Array.isArray(movesFromMsg)) setLegalMoves(movesFromMsg);
      else setLegalMoves([]);
    });

    // cleanup
    return () => {
      unsubOpen(); unsubClose(); unsubConnected(); unsubMove(); unsubLegal();
      // opcjonalnie rozłączamy się — jeżeli inna część aplikacji korzysta z wsClient i chce kontrolować połączenie, usuń disconnect
      try { wsClient.disconnect(); } catch (e) { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // obliczamy mapę legalnych destynacji dla aktualnie zaznaczonego pola
  const legalDestinationsForSelected = useMemo(() => {
  if (!selected) return new Set();
  const { r: sr, c: sc } = selected;
  const cell = board[sr] && board[sr][sc];
  if (!cell) return new Set();

  // jeśli mamy turę i wybrana figura nie należy do gracza na turze -> pusta
  const selectedColor = chessValidator.colorOfPieceAt(cell, sr);
  if (turn && selectedColor && selectedColor !== turn) return new Set();

  const destinations = new Set();
  const pt = chessValidator.pieceTypeFromCell(cell, sr);

  for (const mv of legalMoves) {
    if (!mv || typeof mv !== 'string') continue;

    // get destination(s) for this move (handles O-O, O-O-O etc)
    const mvDests = chessValidator.parseMoveToDests(mv, selected, selectedColor, board);
    if (!mvDests || mvDests.length === 0) continue;

    for (const dest of mvDests) {
      const rc = chessValidator.squareNameToRC(dest);
      if (!rc) continue;
      // pass mv as mvRaw so canPieceReach can detect castling/en-passant
      if (chessValidator.canPieceReach(board, sr, sc, rc.r, rc.c, pt, selectedColor, mv)) {
        destinations.add(dest);
      }
    }
  }

  return destinations;
}, [selected, legalMoves, board, turn]);


  function onSquareClick(r, c) {
    const piece = board[r] && board[r][c];

    // jeśli mamy już zaznaczenie
    if (selected) {
      const { r: sr, c: sc } = selected;
      // kliknięcie tego samego pola -> odznacz
      if (sr === r && sc === c) {
        setSelected(null);
        return;
      }

      const selectedPiece = board[sr] && board[sr][sc];

      // jeśli kliknięto inną figurę tego samego koloru -> zmień zaznaczenie
      if (piece && selectedPiece) {
        const clickedColor = chessValidator.colorOfPieceAt(piece, r);
        const selectedColor = chessValidator.colorOfPieceAt(selectedPiece, sr);
        if (clickedColor && selectedColor && clickedColor === selectedColor) {
          setSelected({ r, c });
          return;
        }
      }

      // jeżeli istnieje wybrana figura -> spróbuj wysłać ruch (nie aktualizujemy lokalnie planszy)
      if (selectedPiece) {
        // opcjonalnie: sprawdź czy to ruch gracza będącego na turze
        const selectedColor = chessValidator.colorOfPieceAt(selectedPiece, sr);
        if (turn && selectedColor && selectedColor !== turn) {
          // nie jest tura tej figury — ignoruj
          setSelected(null);
          return;
        }

        const moveStrCoords = `${prettySquareName(sr, sc)}${prettySquareName(r, c)}`; // e2e4

        const san = sanForMove(selectedPiece, sr, sc, r, c, board); // np. "e4" albo "Se2"
        const sanLower = (san || '').toLowerCase();

        // build a set of legal moves lowercased for fast lookup
        const legalSet = new Set((legalMoves || []).map(m => String(m).toLowerCase()));

        // generate accepted variants for this attempted move (tolerant matching)
        // dla pionka: zaakceptuj "e4" oraz warianty z 'x' jeśli bite
        const variants = [sanLower];

        // if pawn and our san didn't include x but server could use exd5 style (capture)
        const canon = chessValidator.canonicalPieceType(chessValidator.pieceTypeFromCell(selectedPiece, sr));
        if (canon === 'pawn') {
          // if our san is plain dest (e4) also accept possible capture-styles like 'exd5'
          const fromFile = 'abcdefgh'[sc];
          const captureVariant = `${fromFile}x${sanLower}`; // 'exd5' - lowercase ok
          variants.push(captureVariant);
        } else {
          // for piece, also accept explicit capture form if not already with 'x'
          if (!sanLower.includes('x')) variants.push(sanLower[0] + 'x' + sanLower.slice(1));
        }

        // finally check if any variant is in legalSet
        const allowed = variants.some(v => legalSet.has(v));

        if (!allowed) {
          console.warn('Attempted illegal move (blocked on client):', san, 'coords:', moveStrCoords, 'legal moves:', legalMoves);
          setSelected(null);
          return;
        }

        // === TUTAJ ZMIANA: wysyłamy JSON z indeksami a nie SAN ===
        // format: { type: 'move', move: { from: { r, c }, to: { r, c }, promo: 'H' } }
        // promo ustawione domyślnie na 'H' (hetman). Zmienisz to później gdy obsłużysz wybór promocji.
        wsClient.send({
          type: 'move',
          move: {
            from: { r: sr, c: sc },
            to:   { r: r,  c: c },
            promo: 'H'
          }
        });

        // resetujemy zaznaczenie i czekamy na update z serwera
        setSelected(null);
      } else {
        setSelected(null);
      }
      return;
    }

    // brak zaznaczenia: zaznacz tylko jeśli na polu jest figura i (opcjonalnie) należy do aktualnej tury
    if (piece) {
      if (turn) {
        const clickedColor = chessValidator.colorOfPieceAt(piece, r);
        if (clickedColor === turn) setSelected({ r, c });
        // jeśli nie twoja tura, nie zaznaczaj
      } else {
        // jeśli nie znamy tury z serwera, pozwalamy na zaznaczenie
        setSelected({ r, c });
      }
    }
  }

  // render planszy
  return (
    <div style={{ padding: 12 }}>
      <div style={{ marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>ChessBoard (serwer-driven)</div>
        <div style={{ padding: '4px 8px', borderRadius: 6, background: connected ? '#d1fae5' : '#fee2e2', color: connected ? '#064e3b' : '#991b1b' }}>
          {connected ? 'connected' : 'disconnected'}
        </div>
        {turn ? <div>Aktualna tura: <strong style={{ marginLeft: 6 }}>{turn === 'b' ? 'Białe' : 'Czarne'}</strong></div> : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,56px)', border: '2px solid #444' }}>
        {board.map((rowArr, r) =>
          rowArr.map((cell, c) => {
            const isLight = (r + c) % 2 === 0;
            const bg = isLight ? '#f6f0d6' : '#2f7a46';
            const selectedHere = selected && selected.r === r && selected.c === c;
            const piece = cell;
            const key = `${r}-${c}`;
            const pieceKey = piece ? chessValidator.normalizedPieceKey(piece, r) : null;
            const imgSrc = pieceKey ? pieceMap[pieceKey] : null;
            if (piece && !imgSrc) {
              // helpful debug output when an expected image is missing
              // (keeps behavior non-breaking in production)
              // eslint-disable-next-line no-console
              console.warn('Missing piece image for key:', pieceKey, 'piece value:', piece);
            }

            // NOWE: podświetl destynacje legalne (gdy figura jest zaznaczona)
            const isLegalDest = (() => {
              if (!selected) return false;
              const dest = prettySquareName(r, c);
              return legalDestinationsForSelected.has(dest);
            })();

            return (
              <div
                key={key}
                onClick={() => {
                  const destPiece = piece; // figura na polu docelowym (może być null)
                  const destColor = chessValidator.colorOfPieceAt(destPiece, r); // 'b' | 'c' | null

                  // Znormalizuj turn do tej samej konwencji co colorOfPieceAt:
                  // Twoja konwencja frontu była: turn === 'b' -> tura białego, turn === 'w' -> tura czarnego
                  // colorOfPieceAt zwraca 'b' (biały) i 'c' (czarny)
                  const normTurn = turn === 'b' ? 'b' : turn === 'w' ? 'c' : turn;

                  // aktualnie zaznaczone pole (jeśli istnieje)
                  const sel = selected;
                  const selPiece = sel ? (board?.[sel.r] && board[sel.r][sel.c]) : null;
                  const selColor = selPiece ? chessValidator.colorOfPieceAt(selPiece, sel.r) : null;

                  // jeśli kliknięto to samo pole co było zaznaczone -> odznacz
                  if (sel && sel.r === r && sel.c === c) {
                    // jeśli chcesz, żeby drugi klik odznaczał:
                    onSquareClick(r, c); // zakładam, że onSquareClick obsługuje toggle selection
                    return;
                  }

                  // jeśli nie ma zaznaczenia:
                  if (!sel) {
                    // - pusty kwadrat: pozwól (może to być używane do de/select w twojej logice)
                    // - własna figura: pozwól wybrać
                    // - figura przeciwnika: nie pozwalaj (nie wybieramy figur przeciwnika)
                    if (!destPiece || destColor === normTurn) {
                      onSquareClick(r, c);
                    }
                    return;
                  }

                  // jeśli mamy zaznaczoną figurę:
                  // - jeśli kliknięto własną figurę -> zmiana wyboru
                  if (destPiece && destColor === normTurn) {
                    onSquareClick(r, c);
                    return;
                  }

                  // - jeśli kliknięto pole puste -> wykonaj ruch na puste pole
                  if (!destPiece) {
                    onSquareClick(r, c);
                    return;
                  }

                  // - jeśli kliknięto figurę przeciwnika -> dozwolone tylko jeżeli zaznaczona figura należy do gracza
                  //   czyli selected piece color musi być równy normTurn
                  if (selColor === normTurn) {
                    // to jest przechwycenie (capture) — wyślij ruch
                    onSquareClick(r, c);
                    return;
                  }

                  // inaczej (np. zazniona figura nie należy do gracza) -> ignoruj klik
                  // (opcjonalnie można dodać feedback/tooltip)
                }}
                title={prettySquareName(r, c)}
                style={{
                  width: 56,
                  height: 56,
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isLegalDest ? '#facc15' : bg, // żółte podświetlenie legalnego pola
                  border: selectedHere ? '3px solid gold' : '1px solid #999',
                  cursor: piece ? 'pointer' : 'pointer',
                }}
              >
                {piece ? (
                  imgSrc ? (
                    <img src={imgSrc} alt={piece} style={{ width: 40, height: 40, objectFit: 'contain', pointerEvents: 'none' }} />
                  ) : (
                    // fallback visible marker when image not available
                    <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#222', fontWeight: 700 }}>{piece[0] || '?'}</div>
                  )
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
