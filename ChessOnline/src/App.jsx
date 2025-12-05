// src/App.jsx
import ChessBoard from './components/ChessBoard';
import './index.css';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold">Chess Online — Web Client</h1>
        </header>

        <main className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ChessBoard />
        </main>
      </div>
    </div>
  );
}
