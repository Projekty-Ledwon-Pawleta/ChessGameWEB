import '../styles/auth.css';
import { Link } from "react-router-dom";

export default function RegisterPage({ onSubmit }) {
    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-card__header">
                    <div className="brand__logo small">CO</div>
                    <h2>Utwórz konto</h2>
                    <p className="muted">Stwórz konto, żeby zapisywać statystyki i grać z innymi.</p>
                </div>


                <form className="auth-form" onSubmit={(e) => { e.preventDefault(); const form = e.target; const data = { name: form.name.value, email: form.email.value, password: form.password.value }; onSubmit && onSubmit(data); }}>
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


                    <div className="form-row form-row--actions">
                        <button className="btn btn--primary" type="submit">Zarejestruj</button>
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