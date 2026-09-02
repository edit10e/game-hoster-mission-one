"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import WebApp from "@twa-dev/sdk";

function GameContent() {
  const searchParams = useSearchParams();
  
  const [gameId, setGameId] = useState<string | null>(null);
  const [game, setGame] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [selectedGame, setSelectedGame] = useState("Rock-Paper-Scissors");
  const [photoUrl, setPhotoUrl] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      WebApp.ready();
      WebApp.expand(); // ขยาย TMA ให้เด้งขึ้นมาเต็มหน้าจอ

      const tgUser = WebApp.initDataUnsafe?.user;
      setUser(tgUser);

      // ดึง gameId จาก 2 ช่องทาง:
      // 1. จาก start_param (กรณีเปิดผ่าน Direct Link เช่น https://t.me/bot/app?startapp=game_xxx)
      // 2. จาก URL Query Parameter (กรณีเปิดผ่าน https://your-domain.com?gameId=game_xxx)
      const startParam = WebApp.initDataUnsafe?.start_param;
      const queryGameId = searchParams.get("gameId");

      const resolvedGameId = startParam || queryGameId;
      if (resolvedGameId) {
        setGameId(resolvedGameId);
      }
    }
  }, [searchParams]);

  // ดึงข้อมูลเกมแบบ Polling ทุกๆ 2 วินาที
  useEffect(() => {
    if (!gameId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/game?gameId=${gameId}`);
        if (res.ok) {
          const data = await res.json();
          setGame(data);
        }
      } catch (err) {
        console.error("Failed to fetch game data:", err);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [gameId]);

  const handleAccept = async () => {
    if (!user || !gameId) return;
    await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId,
        userId: user.id,
        action: "accept",
        payload: { username: user.username || user.first_name },
      }),
    });
  };

  const handleSubmit = async () => {
    if (!user || !gameId) return;
    if (!photoUrl) {
      alert("กรุณาใส่ URL รูปภาพของคุณ");
      return;
    }
    setStatusMsg("กำลังรออีกฝ่ายยืนยัน...");
    await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId,
        userId: user.id,
        action: "submit_choices",
        payload: { gameChoice: selectedGame, photoUrl },
      }),
    });
  };

  if (!gameId) {
    return <div className="p-4 text-center text-gray-500">⚠️ ไม่พบ Game ID</div>;
  }
  
  if (!game) {
    return <div className="p-4 text-center">⏳ กำลังโหลดข้อมูลเกม...</div>;
  }

  const isUser1 = user?.id === game.user1.id;
  const isUser2 =
    user?.username?.toLowerCase() === game.user2.username?.replace("@", "").toLowerCase() ||
    user?.id === game.user2.id;

  if (!isUser1 && !isUser2) {
    return (
      <div className="p-6 text-center text-red-500 font-bold">
        🚫 เฉพาะคู่ดวล ({game.user1.username} VS {game.user2.username}) เท่านั้นที่เข้าเล่นได้
      </div>
    );
  }

  return (
    <div className="p-6 max-w-md mx-auto text-center space-y-4 font-sans">
      <h1 className="text-2xl font-bold text-blue-600">⚔️ VS Game Arena</h1>
      <p className="text-gray-600">
        {game.user1.username} 🥊 VS 🥊 {game.user2.username}
      </p>

      {/* ขั้นตอนที่ 1: User2 กดยอมรับ */}
      {game.status === "waiting_accept" && (
        <div>
          {isUser2 ? (
            <button
              onClick={handleAccept}
              className="w-full py-3 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 shadow-md active:scale-95 transition"
            >
              ✅ กดยอมรับการดวล (ภายใน 60 วิ)
            </button>
          ) : (
            <p className="animate-pulse text-amber-600">กำลังรอ {game.user2.username} กดยอมรับ...</p>
          )}
        </div>
      )}

      {/* ขั้นตอนที่ 2: เลือกเกม & ใส่ URL รูปภาพ */}
      {(game.status === "choosing_game" || game.status === "uploading_photo") && (
        <div className="space-y-4 text-left border p-4 rounded-xl shadow-sm bg-white">
          <div>
            <label className="block text-sm font-medium mb-1">เลือกเกมที่อยากเล่น:</label>
            <select
              value={selectedGame}
              onChange={(e) => setSelectedGame(e.target.value)}
              className="w-full p-2 border rounded-lg bg-gray-50"
            >
              <option value="Rock-Paper-Scissors">เป่ายิ้งฉุบ (Rock-Paper-Scissors)</option>
              <option value="Coin-Flip">หัว-ก้อย (Coin-Flip)</option>
              <option value="Number-Guess">ทายเลข (Number-Guess)</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">*ถ้าเลือกไม่ตรงกัน ระบบจะทำการสุ่มเกม</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">วาง Direct Image URL รูปของคุณ:</label>
            <input
              type="url"
              placeholder="https://example.com/photo.jpg"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              className="w-full p-2 border rounded-lg text-sm bg-gray-50"
            />
          </div>

          <button
            onClick={handleSubmit}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-md active:scale-95 transition"
          >
            🔒 ยืนยันรูปภาพ & พร้อมแข่ง
          </button>
          {statusMsg && <p className="text-center text-sm text-blue-500 animate-pulse">{statusMsg}</p>}
        </div>
      )}

      {/* จบเกม */}
      {game.status === "finished" && (
        <div className="p-4 bg-green-100 text-green-800 rounded-xl font-bold">
          🎉 การดวลเสร็จสิ้น! บอทได้ส่งรูปผู้แพ้ไปที่กลุ่มแล้ว!
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="p-4 text-center">กำลังโหลด...</div>}>
      <GameContent />
    </Suspense>
  );
}