// server.js — Listplicity Chatbot (full file)

// --- Imports & setup ---
import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

// --- CORS: allow your GHL page to call this API ---
app.use((req, res, next) => {
  // You can lock this to your GHL domain if you want
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// --- Healthcheck ---
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'listplicity-chatbot', llm: !!(process.env.LLM_ENABLED === 'true') });
});

// --- Lead forwarder to GHL (keep your existing webhook as-is) ---
app.post('/api/lead', async (req, res) => {
  const webhook = process.env.GHL_WEBHOOK_URL;
  if (!webhook) return res.status(500).json({ ok: false, error: 'Webhook not configured (GHL_WEBHOOK_URL)' });

  try {
    const payload = {
      source: 'listplicity-chatbot',
      ...req.body,
      ts: new Date().toISOString(),
    };

    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!r.ok) throw new Error(`GHL forward failed: ${r.status}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('Lead forward failed:', e);
    res.status(500).json({ ok: false, error: 'forward_failed' });
  }
});

// --- Smart chat endpoint (LLM-powered) ---
app.post('/api/chat', async (req, res) => {
  if (process.env.LLM_ENABLED !== 'true') {
    return res.json({
      intent: 'collect_info',
      bot_text: 'Smart mode is off. Set LLM_ENABLED=true in Render.',
      state_patch: {},
      action: null,
    });
  }

  const { history = [], state = {} } = req.body || {};

  const systemPrompt = `
You are the Listplicity Real Estate Assistant.
Tone: confident, warm, professional, but conversational.

Primary goals:
1) Hold a friendly conversation about buying, selling, or both.
2) Always work toward gathering these lead fields: 
   path(sell|buy|both), state, address, sell_timeline, buy_area, buy_budget, 
   buy_preapproval(yes|no|unsure), name, email, phone.
3) Once all required fields are collected, set action="submit" and confirm briefly.

Special instructions for 1% Listing (Limited Services):
- If user asks about 1% listing, explain it's a Limited Services Listing and not for everyone.
- Do NOT give full details in chat. Encourage booking a quick call or provide phone for a quick review.
- Example: "It can save you money, but it depends on your situation. A 10-minute call is best—what’s the best number and a good time?"

Buyer flow (collect-first, then link):
- If user is buying or asks for MLS access, acknowledge we have a free MLS-connected app (iOS & Android) but do not paste the link immediately.
- First ask two qualifiers: preferred areas/school zones and price range.
- Then collect contact:
  - Ask for name.
  - Ask for email.
  - Ask for phone with this value hook: "I’ll text you the app link and set up instant alerts."
- Once phone is provided, you may include the link (https://tinyurl.com/3cjtjupn) and say you’ll text it; set tag "MLS Link Request".
- Continue collecting missing fields (timeline, preapproval). Keep replies short; always finish with the next needed question.
- If the user insists on the link before sharing info, share it but still ask for at least one contact method and a next step.

Handling questions:
- Real estate questions (laws, timelines, processes, market): answer accurately for their state, then pivot back to next missing field.
- Off-topic: acknowledge briefly and return to real estate.
- Urgent/safety/legal: suggest human handoff; ask best phone/email.
- Validate email/phone; if invalid, politely re-ask.

Output strict JSON:
{
  "intent": "collect_info|relevant_question|off_topic|handoff",
  "bot_text": "string",
  "state_patch": { /* optional: { path, answers:{...}, tag:"..." } */ },
  "action": null | "submit"
}
`.trim();

  // Helper: extract text from OpenAI Responses API (covers a few shapes)
  const getModelText = (data) => {
    // Newer Responses API sometimes provides output_text
    if (data?.output_text) return data.output_text;
    // Or content array
    const maybe = data?.output?.[0]?.content?.[0]?.text;
    if (typeof maybe === 'string') return maybe;
    // Or top-level choices/message (fallback)
    return '';
  };

  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify({ history, state }) },
        ],
      }),
    });

    const data = await r.json();
    const text = getModelText(data) || '{}';
    let out;
    try {
      out = JSON.parse(text);
    } catch {
      out = { intent: 'collect_info', bot_text: 'Sorry, I had a hiccup.', state_patch: {}, action: null };
    }
    // Ensure minimal shape
    if (!out || typeof out !== 'object') {
      out = { intent: 'collect_info', bot_text: 'Sorry, I had a hiccup.', state_patch: {}, action: null };
    }
    res.json(out);
  } catch (e) {
    console.error('LLM error:', e);
    res.status(500).json({
      intent: 'collect_info',
      bot_text: 'I hit a snag. Mind trying again?',
      state_patch: {},
      action: null,
    });
  }
});

// --- (Optional) serve static demo if you uploaded index.html etc. ---
/*
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(__dirname));
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
*/

// --- Start server ---
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listplicity server running on :${port}`));
