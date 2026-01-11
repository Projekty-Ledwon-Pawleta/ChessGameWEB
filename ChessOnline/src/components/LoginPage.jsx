import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

import '../styles/auth.css';

export default function LoginPage({ onSubmit }) {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    async function defaultLogin(data) {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("http://localhost:8000/auth/jwt/create/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (!res.ok) {
                // spróbuj wyciągnąć szczegóły błędu z odpowiedzi
                const json = await res.json().catch(() => null);
                const message = (json && (json.detail || json.message || JSON.stringify(json))) || `Błąd: ${res.status}`;
                throw new Error(message);
            }

            const json = await res.json(); // oczekujemy { access, refresh }
            if (!json.access || !json.refresh) {
                throw new Error("Nie otrzymano tokenów z serwera.");
            }

            // Zapis tokenów (dla prostoty używamy localStorage)
            localStorage.setItem("access_token", json.access);
            localStorage.setItem("refresh_token", json.refresh);
            
            localStorage.setItem("username", data.username);

            // opcjonalnie: ustaw globalny header axios jeśli używasz axios
            // api.defaults.headers.common['Authorization'] = `Bearer ${json.access}`;

            setLoading(false);
            // przekieruj tam, gdzie chcesz (np. strona główna lub panel gry)
            navigate("/");
            return json;
        } catch (err) {
            setLoading(false);
            setError(err.message || "Nieznany błąd");
            throw err;
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        const form = e.target;
        const data = {
            username: form.username.value,
            password: form.password.value,
        };

        try {
            // jeśli przekazano prop onSubmit użyj go, inaczej użyj defaultLogin
            const fn = onSubmit || defaultLogin;
            await fn(data);

            // jeżeli chcesz automatycznie połączyć WS po logowaniu:
            // import wsClient and call wsClient.connect({ room: '...' })
            // ale to zależy od Twojej logiki tworzenia pokoju/gry
        } catch (err) {
            // error już ustawiony w defaultLogin, ale zabezpieczamy się
            if (!error) setError(err.message || "Błąd logowania");
        }
    };

    return (
        <div className="auth-page" style={{ display: 'flex', justifyContent: 'center', flexDirection: 'column', alignItems: 'center', position: 'relative' }} >
            <div className="auth-card">
                <div className="auth-card__header">
                    <div className="brand__logo small">CO</div>
                    <h2>Zaloguj się</h2>
                    <p className="muted">Wprowadź swoje dane aby wejść do gry</p>
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <label className="form-row">
                        <span>Nazwa użytkownika</span>
                        <input name="username" type="username" required />
                    </label>

                    <label className="form-row">
                        <span>Hasło</span>
                        <input name="password" type="password" required />
                    </label>

                    {error && (
                        <div className="form-row">
                            <div style={{ color: "crimson" }}>{error}</div>
                        </div>
                    )}

                    <div className="form-row form-row--actions">
                        <button className="btn btn--primary" type="submit" disabled={loading}>
                            {loading ? "Logowanie..." : "Zaloguj"}
                        </button>
                        <a className="btn-link" href="/register">Nie masz konta? Zarejestruj się</a>
                    </div>

                    <div className="form-row form-row--actions">
                        <Link className="btn btn--primary" to="/">Strona główna</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}