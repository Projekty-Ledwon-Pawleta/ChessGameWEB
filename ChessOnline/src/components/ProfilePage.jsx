import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/home.css';
import '../styles/profile.css';
import wsClient from '../api/wsClient';

export default function ProfilePage() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        username: '',
        first_name: '',
        last_name: ''
    });
    const [saveError, setSaveError] = useState(null);

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
                
                setFormData({
                    username: userData.username || '',
                    first_name: userData.first_name || '',
                    last_name: userData.last_name || ''
                });

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

    const handleInputChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSave = async () => {
        setSaveError(null);
        const token = localStorage.getItem('access_token');
        
        try {
            const res = await fetch("http://localhost:8000/auth/user/", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify(formData)
            });

            if (!res.ok) {
                const errData = await res.json();
                // Prosta obsługa błędów (można rozbudować)
                throw new Error(JSON.stringify(errData));
            }

            const updatedUser = await res.json();
            
            setUser(prev => ({
                ...prev,
                username: updatedUser.username,
                first_name: updatedUser.first_name,
                last_name: updatedUser.last_name
            }));
            
            if (updatedUser.username) {
                localStorage.setItem("username", updatedUser.username);
            }

            setIsEditing(false);
        } catch (err) {
            console.error("Błąd zapisu:", err);
            setSaveError("Nie udało się zapisać zmian. Sprawdź czy nazwa użytkownika nie jest zajęta.");
        }
    };

    const handleCancel = () => {
        // Resetujemy formularz do aktualnych danych użytkownika
        setFormData({
            username: user.username || '',
            first_name: user.first_name || '',
            last_name: user.last_name || ''
        });
        setIsEditing(false);
        setSaveError(null);
    };

    if (loading) return <div className="container" style={{padding: 20}}>Ładowanie profilu...</div>;
    if (!user) return null;

    // Pobranie inicjału do avatara
    const initial = user.username ? user.username[0].toUpperCase() : '?';
    const joinDate = user.date_joined || '-';

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
                        
                        <div className="profile-info" style={{flex: 1}}>
                            {isEditing ? (
                                <div style={{display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 300}}>
                                    <label style={{fontSize: 12, color: '#666'}}>Nazwa użytkownika</label>
                                    <input 
                                        name="username" 
                                        value={formData.username} 
                                        onChange={handleInputChange} 
                                        className="profile-input" // Dodaj styl w CSS lub inline
                                        style={{padding: 8, borderRadius: 6, border: '1px solid #ddd'}}
                                    />
                                    
                                    <div style={{display: 'flex', gap: 10}}>
                                        <div style={{flex: 1}}>
                                            <label style={{fontSize: 12, color: '#666'}}>Imię</label>
                                            <input 
                                                name="first_name" 
                                                value={formData.first_name} 
                                                onChange={handleInputChange}
                                                style={{padding: 8, borderRadius: 6, border: '1px solid #ddd', width: '100%', boxSizing: 'border-box'}}
                                            />
                                        </div>
                                        <div style={{flex: 1}}>
                                            <label style={{fontSize: 12, color: '#666'}}>Nazwisko</label>
                                            <input 
                                                name="last_name" 
                                                value={formData.last_name} 
                                                onChange={handleInputChange}
                                                style={{padding: 8, borderRadius: 6, border: '1px solid #ddd', width: '100%', boxSizing: 'border-box'}}
                                            />
                                        </div>
                                    </div>
                                    {saveError && <div style={{color: 'red', fontSize: 12}}>{saveError}</div>}
                                </div>
                            ) : (
                                <>
                                    <h2>
                                        {user.first_name} {user.last_name} 
                                        {(!user.first_name && !user.last_name) && user.username}
                                    </h2>
                                    {/* Jeśli są imiona, pokaż username jako dodatek */}
                                    {(user.first_name || user.last_name) && (
                                        <div style={{color: '#6b7280', marginBottom: 4}}>@{user.username}</div>
                                    )}
                                    
                                    <span className="email">{user.email}</span>
                                    <div className="profile-meta">
                                        <span>Dołączył: {joinDate}</span>
                                        <span>•</span>
                                        <span>ID: #{user.id}</span>
                                    </div>
                                </>
                            )}
                        </div>

                        <div style={{marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 8}}>
                            {isEditing ? (
                                <>
                                    <button className="btn btn--primary" onClick={handleSave}>Zapisz</button>
                                    <button className="btn" onClick={handleCancel}>Anuluj</button>
                                </>
                            ) : (
                                <button className="btn" onClick={() => setIsEditing(true)}>Edytuj profil</button>
                            )}
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
                        <div className="stat-card draw">
                            <span className="stat-value">{stats.draws}</span>
                            <span className="stat-label">Remisy</span>
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