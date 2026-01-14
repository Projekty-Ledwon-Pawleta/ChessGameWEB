// src/pages/LeaderboardPage.jsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/home.css';
import '../styles/leaderboard.css';
import wsClient from '../api/wsClient';

export default function LeaderboardPage() {
    const navigate = useNavigate();
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        
        fetch("http://localhost:8000/leaderboard/", { // Sprawdź czy URL pasuje do Twojego urls.py
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
        })
        .then(res => {
            if (!res.ok) throw new Error("Nie udało się pobrać rankingu");
            return res.json();
        })
        .then(data => {
            setPlayers(data);
            setLoading(false);
        })
        .catch(err => {
            setError(err.message);
            setLoading(false);
        });
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem("username");
        try { wsClient.disconnect(); } catch (e) { }
        navigate('/');
    };

    // Helper do ikony rangi
    const getRankIcon = (index) => {
        if (index === 0) return <span className="rank-1">🥇</span>;
        if (index === 1) return <span className="rank-2">🥈</span>;
        if (index === 2) return <span className="rank-3">🥉</span>;
        return <span className="rank-num">#{index + 1}</span>;
    };

    return (
        <div className="site">
            <header className="site__header">
                <div className="container header__inner">
                    <div className="brand" style={{cursor:'pointer'}} onClick={()=>navigate('/')}>
                        <div className="brand__logo">CO</div>
                        <div className="brand__title">Chess Online</div>
                    </div>
                    <nav className="nav">
                        <Link className="nav__link" to="/">Strona główna</Link>
                    </nav>
                </div>
            </header>

            <main className="container site__main">
                <div style={{maxWidth: 800, margin: '0 auto'}}>
                    <h1 className="section__title" style={{textAlign: 'center', marginBottom: 30}}>Ranking Graczy</h1>

                    {loading && <div style={{textAlign:'center'}}>Ładowanie rankingu...</div>}
                    {error && <div style={{color:'red', textAlign:'center'}}>{error}</div>}

                    {!loading && !error && (
                        <table className="leaderboard-table">
                            <thead>
                                <tr>
                                    <th style={{textAlign: 'center'}}>Miejsce</th>
                                    <th>Gracz</th>
                                    <th>ELO</th>
                                    <th className="hide-mobile">Statystyki (W / P / R)</th>
                                    <th className="hide-mobile" style={{textAlign: 'right'}}>Rozegrane</th>
                                </tr>
                            </thead>
                            <tbody>
                                {players.map((player, index) => (
                                    <tr key={player.username}>
                                        <td className="rank-cell">
                                            {getRankIcon(index)}
                                        </td>
                                        <td className="player-cell">
                                            {player.username}
                                        </td>
                                        <td className="elo-cell">
                                            {player.elo}
                                        </td>
                                        <td className="stats-cell hide-mobile">
                                            <span className="stat-win" title="Wygrane">{player.stats.wins}</span> / {' '}
                                            <span className="stat-loss" title="Przegrane">{player.stats.losses}</span> / {' '}
                                            <span className="stat-draw" title="Remisy">{player.stats.draws}</span>
                                        </td>
                                        <td className="stats-cell hide-mobile" style={{textAlign: 'right'}}>
                                            {player.stats.gamesPlayed}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </main>

            <footer className="site__footer">
                © {new Date().getFullYear()} Chess Online
            </footer>
        </div>
    );
}