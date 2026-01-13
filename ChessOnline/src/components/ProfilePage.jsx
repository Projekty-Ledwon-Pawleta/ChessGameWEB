import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/home.css';
import '../styles/profile.css';
import wsClient from '../api/wsClient';

export default function ProfilePage() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Mock danych statystycznych (do zastąpienia danymi z API w przyszłości)
    const [stats, setStats] = useState({
        elo: 1200,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0
    });

    // Mock historii (do zastąpienia API)
    const [history, setHistory] = useState([]);

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (!token) {
            navigate('/login');
            return;
        }

        async function fetchData() {
            try {
                // 1. Pobierz Usera
                const res = await fetch("http://localhost:8000/auth/user/", {
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                });

                if (!res.ok) throw new Error("Auth failed");
                const userData = await res.json();
                setUser(userData);

                // Tu w przyszłości: const statsRes = await fetch(...)
                // Na razie ustawiamy przykładowe dane:
                if (userData.stats) {
                    setStats({
                        elo: userData.elo || 1200,
                        gamesPlayed: userData.stats.gamesPlayed || 0,
                        wins: userData.stats.wins || 0,
                        losses: userData.stats.losses || 0,
                        draws: userData.stats.draws || 0
                    });
                }

                if (userData.history && Array.isArray(userData.history)) {
                    setHistory(userData.history);
                } else {
                    setHistory([]);
                }

            } catch (err) {
                console.error(err);
                // Wyloguj w razie błędu tokena
                localStorage.removeItem('access_token');
                navigate('/login');
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem("username");
        try { wsClient.disconnect(); } catch (e) { }
        navigate('/');
    };

    if (loading) return <div className="container" style={{padding: 20}}>Ładowanie profilu...</div>;
    if (!user) return null;

    // Pobranie inicjału do avatara
    const initial = user.username ? user.username[0].toUpperCase() : '?';
    const joinDate = new Date().toLocaleDateString(); // Tu można użyć user.date_joined z Django jeśli API to zwraca

    return (
        <div className="site">
            {/* Header taki sam jak w HomePage */}
            <header className="site__header">
                <div className="container header__inner">
                    <div className="brand">
                        <div className="brand__logo">CO</div>
                        <div className="brand__title">Chess Online</div>
                    </div>

                    <nav className="nav">
                        <Link className="nav__link" to="/">Strona główna</Link>
                        <Link className="nav__link" to="/rooms">Pokoje</Link>
                        <button className="btn btn--link nav__link" onClick={handleLogout}>Wyloguj</button>
                    </nav>
                </div>
            </header>

            <main className="container site__main">
                <h1 className="section__title">Twój profil</h1>

                <div className="profile-layout">
                    
                    {/* Karta Główna */}
                    <div className="profile-card">
                        <div className="profile-avatar">{initial}</div>
                        <div className="profile-info">
                            <h2>{user.username}</h2>
                            <span className="email">{user.email}</span>
                            <div className="profile-meta">
                                <span>Dołączył: {joinDate}</span>
                                <span>•</span>
                                <span>ID: #{user.id}</span>
                            </div>
                        </div>
                        <div style={{marginLeft: 'auto'}}>
                            <button className="btn" disabled>Edytuj profil</button>
                        </div>
                    </div>

                    {/* Statystyki */}
                    <div className="stats-grid">
                        <div className="stat-card elo">
                            <span className="stat-value">{stats.elo}</span>
                            <span className="stat-label">Rating ELO</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-value">{stats.gamesPlayed}</span>
                            <span className="stat-label">Rozegrane</span>
                        </div>
                        <div className="stat-card win">
                            <span className="stat-value">{stats.wins}</span>
                            <span className="stat-label">Wygrane</span>
                        </div>
                        <div className="stat-card loss">
                            <span className="stat-value">{stats.losses}</span>
                            <span className="stat-label">Przegrane</span>
                        </div>
                    </div>

                    {/* Historia Gier */}
                    <div className="history-section">
                        <h3>Ostatnie partie</h3>
                        {history.length === 0 ? (
                            <p className="muted">Brak rozegranych gier.</p>
                        ) : (
                            <div className="history-list">
                                {history.map(game => (
                                    <div key={game.id} className="history-item">
                                        
                                        {/* Informacje o meczu */}
                                        <div className="history-item__info">
                                            <span className="match-vs">vs. {game.opponent}</span>
                                            <span className="match-date">{game.date}</span>
                                            {/* Opcjonalnie: powód końca gry */}
                                            <span style={{fontSize: '0.75rem', color: '#999'}}>
                                                {game.reason === 'checkmate' && 'Mat'}
                                                {game.reason === 'timeout' && 'Czas'}
                                                {game.reason === 'resignation' && 'Poddanie'}
                                                {game.reason === 'agreement' && 'Ugoda'}
                                                {game.reason === 'stalemate' && 'Pat'}
                                            </span>
                                        </div>

                                        {/* Wynik i Przycisk */}
                                        <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                                            {/* Badge wyniku */}
                                            <div>
                                                {game.result === 'win' && <span className="result-badge win">Wygrana</span>}
                                                {game.result === 'loss' && <span className="result-badge loss">Porażka</span>}
                                                {game.result === 'draw' && <span className="result-badge draw">Remis</span>}
                                            </div>

                                            {/* --- NOWY PRZYCISK: PODGLĄD --- */}
                                            <button 
                                                className="btn" 
                                                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                                                onClick={() => navigate(`/replay/${game.id}`)}
                                            >
                                                Podgląd
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </div>
            </main>

            <footer className="site__footer">
                © {new Date().getFullYear()} Chess Online
            </footer>
        </div>
    );
}