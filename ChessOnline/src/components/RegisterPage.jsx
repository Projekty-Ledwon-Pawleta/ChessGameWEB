import '../styles/auth.css';
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

export default function RegisterPage({ onSubmit }) {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    async function defaultRegister(data) {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch("http://localhost:8000/auth/registration/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (!res.ok) {
                const json = await res.json().catch(() => null);
                // Obsługa błędów formularza (np. "To pole jest wymagane" lub "Hasło zbyt krótkie")
                let message = `Błąd: ${res.status}`;
                if (json) {
                    if (json.detail) message = json.detail;
                    else {
                        // Jeśli API zwraca obiekt z błędami per pole (np. { password: ["Too short"] })
                        // zamieniamy to na czytelny ciąg znaków
                        const errors = Object.values(json).flat().join(', ');
                        if (errors) message = errors;
                    }
                }
                throw new Error(message);
            }

            // Sukces - zazwyczaj API rejestracji zwraca utworzonego użytkownika
            const json = await res.json();
            
            setLoading(false);
            
            // Po udanej rejestracji przekieruj do logowania
            navigate("/login");
            return json;

        } catch (err) {
            setLoading(false);
            setError(err.message || "Nieznany błąd rejestracji");
            throw err;
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        const form = e.target;
        
        // Mapowanie pól formularza na dane API
        const data = {
            username: form.name.value, // Backend zazwyczaj oczekuje 'username', a input ma name="name"
            email: form.email.value,
            password1: form.password.value,
            password2: form.password.value, 
        };

        try {
            const fn = onSubmit || defaultRegister;
            await fn(data);
        } catch (err) {
            // Error jest ustawiany w defaultRegister, ale zabezpieczenie:
            if (!error) setError(err.message || "Błąd rejestracji");
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-card__header">
                    <div className="brand__logo small">CO</div>
                    <h2>Utwórz konto</h2>
                    <p className="muted">Stwórz konto, żeby zapisywać statystyki i grać z innymi.</p>
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <label className="form-row">
                        <span>Nazwa użytkownika</span>
                        <input name="name" type="text" required />
                    </label>

                    <label className="form-row">
                        <span>Adres e‑mail</span>
                        <input name="email" type="email" required />
                    </label>

                    <label className="form-row">
                        <span>Hasło</span>
                        <input name="password" type="password" required minLength={6} />
                    </label>

                    {/* Wyświetlanie błędów - wzorowane na logowaniu */}
                    {error && (
                        <div className="form-row">
                            <div style={{ color: "crimson", fontSize: "0.9rem" }}>{error}</div>
                        </div>
                    )}

                    <div className="form-row form-row--actions">
                        <button className="btn btn--primary" type="submit" disabled={loading}>
                            {loading ? "Rejestracja..." : "Zarejestruj"}
                        </button>
                        <a className="btn-link" href="/login">Masz już konto? Zaloguj się</a>
                    </div>

                    <div className="form-row form-row--actions">
                        <Link className="btn btn--primary" to="/">Strona główna</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}