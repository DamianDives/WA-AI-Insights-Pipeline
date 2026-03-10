import express from "express";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

async function runAIExtraction(sessionId: string, retryCount = 0) {
  const MAX_RETRIES = 2;
  const startTime = Date.now();

  try {
    const session = await prisma.conversationSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) return;

    // Fetch messages manually to avoid the 'messages' relation sync error
    const messages = await prisma.whatsAppMessageRaw.findMany({
      where: { chat_id: session.chat_id },
      take: 15,
      orderBy: { received_at: 'desc' }
    });

    const chatHistory = messages.reverse()
      .map(m => `${m.from_phone}: ${m.text || "[Media]"}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125",
      messages: [
        {
          role: "system",
          content: "Extract structured insights: summary, key_points (array), action_items (array), entities (object)."
        },
        { role: "user", content: chatHistory }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    const latency = Date.now() - startTime;

    // Use dynamic property access to handle casing (AiSessionExtract vs aiSessionExtract)
    const extractModel = (prisma as any).aiSessionExtract || (prisma as any).AiSessionExtract;

    await extractModel.upsert({
      where: { session_id: sessionId },
      update: {
        summary: result.summary || "",
        key_points: JSON.stringify(result.key_points || []),
        action_items: JSON.stringify(result.action_items || []),
        entities: JSON.stringify(result.entities || {}),
        latency_ms: latency,
        token_usage: completion.usage?.total_tokens || 0
      },
      create: {
        session_id: sessionId,
        summary: result.summary || "",
        key_points: JSON.stringify(result.key_points || []),
        action_items: JSON.stringify(result.action_items || []),
        entities: JSON.stringify(result.entities || {}),
        model_name: "gpt-3.5-turbo-0125",
        latency_ms: latency,
        token_usage: completion.usage?.total_tokens || 0
      }
    });

    console.log(`🤖 AI Extraction successful for session: ${sessionId}`);
  } catch (error: any) {
    console.error(`❌ AI Extraction failed:`, error.message);
    if (retryCount < MAX_RETRIES && !error.message.includes("quota")) {
      setTimeout(() => runAIExtraction(sessionId, retryCount + 1), 2000);
    }
  }
}

app.get("/webhook/whatsapp", (req, res) => {
  const verifyToken = "my_secret_token_123";
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === verifyToken) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

app.post("/webhook/whatsapp", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const message = entry?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const chatId = message.from;

    const rawMsg = await prisma.whatsAppMessageRaw.upsert({
      where: { provider_message_id: message.id },
      update: {}, 
      create: {
        provider_message_id: message.id,
        from_phone: message.from,
        chat_id: chatId,
        chat_type: "individual",
        message_type: message.type,
        text: message.text?.body || null,
        raw_payload: JSON.stringify(req.body),
      },
    });

    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    let session = await prisma.conversationSession.findFirst({
      where: { chat_id: chatId, session_end: { gte: thirtyMinsAgo } },
    });

    if (session) {
      session = await prisma.conversationSession.update({
        where: { id: session.id },
        data: { session_end: new Date(), message_count: { increment: 1 } },
      });
    } else {
      session = await prisma.conversationSession.create({
        data: { chat_id: chatId, chat_type: "individual" },
      });
    }

    // Attempt to link if model exists, but don't block the AI flow
    const linkModel = (prisma as any).sessionMessage || (prisma as any).SessionMessage;
    if (linkModel) {
      try {
        await linkModel.create({
          data: { session_id: session.id, raw_message_id: rawMsg.id }
        }).catch(() => {});
      } catch (e) {}
    }

    runAIExtraction(session.id).catch(console.error);
    res.sendStatus(200);
  } catch (error: any) {
    console.error("Webhook Error:", error.message);
    res.sendStatus(200); 
  }
});

app.get("/sessions", async (req, res) => {
  const sessions = await prisma.conversationSession.findMany({
    orderBy: { session_start: 'desc' }
  });
  res.json(sessions);
});

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 SERVER LIVE ON PORT ${PORT}`);
});