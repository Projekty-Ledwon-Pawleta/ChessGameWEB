// src/pages/ReplayPage.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '../styles/home.css';
import ReplayBoard from '../components/ReplayBoard';

export default function ReplayPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    
    const [gameData, setGameData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        // Pobieramy dane (backend teraz zwróci też pole 'boards')
        fetch(`http://localhost:8000/games/history/${id}/`, {
            headers: { "Authorization": `Bearer ${token}` }
        })
        .then(res => {
            if (!res.ok) throw new Error("Nie udało się pobrać gry");
            return res.json();
        })
        .then(data => {
            setGameData(data);
        })
        .catch(err => setError(err.message));
    }, [id]);

    if (error) return <div className="container" style={{padding:20, color:'red'}}>Błąd: {error}</div>;
    if (!gameData) return <div className="container" style={{padding:20}}>Ładowanie partii...</div>;

    return (
        <div className="site">
            <header className="site__header">
                <div className="container header__inner">
                    <div className="brand" style={{cursor:'pointer'}} onClick={()=>navigate('/')}>
                        <div className="brand__logo">CO</div>
                        <div className="brand__title">Chess Online</div>
                    </div>
                    <button className="btn" onClick={() => navigate('/profile')}>Powrót do profilu</button>
                </div>
            </header>

            <main className="container" style={{ padding: '20px 0' }}>
                <div style={{textAlign: 'center', marginBottom: 20}}>
                    <h2 className="section__title">Podgląd partii #{id}</h2>
                </div>

                {/* Tutaj renderujemy nasz ReplayBoard przekazując mu wszystkie dane z backendu */}
                <ReplayBoard gameData={gameData} />
            </main>
        </div>
    );
}