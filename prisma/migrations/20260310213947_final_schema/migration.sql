-- CreateTable
CREATE TABLE "WhatsAppMessageRaw" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider_message_id" TEXT NOT NULL,
    "received_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "from_phone" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "chat_type" TEXT NOT NULL,
    "sender_name" TEXT,
    "message_type" TEXT NOT NULL,
    "text" TEXT,
    "raw_payload" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chat_id" TEXT NOT NULL,
    "chat_type" TEXT NOT NULL,
    "session_start" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_end" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message_count" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "AiSessionExtract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "key_points" TEXT NOT NULL,
    "action_items" TEXT NOT NULL,
    "entities" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "latency" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiSessionExtract_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ConversationSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FailedJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "job_type" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "error_message" TEXT NOT NULL,
    "error_payload" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessageRaw_provider_message_id_key" ON "WhatsAppMessageRaw"("provider_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "AiSessionExtract_session_id_key" ON "AiSessionExtract"("session_id");
