require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 1. DATABASE SETUP (Upgraded with Threading)
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Added thread_id and message_id columns to maintain Gmail threads
pool.query(`
  DROP TABLE IF EXISTS emails;
  CREATE TABLE IF NOT EXISTS emails (
    id SERIAL PRIMARY KEY,
    sender VARCHAR(255),
    subject TEXT,
    snippet TEXT,
    ai_draft TEXT,
    status VARCHAR(50) DEFAULT 'Pending Approval',
    thread_id VARCHAR(255),
    message_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`).then(() => console.log('✅ PostgreSQL Database Ready'))
  .catch(err => console.error('❌ DB Error:', err));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

async function getAuthClient() {
  const content = await fs.readFile(TOKEN_PATH);
  return google.auth.fromJSON(JSON.parse(content));
}

// ==========================================
// FEATURE A: ADVANCED AI CONTEXT & SYNC
// ==========================================
app.get('/sync-emails', async (req, res) => {
  try {
    const auth = await getAuthClient();
    const gmail = google.gmail({ version: 'v1', auth });

    // 1. Fetch Top Unread Email
    const response = await gmail.users.messages.list({ userId: 'me', q: 'is:unread', maxResults: 1 });
    if (!response.data.messages || response.data.messages.length === 0) {
    return res.status(200).json({ message: "No new emails to sync." });
}
    const msg = await gmail.users.messages.get({ 
        userId: 'me', id: response.data.messages[0]?.id, format: 'metadata', 
        metadataHeaders: ['Subject', 'From', 'Message-ID'] 
    });
    
    const headers = msg.data.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
    const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
    const messageId = headers.find(h => h.name === 'Message-ID')?.value || '';
    const threadId = msg.data.threadId;
    const snippet = msg.data.snippet;

    // 2. Fetch User's Sent Emails for "Style Learning"
    console.log('Fetching past context to match your style...');
    const sentResponse = await gmail.users.messages.list({ userId: 'me', q: 'in:sent', maxResults: 3 });
    let styleContext = "Professional and concise."; // Default fallback
    
    if (sentResponse.data.messages) {
       const sentMsgs = await Promise.all(sentResponse.data.messages.map(m => 
           gmail.users.messages.get({ userId: 'me', id: m.id, format: 'minimal' })
       ));
       const snippetsArray = sentMsgs.map(m => m.snippet);
styleContext = "Here are snippets of how I usually reply:\n" + snippetsArray.join('\n');
     }
    // 3. Generate Advanced Context Draft
    console.log('Generating AI Draft...');
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `You are an AI assistant drafting an email reply. 
    Match the tone of my past sent emails: ${styleContext}
    
    Draft a polite reply to this incoming email:
    From: ${from}
    Subject: ${subject}
    Message: ${snippet}`;

    const aiResult = await model.generateContent(prompt);

if (!aiResult || !aiResult.response) {
    throw new Error("Failed to generate content from AI model.");
}

const draftText = aiResult.response.text();

    // 4. Save to PostgreSQL
    const insertQuery = `INSERT INTO emails (sender, subject, snippet, ai_draft, status, thread_id, message_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;`;
    const dbResult = await pool.query(insertQuery, [from, subject, snippet, draftText, 'Pending Approval', threadId, messageId]);

    res.status(200).json({ message: 'Synced with Advanced AI Context!', data: dbResult.rows[0] });
} catch (error) { res.status(500).json({ error: error.message }); }
}); 

// ==========================================
// FEATURE B: REVIEW & APPROVAL APIs
// ==========================================
// View all drafts waiting for approval
app.get('/drafts', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM emails WHERE status = 'Pending Approval'");
        res.status(200).json(result.rows);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Approve, Edit, or Reject a draft
app.put('/drafts/:id', async (req, res) => {
    try {
        const { status, edited_draft } = req.body; 
        // Updates status (e.g. 'Approved') and optionally replaces the AI draft with human edits
        const result = await pool.query(
            "UPDATE emails SET status = $1, ai_draft = COALESCE($2, ai_draft) WHERE id = $3 RETURNING *",
            [status, edited_draft, req.params.id]
        );
        res.status(200).json({ message: `Draft marked as ${status}`, data: result.rows[0] });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// FEATURE C: REPLY SENDING API (Gmail API)
// ==========================================
app.post('/drafts/:id/send', async (req, res) => {
    try {
        // 1. Verify draft is Approved
        const dbResult = await pool.query("SELECT * FROM emails WHERE id = $1 AND status = 'Approved'", [req.params.id]);
        if (dbResult.rows.length === 0) return res.status(400).json({ error: 'Draft not found or not approved.' });
        const emailData = dbResult.rows[0];

        // 2. Format RFC 2822 Email String (Required by Gmail API for Threading)
        const emailContent = [
            `To: ${emailData.sender}`,
            `Subject: Re: ${emailData.subject.replace('Re: ', '')}`,
            `In-Reply-To: ${emailData.message_id}`,
            `References: ${emailData.message_id}`,
            `Content-Type: text/plain; charset=utf-8`,
            '',
            emailData.ai_draft
        ].join('\n');

        // Encode to base64url format
        const base64EncodedEmail = Buffer.from(emailContent)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

        // 3. Send via Gmail
        const auth = await getAuthClient();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: base64EncodedEmail,
                threadId: emailData.thread_id // Keeps the reply in the same email chain!
            }
        });

        // 4. Update DB status to Sent
        await pool.query("UPDATE emails SET status = 'Sent' WHERE id = $1", [req.params.id]);

        res.status(200).json({ message: 'Email sent successfully and thread maintained!' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

const PORT = 3000;
// Only listen if we run this directly (node index.js)
// Do NOT listen if the test script is running it
if (require.main === module) {
    app.listen(PORT, () => console.log(`🚀 Complete Server running on http://localhost:${PORT}`));
}

// Export the app and database pool so the test script can control them
module.exports = { app, pool };
