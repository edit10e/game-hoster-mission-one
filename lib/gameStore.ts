export interface GameSession {
  id: string;
  chatId: number;
  user1: { id: number; username: string; accepted: boolean; gameChoice?: string; photoUrl?: string; confirmedPhoto?: boolean };
  user2: { id: number; username: string; accepted: boolean; gameChoice?: string; photoUrl?: string; confirmedPhoto?: boolean };
  status: "waiting_accept" | "choosing_game" | "uploading_photo" | "playing" | "finished";
  selectedGame?: string;
  createdAt: number;
  expireTimer?: NodeJS.Timeout;
}

// Map เก็บข้อมูลเกมกำลังดำเนินอยู่ { [gameId]: GameSession }
export const activeGames = new Map<string, GameSession>();

// ลิสต์เกมที่มีให้เลือก
export const AVAILABLE_GAMES = ["Rock-Paper-Scissors", "Coin-Flip", "Number-Guess"];