import { useParams } from "react-router-dom";
import ChessBoard from "../components/ChessBoard";

export default function GamePage() {
  const { room } = useParams();
  const defaultRoom = room || "testroom";
  return <ChessBoard defaultRoom={defaultRoom} />;
}
