// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";

import HomePage from "./components/HomePage";
import LoginPage from "./components/LoginPage";
import RegisterPage from "./components/RegisterPage";
import RoomsPage from "./components/RoomsPage";
import GamePage from "./components/GamePage";

import './index.css';

export default function App() {
  return (
     <BrowserRouter>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <main className="py-6">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* strona z planszą */}
              <Route path="/rooms" element={<RoomsPage/>} />
              <Route path="/play/:room?" element={<GamePage/>} />

              {/* fallback */}
              <Route path="*" element={<h2>404 — nie znaleziono</h2>} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
