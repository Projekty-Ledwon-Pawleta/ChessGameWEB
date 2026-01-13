// src/components/ReplayBoard.jsx
import React, { useState, useEffect } from 'react';
import pieceMap from './pieceMap';
// Używamy stylów z istniejącego ChessBoard lub home.css
import '../styles/home.css'; 

// Helpery z ChessBoard
function prettySquareName(row, col) {
  const files = 'abcdefgh';
  const ranks = '87654321';
  return `${files[col]}${ranks[row]}`;
}


function getPieceImageKey(cellValue) {
    if (!cellValue) return null;
    
    let key = cellValue;
    
    return pieceMap[key] ? key : null;
}

export default function ReplayBoard({ gameData }) {
  
  const [currentStep, setCurrentStep] = useState(0);
  const [orientation, setOrientation] = useState('b');

  const boardStates = gameData?.boards || [];
  const moves = gameData?.moves || [];

  // Aktualna plansza do wyświetlenia
  const currentBoard = boardStates[currentStep] || Array(8).fill(Array(8).fill(null));

  // Obsługa klawiatury (strzałki)
  useEffect(() => {
    const handleKeyDown = (e) => {
        if (e.key === "ArrowRight") goForward();
        if (e.key === "ArrowLeft") goBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentStep, boardStates.length]);

  const goBack = () => {
      setCurrentStep(s => Math.max(0, s - 1));
  };

  const goForward = () => {
      setCurrentStep(s => Math.min(boardStates.length - 1, s + 1));
  };

  const goStart = () => setCurrentStep(0);
  const goEnd = () => setCurrentStep(boardStates.length - 1);

  // Renderowanie planszy
  const rows = orientation === 'b' ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
  const cols = orientation === 'b' ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];

  return (
    <div className="game-container" style={{ padding: 12, display: 'flex', gap: 20, justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      
      {/* LEWA STRONA: PLANSZA */}
      <div className="game-board-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* Info o graczach nad/pod planszą */}
        <div style={{width: '100%', display:'flex', justifyContent:'space-between', marginBottom: 10, fontWeight:'bold'}}>
            <span style={{color: '#333'}}>⚫ {gameData.black_username || "Czarne"}</span>
            <span style={{color: '#333'}}>⚪ {gameData.white_username || "Białe"}</span>
        </div>

        {/* Siatka Planszy */}
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(8,56px)', width: 'fit-content', border: '5px solid #4a3c31', position: 'relative' }}
        >
          {rows.map((r) => 
            cols.map((c) => {
              // Bezpieczne pobieranie komórki (zabezpieczenie przed undefined przy ładowaniu)
              const cell = currentBoard[r] ? currentBoard[r][c] : null;
              
              const isLight = (r + c) % 2 === 0;
              const bg = isLight ? '#f6f0d6' : '#2f7a46';
              
              // Sprawdzamy czy to ostatni ruch (opcjonalne podświetlenie)
              // To wymagałoby analizy różnic między board[i] a board[i-1], 
              // dla uproszczenia pomijamy lub robimy to prosto w przyszłości.

              const pieceKey = getPieceImageKey(cell);
              const imgSrc = pieceKey ? pieceMap[pieceKey] : null;

              return (
                <div
                  key={`${r}-${c}`}
                  title={prettySquareName(r, c)}
                  style={{
                    width: 56,
                    height: 56,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: bg,
                    position: 'relative'
                  }}
                >
                  {imgSrc && (
                    <img src={imgSrc} alt={cell} style={{ width: 48, height: 48, objectFit: 'contain', zIndex: 2 }} />
                  )}

                  {/* Koordynaty na brzegach */}
                  {c === (orientation==='b'?0:7) && <span style={{position:'absolute', top:2, left:2, fontSize:10, color: isLight?'#2f7a46':'#f6f0d6', pointerEvents:'none'}}>{8-r}</span>}
                  {r === (orientation==='b'?7:0) && <span style={{position:'absolute', bottom:0, right:2, fontSize:10, color: isLight?'#2f7a46':'#f6f0d6', pointerEvents:'none'}}>{'abcdefgh'[c]}</span>}
                </div>
              );
            })
          )}
        </div>

        {/* Pasek kontrolny pod planszą */}
        <div style={{ marginTop: 15, display: 'flex', gap: 10, alignItems: 'center', background: '#fff', padding: 10, borderRadius: 8, boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
            <button className="btn" onClick={goStart} disabled={currentStep === 0}>⏮</button>
            <button className="btn" onClick={goBack} disabled={currentStep === 0}>◀</button>
            
            <span style={{minWidth: 80, textAlign: 'center', fontWeight: 'bold'}}>
                {currentStep} / {boardStates.length - 1}
            </span>
            
            <button className="btn" onClick={goForward} disabled={currentStep >= boardStates.length - 1}>▶</button>
            <button className="btn" onClick={goEnd} disabled={currentStep >= boardStates.length - 1}>⏭</button>
            
            <button className="btn btn--muted" onClick={() => setOrientation(o => o === 'b' ? 'c' : 'b')} style={{marginLeft: 10}}>
                Odwróć
            </button>
        </div>

      </div>

      {/* PRAWA STRONA: Lista ruchów */}
      <div className="game-sidebar" style={{ width: 260, background: '#f8f9fa', padding: 15, borderRadius: 8, border: '1px solid #ddd', height: 480, display:'flex', flexDirection:'column' }}>
          <h3 style={{marginTop: 0, borderBottom: '1px solid #ccc', paddingBottom: 5}}>Historia partii</h3>
          
          <div style={{fontSize: '0.9rem', marginBottom: 10}}>
              Data: {gameData.date}<br/>
              Wynik: <strong>{gameData.result}</strong> ({gameData.reason})
          </div>

          <div className="history-list" style={{ flex: 1, overflowY: 'auto', background: '#fff', border: '1px solid #eee', padding: 5, fontFamily: 'monospace', fontSize: '0.9rem' }}>
              {moves.map((m, i) => {
                  // currentStep = 0 to stan początkowy. Ruch 1 prowadzi do stanu 1.
                  // Więc jeśli podświetlamy ruch, który doprowadził do stanu X:
                  const isActive = (i + 1) === currentStep;
                  
                  return (
                    <div 
                        key={i} 
                        onClick={() => setCurrentStep(i + 1)} // Kliknięcie skacze do stanu PO ruchu
                        style={{ 
                            padding: '4px 8px', 
                            cursor: 'pointer',
                            background: isActive ? '#fef3c7' : 'transparent',
                            borderLeft: isActive ? '3px solid #f59e0b' : '3px solid transparent',
                            display: 'flex'
                        }}
                    >
                        <span style={{color: '#888', width: 30}}>{Math.floor(i/2)+1}.</span> 
                        <span style={{fontWeight: isActive ? 'bold' : 'normal'}}>
                            {i % 2 === 0 ? "⚪ " : "⚫ "} {m}
                        </span>
                    </div>
                  );
              })}
              <div ref={el => { 
                    if(el && currentStep === moves.length) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) 
                    }
                }} />
          </div>
      </div>
    </div>
  );
}