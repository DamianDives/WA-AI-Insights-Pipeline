import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();
const openai = new OpenAI(); // Automatically uses process.env.OPENAI_API_KEY

export async function runAIExtraction(sessionId: string) {
  try {
    // 1. Get all messages for this session
    const session = await prisma.conversationSession.findUnique({ where: { id: sessionId } });
    const messages = await prisma.whatsAppMessageRaw.findMany({
      where: { chat_id: session?.chat_id }
    });

    const transcript = messages.map(m => `${m.sender_name}: ${m.text}`).join('\n');

    // 2. Call OpenAI
    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125",
      response_format: { type: "json_object" },
      messages: [
        { 
          role: "system", 
          content: "Return JSON with: summary (string), key_points (array), action_items (array), entities (object with people, dates, locations)." 
        },
        { role: "user", content: `Analyze this WhatsApp chat:\n${transcript}` }
      ]
    });

    const data = JSON.parse(response.choices[0].message.content || '{}');

    // 3. Store the result
    await prisma.aiSessionExtract.upsert({
      where: { session_id: sessionId },
      update: { summary: data.summary },
      create: {
        session_id: sessionId,
        summary: data.summary,
        key_points: JSON.stringify(data.key_points),
        action_items: JSON.stringify(data.action_items),
        entities: JSON.stringify(data.entities),
        model: "gpt-3.5-turbo",
        latency: Date.now() - startTime
      }
    });
    console.log(`✅ AI Extraction complete for session ${sessionId}`);
  } catch (error: any) {
    console.error("❌ AI Error:", error.message);
    await prisma.failedJob.create({
      data: { job_type: 'extract', session_id: sessionId, error_message: error.message }
    });
  }
}