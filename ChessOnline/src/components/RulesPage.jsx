// src/pages/RulesPage.jsx
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import pieceMap from '../components/pieceMap'; // Upewnij się, że ścieżka jest poprawna
import '../styles/home.css';
import '../styles/rules.css';

export default function RulesPage() {
    const navigate = useNavigate();

    // Definicje figur do wyświetlenia
    const pieces = [
        {
            name: "Król (King)",
            img: pieceMap.bKrol, // Używamy białych figur jako przykładu
            desc: "Najważniejsza figura. Może poruszać się o jedno pole w dowolnym kierunku (poziomo, pionowo i na ukos). Nie może wejść na pole atakowane przez przeciwnika."
        },
        {
            name: "Hetman (Queen)",
            img: pieceMap.bHetman,
            desc: "Najsilniejsza figura. Łączy ruchy wieży i gońca. Może poruszać się o dowolną liczbę pól w pionie, poziomie i na ukos."
        },
        {
            name: "Wieża (Rook)",
            img: pieceMap.bWieza,
            desc: "Porusza się o dowolną liczbę pól w pionie lub w poziomie. Wieża bierze również udział w specjalnym ruchu zwanym roszadą."
        },
        {
            name: "Goniec (Bishop)",
            img: pieceMap.bGoniec,
            desc: "Porusza się o dowolną liczbę pól, ale tylko na ukos. Każdy gracz ma jednego gońca białopolowego i jednego czarnopolowego."
        },
        {
            name: "Skoczek (Knight)",
            img: pieceMap.bSkoczek,
            desc: "Porusza się w kształcie litery 'L' (dwa pola w jedną stronę, potem jedno w bok). Jest jedyną figurą, która może przeskakiwać nad innymi bierkami."
        },
        {
            name: "Pionek (Pawn)",
            img: pieceMap.bPionek,
            desc: "Porusza się o jedno pole do przodu (z pozycji startowej o dwa). Bije tylko na ukos o jedno pole. Jeśli dojdzie do końca planszy, ulega promocji."
        }
    ];

    return (
        <div className="site">
            <header className="site__header">
                <div className="container header__inner">
                    <div className="brand" style={{cursor: 'pointer'}} onClick={() => navigate('/')}>
                        <div className="brand__logo">CO</div>
                        <div className="brand__title">Chess Online</div>
                    </div>
                    <nav className="nav">
                        <Link className="nav__link" to="/">Strona główna</Link>
                    </nav>
                </div>
            </header>

            <main className="container site__main">
                <div className="rules-layout">
                    <h1 className="section__title" style={{textAlign: 'center', marginBottom: 30}}>Zasady gry w szachy</h1>

                    {/* Cel gry */}
                    <section className="rules-section">
                        <h2>Cel gry</h2>
                        <p className="rules-text">
                            Celem gry jest zamatowanie króla przeciwnika. <strong>Szach-mat</strong> (lub po prostu mat) występuje wtedy, gdy król jest atakowany (jest w szachu) i nie ma żadnego legalnego sposobu na ucieczkę przed atakiem.
                        </p>
                        <p className="rules-text">
                            Gra może zakończyć się również <strong>remisem</strong> (pat, wieczny szach, brak materiału do mata, zgoda obu graczy).
                        </p>
                    </section>

                    {/* Ruchy figur */}
                    <section className="rules-section">
                        <h2>Poruszanie się figurami</h2>
                        <div className="pieces-grid">
                            {pieces.map((p, idx) => (
                                <div key={idx} className="piece-card">
                                    <div className="piece-icon">
                                        <img src={p.img} alt={p.name} />
                                    </div>
                                    <div className="piece-desc">
                                        <h4>{p.name}</h4>
                                        <p>{p.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Ruchy specjalne */}
                    <section className="rules-section">
                        <h2>Ruchy specjalne</h2>
                        
                        <div className="special-move">
                            <h4>Roszada (Castling)</h4>
                            <p className="rules-text">
                                Jedyny ruch, w którym bierze udział król i wieża jednocześnie. Król przesuwa się o dwa pola w stronę wieży, a wieża przeskakuje przez niego.
                                <br/>
                                <em>Warunki:</em> Król i wieża nie mogły się wcześniej ruszyć, pola między nimi muszą być puste, a król nie może być szachowany ani przeskakiwać przez szachowane pole.
                            </p>
                        </div>

                        <div className="special-move">
                            <h4>Bicie w przelocie (En Passant)</h4>
                            <p className="rules-text">
                                Jeśli pionek przeciwnika ruszy się o dwa pola i wyląduje tuż obok Twojego pionka, możesz go zbić tak, jakby ruszył się tylko o jedno pole. Masz na to szansę tylko w ruchu bezpośrednio po przesunięciu rywala.
                            </p>
                        </div>

                        <div className="special-move">
                            <h4>Promocja (Promotion)</h4>
                            <p className="rules-text">
                                Gdy pionek dotrze do ostatniej linii po stronie przeciwnika (8. linia dla białych, 1. dla czarnych), musi zostać zamieniony na inną figurę (zazwyczaj Hetmana, ale też Wieżę, Gońca lub Skoczka).
                            </p>
                        </div>
                    </section>
                </div>
            </main>

            <footer className="site__footer">
                © {new Date().getFullYear()} Chess Online
            </footer>
        </div>
    );
}