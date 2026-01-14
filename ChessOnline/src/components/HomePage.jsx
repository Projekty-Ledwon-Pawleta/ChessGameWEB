// src/pages/HomePage.jsx
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import '../styles/home.css';
import wsClient from "../api/wsClient"; // jeśli nie używasz wsClient, usuń ten import

import chessboardImg from '../assets/chessboard.png';

export default function HomePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [matching, setMatching] = useState(false);

  // pobierz info o użytkowniku jeśli mamy access_token
  useEffect(() => {
    let mounted = true;
    const token = localStorage.getItem('access_token');
    if (!token) {
      if (mounted) {
        setUser(null);
        setLoadingUser(false);
      }
      return;
    }

    (async () => {
      setLoadingUser(true);
      try {
        const res = await fetch("http://localhost:8000/auth/user/", {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          // token nieprawidłowy / wygasł
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          if (mounted) {
            setUser(null);
            setLoadingUser(false);
          }
          return;
        }

        const json = await res.json(); // oczekujemy dane użytkownika
        if (mounted) {
          setUser(json);
          setLoadingUser(false);
        }
      } catch (err) {
        console.error("Błąd pobierania usera:", err);
        if (mounted) {
          setUser(null);
          setLoadingUser(false);
        }
      }
    })();

    return () => { mounted = false; };
  }, []);

  const handleLogout = async () => {

    // wyczyść localStorage i rozłącz WS
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem("username");
    try { wsClient.disconnect(); } catch(e) { /* ignore if not used */ }

    setUser(null);
    navigate('/'); // zostań na home lub kieruj gdzie chcesz
  };

  const handleQuickMatch = () => {
    if (!user) {
        navigate('/login');
        return;
    }
    setMatching(true);

    // 1. Połącz z lobby (jeśli nie jesteśmy połączeni)
    try {
        wsClient.connect({ room: "lobby" });
    } catch (e) {
        console.error(e);
        setMatching(false);
        return;
    }

    // 2. Nasłuchuj na "joined" lub błędy
    const unsubJoined = wsClient.on("joined", (msg) => {
        if (msg.success && msg.room) {
            // Sprzątamy listenery
            unsubJoined();
            // Przekierowanie do gry
            navigate(`/play/${encodeURIComponent(msg.room.name)}`);
        } else {
            setMatching(false);
            alert("Nie udało się dołączyć: " + (msg.message || "Błąd serwera"));
        }
    });

    // Opcjonalnie obsługa błędu połączenia
    const unsubError = wsClient.on("error", () => {
        setMatching(false);
        alert("Błąd połączenia z serwerem.");
    });

    // 3. Po otwarciu połączenia wyślij 'quick_match'
    // Jeśli połączenie już było otwarte, on('open') może się nie wykonać, więc sprawdzamy stan
    if (wsClient.connected) {
        wsClient.send({ type: "quick_match" });
    } else {
        const unsubOpen = wsClient.on("open", () => {
            wsClient.send({ type: "quick_match" });
            unsubOpen(); // jednorazowo
        });
    }

    // Bezpiecznik: jeśli nic się nie stanie przez 5 sekund, zresetuj guzik
    setTimeout(() => {
        if (matching) setMatching(false);
        // Tu można też zdjąć listenery, jeśli chcesz być bardzo dokładny
    }, 5000);
  };

  const authNav = (
    <>
      <Link className="nav__link" to="/">Strona główna</Link>
      <Link className="nav__link" to="/rules">Zasady</Link>
      <Link className="nav__link" to="/leaderboard">Ranking</Link>
      <Link className="nav__link" to="/profile">Profil</Link>
      <button className="btn btn--link nav__link" onClick={handleLogout}>Wyloguj</button>
      <Link className="btn btn--primary" to="/rooms">Wejdź do gry</Link>
    </>
  );

  const guestNav = (
    <>
      <Link className="nav__link" to="/">Strona główna</Link>
      <Link className="nav__link" to="/rules">Zasady</Link>
      <Link className="nav__link" to="/leaderboard">Ranking</Link>
      <Link className="nav__link" to="/login">Zaloguj</Link>
      <Link className="nav__link" to="/register">Zarejestruj</Link>
    </>
  );

  return (
    <div className="site">
      <header className="site__header">
        <div className="container header__inner">
          <div className="brand">
            <div className="brand__logo">CO</div>
            <div className="brand__title">Chess Online</div>
          </div>

          <nav className="nav">
            {loadingUser ? (
              <div style={{padding: '8px 12px'}}>Ładowanie…</div>
            ) : user ? authNav : guestNav}
          </nav>
        </div>
      </header>

      <main className="container site__main">
        <section className="hero">
          <div className="hero__copy">
            <h1 className="hero__title">
              {user ? `Witaj, ${user.email || user.username || 'gracz'}!` : 'Graj w szachy online z żywymi przeciwnikami'}
            </h1>

            <p className="hero__subtitle">
              {user
                ? 'Znajdź pokój, dołącz do rywala i stocz emocjonujące pojedynki'
                : 'Zaloguj się lub zarejestruj, aby rozpocząć prawdziwą rozgrywkę'}
            </p>

            <div className="hero__actions">
              {user ? (
                <>
                  <button 
                    className="btn btn--primary" 
                    onClick={handleQuickMatch} 
                    disabled={matching}
                  >
                    {matching ? "Szukam..." : "Rozpocznij grę"}
                  </button>
                  <Link className="btn" to="/profile">Mój profil</Link>
                </>
              ) : (
                <>
                  <Link className="btn btn--primary" to="/login">Zaloguj</Link>
                  <Link className="btn" to="/register">Zarejestruj</Link>
                </>
              )}
            </div>
          </div>

          <aside className="hero__preview">
            <div className="board-preview" style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                padding: 10
            }}>
                {/* 2. ZAMIENIONA SEKCJA - OBRAZEK STATYCZNY */}
                <img 
                    src={chessboardImg} 
                    alt="Przykładowa plansza" 
                    style={{
                        width: '100%',            // Dopasuj szerokość do kontenera
                        maxWidth: '450px',        // Nie pozwól, by był gigantyczny na dużych ekranach
                        height: 'auto',           // Zachowaj proporcje
                        borderRadius: '8px',      // Ładne rogi
                        boxShadow: '0 10px 30px rgba(0,0,0,0.3)', // Cień dla głębi
                        border: '5px solid #4a3c31' // Ramka pasująca do motywu
                    }}
                />
            </div>
          </aside>
        </section>

        <section className="features">
          <h2 className="section__title">Dlaczego warto?</h2>
          <div className="features__grid">
            <div className="feature-card">
              <h3>Proste dołączenie</h3>
              <p>Stwórz konto i od razu wyszukaj pokój.</p>
            </div>

            <div className="feature-card">
              <h3>Rozgrywka w czasie rzeczywistym</h3>
              <p>Szybka komunikacja między graczami i serwerem — ruchy natychmiast widoczne.</p>
            </div>

            <div className="feature-card">
              <h3>Bezpieczne konto</h3>
              <p>Logowanie, profile i pokoje dostępne tylko dla zweryfikowanych graczy.</p>
            </div>
          </div>
        </section>

        <section className="cta">
          <div>
            <h3>Gotowy zagrać?</h3>
            <p>Zaloguj się, stwórz pokój i zaproś znajomego</p>
          </div>
          <div className="cta__actions">
            {user ? (
              <>
                <button 
                    className="btn btn--primary" 
                    onClick={handleQuickMatch}
                    disabled={matching}
                >
                    {matching ? "Szukam..." : "Szybkie dopasowanie"}
                </button>
                <button className="btn" onClick={() => navigate('/profile')}>Mój profil</button>
              </>
            ) : (
              <>
                <Link className="btn btn--primary" to="/register">Zarejestruj konto</Link>
              </>
            )}
          </div>
        </section>

        <footer className="site__footer">
          © {new Date().getFullYear()} Chess Online — prosty klient do gry w szachy.
        </footer>
      </main>
    </div>
  );
}
