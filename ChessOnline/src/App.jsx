import React from 'react'
import ChessWebClient from './ChessWebClient'
import './index.css'


export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
    <div className="max-w-6xl mx-auto">
    <header className="mb-6">
    <h1 className="text-3xl font-bold">Chess Online — Web Client</h1>
    <p className="text-gray-600">Connects to your Daphne/Channels websocket API</p>
    </header>


    <main>
    <ChessWebClient defaultRoom="testroom" wsHost={"ws://localhost:8000"} />
    </main>


    <footer className="mt-8 text-sm text-gray-500">Make sure Daphne is running and your CHANNEL_LAYERS are reachable.</footer>
    </div>
    </div>
  )
}