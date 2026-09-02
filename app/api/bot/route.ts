import { Bot, webhookCallback } from "grammy";
import { BLACKLIST_WORDS, userWarnings } from "@/lib/blacklist";
import { InlineKeyboard } from "grammy";
import { activeGames } from "@/lib/gameStore";
import { waitUntil } from "@vercel/functions";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing");

const bot = new Bot(token);

// ช่วยแปลงวินาทีเป็นข้อความสุ่มเวลารูปแบบ HH:mm
function getRandomTime(): string {
  const hours = Math.floor(Math.random() * 24).toString().padStart(2, "0");
  const minutes = Math.floor(Math.random() * 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

// -------------------------------------------------------------
// ข้อ 2: คำสั่ง /random สุ่มเวลา 00:00 - 23:59
// -------------------------------------------------------------
bot.command("random", async (ctx) => {
  const randomTime = getRandomTime();
  await ctx.reply(`เวลาที่สุ่มได้: ${randomTime}`, {
    reply_to_message_id: ctx.message?.message_id,
  });
});

// -------------------------------------------------------------
// ข้อ 3: คำสั่ง /vs @user2
// -------------------------------------------------------------
bot.command("vs", async (ctx) => {
  const messageText = ctx.message?.text || "";
  const match = messageText.match(/\/vs\s+@?(\w+)/);
  
  if (!match) {
    await ctx.reply("⚠️ กรุณาระบุคู่ท้าทายด้วย เช่น <code>/vs @username</code>", { parse_mode: "HTML" });
    return;
  }

  const targetUsername = match[1];
  const user1 = ctx.from;
  if (!user1) return;

  const user1Name = user1.username ? `@${user1.username}` : user1.first_name;
  const gameId = `game_${Date.now()}_${user1.id}`;
  const webAppUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.vercel.app"}?gameId=${gameId}`;

  // สร้าง Session เกมใหม่
  const gameSession = {
    id: gameId,
    chatId: ctx.chat.id,
    user1: { id: user1.id, username: user1Name, accepted: true },
    user2: { id: 0, username: `@${targetUsername}`, accepted: false },
    status: "waiting_accept" as const,
    createdAt: Date.now(),
  };

  activeGames.set(gameId, gameSession);

  // ตั้งเวลาถอยหลัง 60 วินาที ถ้า User2 ไม่กดยอมรับ ให้ยกเลิกเกม
  waitUntil(
    new Promise((resolve) => {
      setTimeout(async () => {
        const game = activeGames.get(gameId);
        if (game && !game.user2.accepted) {
          activeGames.delete(gameId);
          try {
            await ctx.api.sendMessage(
              ctx.chat.id,
              `คำท้าจาก ${user1Name} ถึง @${targetUsername} หมดเวลาแล้ว (ไม่มีการตอบรับใน 60 วินาที)`
            );
          } catch (_) {}
        }
        resolve(true);
      }, 60000);
    })
  );

  // สร้างปุ่มกดเปิด Mini App
  const keyboard = new InlineKeyboard().webApp(
    "เข้าเกม",
    webAppUrl
  );

  // ส่งข้อความโดยใช้ HTML เพื่อหลีกเลี่ยง Error จากเครื่องหมาย _ ในชื่อ User
  await ctx.reply(
    `<b>ดวล!</b>\n🥊 ${user1Name} ท้า @${targetUsername}\n\n@${targetUsername} ต้องกดปุ่มยอมรับภายใน 60 วินาที!`,
    {
      reply_markup: keyboard,
      parse_mode: "HTML",
    }
  );
});

// -------------------------------------------------------------
// จัดการข้อความทั้งหมดในกลุ่ม (ข้อ 1 และ ข้อ 4)
// -------------------------------------------------------------
bot.on("message", async (ctx) => {
  const message = ctx.message;
  const chatId = ctx.chat.id;
  const userId = ctx.from?.id;
  const username = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name || "User";

  if (!userId) return;

  const text = message.text || message.caption || "";

  // 1. ตรวจสอบ ลิงก์ / Forward Message / คำต้องห้าม (ข้อ 1)
  const hasLink = message.entities?.some((e) => e.type === "url" || e.type === "text_link") || text.includes("http://") || text.includes("https://");
  
  // ตรวจสอบ Forward Message แบบรองรับทุกเวอร์ชันของ Telegram API
  const isForwarded = Boolean(
    message.forward_origin ||
    (message as any).forward_from ||
    (message as any).forward_from_chat
  );
  
  const hasBlacklistWord = BLACKLIST_WORDS.some((word) => text.toLowerCase().includes(word.toLowerCase()));

  if (hasLink || isForwarded || hasBlacklistWord) {
    // ลบข้อความสแปมทันที
    try {
      await ctx.deleteMessage();
    } catch (err) {
      console.error("Failed to delete message:", err);
    }

    // คำนวณนับจำนวนการเตือน (1/3, 2/3, 3/3)
    const key = `${userId}_${chatId}`;
    const currentWarnings = (userWarnings.get(key) || 0) + 1;
    userWarnings.set(key, currentWarnings);

    if (currentWarnings >= 3) {
      // เตะออกจากกลุ่ม
      try {
        await ctx.banChatMember(userId);
        await ctx.reply(`🚫 ${username} ผิดกฎครบ 3/3 ครั้ง`);
        userWarnings.delete(key);
      } catch (err) {
        await ctx.reply(`⚠️ ไม่สามารถลบ ${username} ออกได้ (บอทอาจไม่มีสิทธิ์ Admin)`);
      }
    } else {
      // แจ้งเตือนสแปม
      let reason = "คำต้องห้าม";
      if (hasLink) reason = "ไม่อนุญาตให้ส่งลิงก์";
      if (isForwarded) reason = "ไม่อนุญาตให้ Forward ข้อความ";

      await ctx.reply(`⚠️ ${username} ข้อความของคุณถูกลบเนื่องจาก: ${reason} (${currentWarnings}/3)`);
    }
    return;
  }

  // 2. ตรวจสอบ รูปภาพ / GIF / วิดีโอ (ข้อ 4)
  const isMedia = Boolean(message.photo || message.animation || message.video);

  if (isMedia) {
    try {
      // ส่งข้อความ reply เตือนผู้ใช้
      const warningMsg = await ctx.reply(
        `📌 ${username} ข้อความสื่อนี้จะถูกลบอัตโนมัติภายใน 30 วินาที`,
        { reply_to_message_id: message.message_id }
      );

      // ใช้ waitUntil เพื่อให้ Vercel Serverless นับเวลาลบสื่อ 30 วินาทีต่อจนเสร็จสมบูรณ์
      waitUntil(
        new Promise((resolve) => {
          setTimeout(async () => {
            try {
              await ctx.api.deleteMessage(chatId, message.message_id);
            } catch (_) {}
            try {
              await ctx.api.deleteMessage(chatId, warningMsg.message_id);
            } catch (_) {}
            resolve(true);
          }, 30000);
        })
      );
    } catch (err) {
      console.error("Error handling media delete:", err);
    }
  }
});

// Export POST API handler สำหรับ Vercel Serverless
export const POST = webhookCallback(bot, "std/http");