// src/components/ChessBoard.jsx
import React, { useEffect, useState, useMemo, useRef } from 'react';
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
  const pieceLetter = letterMap[canon] || String(rawType || '').slice(0, 1).toUpperCase();

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
  const [promotionMove, setPromotionMove] = useState(null);
  // popup position {left, top, width, height} w px względnie względem całego dokumentu
  const [promotionPos, setPromotionPos] = useState(null);
  const [isCheck, setIsCheck] = useState(false);
  const [checkedKingPos, setCheckedKingPos] = useState(null);
  const boardRef = useRef(null);

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

      const checkFlag = msg?.state?.state?.check ?? msg?.state?.check ?? false;
      setIsCheck(Boolean(checkFlag));
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

      const checkFlag =
        msg?.move?.state?.check ??
        msg?.move?.check ??
        msg?.state?.state?.check ??
        msg?.state?.check ??
        false;
      setIsCheck(Boolean(checkFlag));
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

      const checkFlag = msg?.state?.state?.check ?? msg?.state?.check ?? msg?.check ?? false;
      setIsCheck(Boolean(checkFlag));
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

      const movePieceType = chessValidator.extractPieceTypeFromSAN(mv);
      if (movePieceType !== pt) continue;

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

  useEffect(() => {
    if (!isCheck) {
      setCheckedKingPos(null);
      return;
    }


    // jeżeli mamy turę, zakładamy że "check: true" oznacza, że strona na ruchu jest w szachu — oznacz króla tej strony
    const targetColor = turn || null; // 'b' albo 'c' oczekiwane


    // pomocnicza funkcja do znalezienia króla danego koloru
    function findKingForColor(boardState, color) {
      for (let rr = 0; rr < 8; rr++) {
        for (let cc = 0; cc < 8; cc++) {
          const val = boardState[rr] && boardState[rr][cc];
          if (!val) continue;
          const canon = chessValidator.canonicalPieceType(chessValidator.pieceTypeFromCell(val, rr));
          const col = chessValidator.colorOfPieceAt(val, rr);
          if (canon === 'king' && col && color && col === color) {
            return { r: rr, c: cc };
          }
        }
      }
      return null;
    }


    let kp = null;
    if (targetColor) {
      kp = findKingForColor(board, targetColor);
    }


    // jeśli nie mamy turnu albo nie znaleziono króla w obrębie tej logiki — spróbuj znaleźć dowolnego króla, którego można oznaczyć
    if (!kp) {
      for (let rr = 0; rr < 8 && !kp; rr++) {
        for (let cc = 0; cc < 8; cc++) {
          const val = board[rr] && board[rr][cc];
          if (!val) continue;
          const canon = chessValidator.canonicalPieceType(chessValidator.pieceTypeFromCell(val, rr));
          if (canon === 'king') {
            kp = { r: rr, c: cc };
            break;
          }
        }
      }
    }


    setCheckedKingPos(kp);
  }, [board, isCheck, turn]);

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
        const legalArray = [...legalSet]; // zamieniamy Set na tablicę

       const allowed = variants.some(v =>
        legalArray.some(legal => isSubsequence(v, legal))
      );

        if (!allowed) {
          console.warn('Attempted illegal move (blocked on client):', san, 'coords:', moveStrCoords, 'legal moves:', legalMoves);
          setSelected(null);
          return;
        }

        if (isPromotionMove(selectedPiece, sr, sc, r, c)) {
          // znajdź element docelowego pola żeby ustawić popup nad nim
          const boardEl = boardRef.current;
          if (boardEl) {
            // pola są renderowane w stałej siatce: grid dzieci boardEl.children
            // znajdujemy dzieci boardEl i odpowiednie child index = r*8 + c
            const idx = r * 8 + c;
            const child = boardEl.children[idx];
            openPromotionChooser({ r: sr, c: sc }, { r, c }, child, selectedPiece);
          } else {
            // fallback: jeśli nie możemy policzyć pozycji, po prostu ustaw promotionMove bez pozycji
            setPromotionMove({ from: { r: sr, c: sc }, to: { r, c }, piece: selectedPiece });
          }
          // nie resetujemy selekcji tu — popup obsłuży reset
          return;
        }

        // zwykły ruch: wysyłamy promo: ''
        sendMoveWithPromo({ r: sr, c: sc }, { r, c }, '');

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

  function isSubsequence(sub, str) {
    let i = 0;
    for (let char of str) {
      if (char === sub[i]) {
        i++;
        if (i === sub.length) return true;
      }
    }
    return false;
  }

  function handlePromotionChoice(choice) {
    if (!promotionMove) return;
    const { from, to } = promotionMove;
    sendMoveWithPromo(from, to, choice);
    closePromotionChooser();
    setSelected(null);
  }

  // kliknięcie poza popup -> anuluj
  useEffect(() => {
    function onDocClick(e) {
      if (!promotionMove) return;
      const popup = document.getElementById('promotion-popup');
      if (!popup) return;
      if (!popup.contains(e.target)) {
        // kliknięto poza popup -> anuluj
        closePromotionChooser();
      }
    }
    if (promotionMove) {
      document.addEventListener('mousedown', onDocClick);
      const onKey = (ev) => { if (ev.key === 'Escape') closePromotionChooser(); };
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onDocClick);
        document.removeEventListener('keydown', onKey);
      };
    }
  }, [promotionMove]);

  // render planszy
  return (
    <div style={{ padding: 12, display: 'flex', justifyContent: 'center', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      <div style={{ marginBottom: 8, gap: 12 }}>
        {turn ? <div>Aktualna tura: <strong style={{ marginLeft: 6 }}>{turn === 'b' ? 'Białe' : 'Czarne'}</strong></div> : null}
      </div>

        <div
          ref={boardRef}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(8,56px)', width: 'fit-content', border: '2px solid #444' }}
        >
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
                // eslint-disable-next-line no-console
                console.warn('Missing piece image for key:', pieceKey, 'piece value:', piece);
              }

              const isLegalDest = (() => {
                if (!selected) return false;
                const dest = prettySquareName(r, c);
                return legalDestinationsForSelected.has(dest);
              })();

              const isCheckedKingHere = checkedKingPos && checkedKingPos.r === r && checkedKingPos.c === c && isCheck;

              return (
                <div
                  key={key}
                  onClick={() => {
                    const destPiece = piece;
                    const destColor = chessValidator.colorOfPieceAt(destPiece, r);

                    const normTurn = turn === 'b' ? 'b' : turn === 'w' ? 'c' : turn;

                    const sel = selected;
                    const selPiece = sel ? (board?.[sel.r] && board[sel.r][sel.c]) : null;
                    const selColor = selPiece ? chessValidator.colorOfPieceAt(selPiece, sel.r) : null;

                    if (sel && sel.r === r && sel.c === c) {
                      onSquareClick(r, c);
                      return;
                    }

                    if (!sel) {
                      if (!destPiece || destColor === normTurn) {
                        onSquareClick(r, c);
                      }
                      return;
                    }

                    if (destPiece && destColor === normTurn) {
                      onSquareClick(r, c);
                      return;
                    }

                    if (!destPiece) {
                      onSquareClick(r, c);
                      return;
                    }

                    if (selColor === normTurn) {
                      onSquareClick(r, c);
                      return;
                    }
                  }}
                  title={prettySquareName(r, c)}
                  style={{
                    width: 56,
                    height: 56,
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isLegalDest ? '#facc15' : bg,
                    border: selectedHere ? '3px solid gold' : isCheckedKingHere ? '3px solid #ff4d4f' : '1px solid #999',
                    cursor: piece ? 'pointer' : 'pointer',
                  }}
                >
                  {piece ? (
                    imgSrc ? (
                      <img src={imgSrc} alt={piece} style={{ width: 40, height: 40, objectFit: 'contain', pointerEvents: 'none' }} />
                    ) : (
                      <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#222', fontWeight: 700 }}>{piece[0] || '?'}</div>
                    )
                  ) : null}
                </div>
              );
            })
          )}
        </div>

      {/* Promotion chooser popup */}
      {promotionMove && (
        <div
          id="promotion-popup"
          style={{
            position: 'absolute',
            // jeśli mamy wyliczoną pozycję pola — wycentruj popup nad polem; inaczej centrum planszy
            left: promotionPos ? promotionPos.left + (promotionPos.width / 2) - 90 : '50%',
            top: promotionPos ? promotionPos.top + (promotionPos.height / 2) - 28 : '50%',
            transform: promotionPos ? 'none' : 'translate(-50%,-50%)',
            zIndex: 9999,
            padding: 6,
            background: '#fff',
            border: '1px solid #444',
            borderRadius: 8,
            boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
            display: 'flex',
            gap: 6,
            alignItems: 'center'
          }}
        >
          <button onClick={() => handlePromotionChoice('H')} style={{ padding: '6px 8px', minWidth: 36, borderRadius: 6, cursor: 'pointer' }}><img src={pieceMap.cHetman} alt="Hetman" style={{ width: 32, height: 32 }} /></button>
          <button onClick={() => handlePromotionChoice('S')} style={{ padding: '6px 8px', minWidth: 36, borderRadius: 6, cursor: 'pointer' }}><img src={pieceMap.cSkoczek} alt="Hetman" style={{ width: 32, height: 32 }} /></button>
          <button onClick={() => handlePromotionChoice('G')} style={{ padding: '6px 8px', minWidth: 36, borderRadius: 6, cursor: 'pointer' }}><img src={pieceMap.cGoniec} alt="Hetman" style={{ width: 32, height: 32 }} /></button>
          <button onClick={() => handlePromotionChoice('W')} style={{ padding: '6px 8px', minWidth: 36, borderRadius: 6, cursor: 'pointer' }}><img src={pieceMap.cWieza} alt="Hetman" style={{ width: 32, height: 32 }} /></button>
        </div>
      )}
    </div>
  );

  function openPromotionChooser(from, to, targetSquareElement, selectedPiece) {
    // compute absolute position of targetSquareElement (relative to document)
    if (targetSquareElement && boardRef.current) {
      const rect = targetSquareElement.getBoundingClientRect();
      setPromotionPos({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    } else {
      setPromotionPos(null);
    }
    setPromotionMove({ from, to, piece: selectedPiece });
  }

  function isPromotionMove(selectedPiece, sr, sc, r, c) {
    if (!selectedPiece) return false;
    const canon = chessValidator.canonicalPieceType(chessValidator.pieceTypeFromCell(selectedPiece, sr));
    if (canon !== 'pawn') return false;
    const color = chessValidator.colorOfPieceAt(selectedPiece, sr); // 'b' | 'c'
    // white ('b') promotes on row 0; black ('c') promotes on row 7
    if (color === 'b' && r === 0) return true;
    if (color === 'c' && r === 7) return true;
    return false;
  }

  function closePromotionChooser() {
    setPromotionMove(null);
    setPromotionPos(null);
  }

  function sendMoveWithPromo(from, to, promo) {
    wsClient.send({
      type: 'move',
      move: {
        from,
        to,
        promo: promo || ''
      }
    });
  }
}
