import { useParams } from "react-router-dom";
import ChessBoard from "../components/ChessBoard";

export default function GamePage() {
  const { room } = useParams();
  const defaultRoom = room || "testroom";
  const myUsername = localStorage.getItem("username") || "Anonim"; 

  return (
        <div>
            <ChessBoard 
                defaultRoom={defaultRoom} 
                wsHost="ws://localhost:8000" 
                username={myUsername}
                initialPlayers={[]}
            />
        </div>
    );
}
