// src/components/ChessBoard.jsx
import React, { useEffect, useState, useMemo, useRef } from 'react';
import pieceMap from './pieceMap';
import * as chessValidator from './validate_moves.js';
import wsClient from '../api/wsClient';
import { useNavigate } from "react-router-dom";

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


export default function ChessBoard({ 
    defaultRoom = 'testroom', 
    wsHost = undefined, 
    username = null,      
    initialPlayers = []   
  }) {
  const navigate = useNavigate();
  const [board, setBoard] = useState(emptyBoard()); // board pochodzi z serwera
  const [selected, setSelected] = useState(null); // {r,c}
  const [turn, setTurn] = useState(null); // opcjonalnie: 'b' lub 'c' — ustawiany z serwera
  const [connected, setConnected] = useState(false);

  // nowe: lista legalnych ruchów w notacji serwera (np. ["e5","Sa3","Ke2"...])
  const [legalMoves, setLegalMoves] = useState([]);

  const [players, setPlayers] = useState(initialPlayers);
  const [history, setHistory] = useState([]);
  const [orientation, setOrientation] = useState('b');

  const [promotionMove, setPromotionMove] = useState(null);
  // popup position {left, top, width, height} w px względnie względem całego dokumentu
  const [promotionPos, setPromotionPos] = useState(null);
  const [isCheck, setIsCheck] = useState(false);
  const [checkedKingPos, setCheckedKingPos] = useState(null);
  const [isCheckmate, setIsCheckmate] = useState(false); 
  const [isStalemate, setIsStalemate] = useState(false);

  const boardRef = useRef(null);

  const mySide = useMemo(() => {
    if (!username || players.length === 0) return null; // Spectator lub ładowanie
    // players[0] = Białe, players[1] = Czarne
    if (players[0] === username) return 'b';
    if (players[1] === username) return 'c';
    return null; // Spectator
  }, [username, players]);

  useEffect(() => {
    if (mySide === 'c') setOrientation('c');
    else setOrientation('b');
  }, [mySide]);

  const shouldConnect = useRef(true);

  useEffect(() => {
    try {
      wsClient.connect({ host: wsHost, room: defaultRoom });
    } catch (e) {
      console.warn('wsClient.connect error:', e);
    }

    const updateGameState = (s) => {
      if (!s) return;
      if (s.board) setBoard(s.board);
      if (s.turn) setTurn(s.turn);
      
      // Flagi stanu
      setIsCheck(Boolean(s.check));
      setIsCheckmate(Boolean(s.checkmate));
      setIsStalemate(Boolean(s.stalemate));
      
      // Legal moves
      const legals = s.legal_moves || [];
      setLegalMoves(legals);

      // History
      if (s.moves && Array.isArray(s.moves)) {
          setHistory(s.moves);
      }
    };

    const unsubOpen = wsClient.on('open', () => setConnected(true));
    const unsubClose = wsClient.on('close', () => setConnected(false));

    // 1. ODBIÓR STANU PRZY POŁĄCZENIU
    const unsubConnected = wsClient.on('connected', (msg) => {
      console.log("Connected msg:", msg);
      if (msg.state) {
          const s = msg.state.state || msg.state;
          updateGameState(s);
      }
      if (msg.players && Array.isArray(msg.players)) {
          setPlayers(msg.players);
      }
    });

    // 2. ODBIÓR RUCHU
    const unsubMove = wsClient.on('move', (msg) => {
      console.log("Move msg:", msg);
      
      const moveData = msg.move || {};
      const s = moveData.state || msg.state || {}; // fallback
      const stateObj = s.state || s; 
      
      // --- TU BYŁ BŁĄD: Brakowało wywołania updateGameState ---
      updateGameState(stateObj); 
      // --------------------------------------------------------

      // Czasami legal_moves są bezpośrednio w moveData, a nie w state
      if (moveData.legal_moves) setLegalMoves(moveData.legal_moves);
    });

    const unsubLegal = wsClient.on('legal_moves', (msg) => {
       // console.log("Legal moves msg", msg);
       const movesFromMsg = msg?.moves ?? msg?.legal_moves ?? msg?.state?.state?.legal_moves ?? [];
       if (Array.isArray(movesFromMsg)) setLegalMoves(movesFromMsg);
       
       const s = msg?.state?.state || msg?.state || {};
       if (s.check !== undefined) setIsCheck(Boolean(s.check));
       if (s.checkmate !== undefined) setIsCheckmate(Boolean(s.checkmate));
       if (s.stalemate !== undefined) setIsStalemate(Boolean(s.stalemate));
    });

    return () => {
      // Cleanup function
      shouldConnect.current = false; // Reset flagi (opcjonalnie, zależy od cyklu życia)
      unsubOpen(); 
      unsubClose(); 
      unsubConnected(); 
      unsubMove(); 
      unsubLegal();
      //try { wsClient.disconnect(); } catch (e) { /* ignore */ }
    };
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
    if (mySide && turn !== mySide) return;

    if (isCheckmate || isStalemate) return;

    const piece = board[r] && board[r][c];

    if (piece && !selected) {
        const pColor = chessValidator.colorOfPieceAt(piece, r);
        if (mySide && pColor !== mySide) return;
    }

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

  const rows = orientation === 'b' ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
  const cols = orientation === 'b' ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];

  // render planszy
return (
    <div className="game-container" style={{ padding: 12, display: 'flex', gap: 20, justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      
      {/* LEWA STRONA: PLANSZA */}
      <div className="game-board-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* Pasek narzędzi nad planszą */}
        <div style={{ marginBottom: 8, gap: 12, display: 'flex', alignItems: 'center' }}>
          {mySide && (
             <div style={{background: '#333', color: '#fff', padding: '4px 8px', borderRadius: 4, fontSize: '0.9rem'}}>
                Grasz jako: <strong>{mySide === 'b' ? 'Białe' : 'Czarne'}</strong>
             </div>
          )}
          <button onClick={() => setOrientation(o => o === 'b' ? 'c' : 'b')} style={{cursor: 'pointer'}}>
             Odwróć
          </button>
        </div>

        {/* Siatka Planszy */}
        <div
          ref={boardRef}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(8,56px)', width: 'fit-content', border: '5px solid #4a3c31', position: 'relative' }}
        >
          {rows.map((r) => 
            cols.map((c) => {
              // UWAGA: Pobieramy komórkę używając indeksów z mapowania (dla odwracania)
              const cell = board[r][c];
              
              const isLight = (r + c) % 2 === 0;
              const bg = isLight ? '#f6f0d6' : '#2f7a46';
              const selectedHere = selected && selected.r === r && selected.c === c;
              
              const piece = cell;
              const key = `${r}-${c}`;
              const pieceKey = piece ? chessValidator.normalizedPieceKey(piece, r) : null;
              const imgSrc = pieceKey ? pieceMap[pieceKey] : null;

              if (piece && !imgSrc) {
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
                  onClick={() => onSquareClick(r, c)} // onSquareClick używa logicznych r,c co jest OK
                  title={prettySquareName(r, c)}
                  style={{
                    width: 56,
                    height: 56,
                    boxSizing: 'border-box',
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: bg, // base background
                    border: selectedHere ? '3px solid gold' : isCheckedKingHere ? '3px solid #ff4d4f' : 'none',
                    cursor: 'pointer',
                    position: 'relative'
                  }}
                >
                  {/* Marker legalnego ruchu (kropka lub kółko) */}
                  {isLegalDest && !piece && <div style={{width: 16, height: 16, background: 'rgba(0,0,0,0.2)', borderRadius: '50%'}} />}
                  {isLegalDest && piece && <div style={{position: 'absolute', width: 56, height: 56, border: '4px solid rgba(0,0,0,0.2)', borderRadius: '50%'}} />}

                  {piece && imgSrc ? (
                    <img src={imgSrc} alt={piece} style={{ width: 48, height: 48, objectFit: 'contain', pointerEvents: 'none', zIndex: 2 }} />
                  ) : (
                    piece && <div style={{ fontWeight: 700 }}>{piece}</div>
                  )}

                  {/* Koordynaty na brzegach (opcjonalne) */}
                  {c === (orientation==='b'?0:7) && <span style={{position:'absolute', top:2, left:2, fontSize:10, color: isLight?'#2f7a46':'#f6f0d6', pointerEvents:'none'}}>{8-r}</span>}
                  {r === (orientation==='b'?7:0) && <span style={{position:'absolute', bottom:0, right:2, fontSize:10, color: isLight?'#2f7a46':'#f6f0d6', pointerEvents:'none'}}>{'abcdefgh'[c]}</span>}
                </div>
              );
            })
          )}
          {/* OVERLAY Z WYNIKIEM (NOWE) */}
          {(isCheckmate || isStalemate) && (
              <div style={{
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                  background: 'rgba(0,0,0,0.7)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', zIndex: 10
              }}>
                  <h2 style={{fontSize: '2rem', marginBottom: 10}}>KONIEC GRY</h2>
                  {isCheckmate && (
                      <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: '#ff4d4f'}}>
                          SZACH MAT!
                          <div style={{fontSize: '1rem', marginTop: 5, color: '#fff'}}>
                              Wygrały: {turn === 'b' ? 'Czarne' : 'Białe'} {/* Jeśli tura białych i jest mat, to znaczy że białe przegrały */}
                          </div>
                      </div>
                  )}
                  {isStalemate && (
                      <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: '#faad14'}}>
                          PAT (Remis)
                      </div>
                  )}
                  <button 
                      onClick={() => navigate(-1)} 
                      style={{
                          marginTop: 20, 
                          padding: '12px 24px', 
                          fontSize: '1.1rem', 
                          cursor: 'pointer', 
                          background: '#2f7a46', // Zielony kolor pasujący do planszy
                          color: '#fff',
                          border: 'none', 
                          borderRadius: 6,
                          fontWeight: 'bold'
                      }}
                  >
                      Powrót do lobby
                  </button>
              </div>
          )}
        </div>
      </div>

      {/* PRAWA STRONA: PANEL BOCZNY */}
      <div className="game-sidebar" style={{ width: 260, background: '#f8f9fa', padding: 15, borderRadius: 8, border: '1px solid #ddd', height: 'fit-content' }}>
          <h3 style={{marginTop: 0, borderBottom: '1px solid #ccc', paddingBottom: 5}}>Gracze</h3>
          
          <div style={{ padding: 5, fontWeight: turn === 'b' ? 'bold' : 'normal', color: turn === 'b' ? '#2e7d32' : '#000' }}>
            ⚪ {players[0] || "Oczekiwanie..."} (Białe)
          </div>
          <div style={{ padding: 5, fontWeight: turn === 'c' ? 'bold' : 'normal', color: turn === 'c' ? '#2e7d32' : '#000' }}>
            ⚫ {players[1] || "Oczekiwanie..."} (Czarne)
          </div>

          <div style={{ marginTop: 15 }}>
            <strong>Status: </strong> 
            {connected ? <span style={{color:'green'}}>Połączono</span> : <span style={{color:'red'}}>Rozłączono</span>}
            {isCheck && <div style={{color: 'crimson', fontWeight:'bold', marginTop: 4}}>SZACH!</div>}
          </div>

          <h4 style={{marginBottom: 5, marginTop: 15}}>Historia</h4>
          <div className="history-list" style={{ height: 200, overflowY: 'auto', background: '#fff', border: '1px solid #eee', padding: 5, fontFamily: 'monospace', fontSize: '0.9rem' }}>
              {history.length === 0 ? <div style={{color: '#999'}}>Brak ruchów</div> : null}
              {history.map((m, i) => (
                  <span key={i} style={{ display: 'inline-block', marginRight: 8 }}>
                      {i % 2 === 0 ? <span style={{color: '#888'}}>{(i/2)+1}.</span> : null} {m}
                  </span>
              ))}
              {/* Dummy element do autoscrollowania */}
              <div ref={el => el && el.scrollIntoView({ behavior: 'smooth' })} />
          </div>
      </div>

      {/* Promotion chooser popup */}
      {promotionMove && (
        <div
          id="promotion-popup"
          style={{
            position: 'fixed', // Używamy fixed center żeby uniknąć problemów z pozycjonowaniem
            top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 9999,
            padding: 10,
            background: '#fff',
            border: '2px solid #444',
            borderRadius: 8,
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            display: 'flex',
            gap: 10,
            alignItems: 'center'
          }}
        >
          <h4 style={{position:'absolute', top:-30, width:'100%', textAlign:'center', color:'#fff', textShadow:'0 1px 2px #000'}}>Wybierz figurę</h4>
          <button onClick={() => handlePromotionChoice('H')} style={{ padding: '6px', minWidth: 40, cursor: 'pointer' }}><img src={pieceMap.cHetman || pieceMap.bHetman} alt="H" style={{ width: 32, height: 32 }} /></button>
          <button onClick={() => handlePromotionChoice('S')} style={{ padding: '6px', minWidth: 40, cursor: 'pointer' }}><img src={pieceMap.cSkoczek || pieceMap.bSkoczek} alt="S" style={{ width: 32, height: 32 }} /></button>
          <button onClick={() => handlePromotionChoice('G')} style={{ padding: '6px', minWidth: 40, cursor: 'pointer' }}><img src={pieceMap.cGoniec || pieceMap.bGoniec} alt="G" style={{ width: 32, height: 32 }} /></button>
          <button onClick={() => handlePromotionChoice('W')} style={{ padding: '6px', minWidth: 40, cursor: 'pointer' }}><img src={pieceMap.cWieza || pieceMap.bWieza} alt="W" style={{ width: 32, height: 32 }} /></button>
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
