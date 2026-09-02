import { NextResponse } from "next/server";
import { activeGames, AVAILABLE_GAMES } from "@/lib/gameStore";
import { Bot } from "grammy";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || "");

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId");

  if (!gameId || !activeGames.has(gameId)) {
    return NextResponse.json({ error: "Game not found or expired" }, { status: 404 });
  }

  return NextResponse.json(activeGames.get(gameId));
}

export async function POST(req: Request) {
  const body = await req.json();
  const { gameId, userId, action, payload } = body;

  const game = activeGames.get(gameId);
  if (!game) {
    return NextResponse.json({ error: "Game expired" }, { status: 400 });
  }

  // 1. User2 กดยอมรับการดวล
  if (action === "accept") {
    if (game.user2.username.toLowerCase() === payload.username.toLowerCase()) {
      game.user2.id = userId;
      game.user2.accepted = true;
      game.status = "choosing_game";
      return NextResponse.json({ success: true, game });
    }
    return NextResponse.json({ error: "Only challenged user can accept" }, { status: 403 });
  }

  // 2. เลือกเกม & ยืนยันรูปภาพ
  if (action === "submit_choices") {
    const isUser1 = userId === game.user1.id;
    const isUser2 = userId === game.user2.id;

    if (!isUser1 && !isUser2) {
      return NextResponse.json({ error: "Unauthorized user" }, { status: 403 });
    }

    const player = isUser1 ? game.user1 : game.user2;
    player.gameChoice = payload.gameChoice;
    player.photoUrl = payload.photoUrl;
    player.confirmedPhoto = true;

    // ถ้าทั้งคู่ยืนยันเรียบร้อย
    if (game.user1.confirmedPhoto && game.user2.confirmedPhoto) {
      // สุ่มเกมถ้าเลือกไม่ตรงกัน
      if (game.user1.gameChoice === game.user2.gameChoice) {
        game.selectedGame = game.user1.gameChoice;
      } else {
        game.selectedGame = AVAILABLE_GAMES[Math.floor(Math.random() * AVAILABLE_GAMES.length)];
      }

      game.status = "finished";

      // สุ่มผู้แพ้/ชนะ (ตัวอย่าง: สุ่มผู้แพ้ 50/50)
      const loser = Math.random() < 0.5 ? game.user1 : game.user2;
      
      // ส่งรูปผู้แพ้เข้ากลุ่ม ลบใน 30 วินาที
      if (loser.photoUrl) {
        try {
          const sentPhoto = await bot.api.sendPhoto(game.chatId, loser.photoUrl, {
            caption: `💀 @${loser.username} เป็นผู้แพ้ในเกม ${game.selectedGame}! รูปนี้จะถูกลบใน 30 วินาที`,
          });

          setTimeout(async () => {
            try {
              await bot.api.deleteMessage(game.chatId, sentPhoto.message_id);
            } catch (_) {}
          }, 30000);
        } catch (err) {
          console.error("Failed to send loser photo:", err);
        }
      }

      activeGames.delete(gameId); // จบเกม ลบออกจาก Memory
    }

    return NextResponse.json({ success: true, game });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}