// server.js — Listplicity Chatbot (Chat Completions, Warm Welcome, Static Hosting)

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(express.json());

// ---------- CORS (you can lock this to your domain later) ----------
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // e.g. 'https://listplicity.com'
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ---------- Healthcheck ----------
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'listplicity-chatbot',
    llm: process.env.LLM_ENABLED === 'true',
  });
});

// ---------- Lead forwarder to GHL ----------
app.post('/api/lead', async (req, res) => {
  const webhook = process.env.GHL_WEBHOOK_URL;
  if (!webhook) return res.status(500).json({ ok: false, error: 'Missing GHL_WEBHOOK_URL' });

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

// ---------- Warm Welcome (instant message for UI on first load) ----------
app.get('/api/welcome', (_req, res) => {
  res.json({
    intent: 'welcome',
    bot_text: `Hi there, and welcome to Listplicity! 👋
Thanks so much for stopping by. Whether you're buying, selling, or just exploring your options, I'm here to help.
Ask me anything about real estate — from our 1% Listing (Limited Services) to finding your dream home on the MLS.
So… what brings you here today?`,
    state_patch: {},
    action: null,
  });
});

// ---------- Smart chat (LLM) — Chat Completions JSON mode ----------
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
Tone: confident, warm, professional, conversational.

Primary goals:
1) Hold a friendly conversation about buying, selling, or both.
2) Always work toward gathering fields: path(sell|buy|both), state, address, sell_timeline,
   buy_area, buy_budget, buy_preapproval(yes|no|unsure), name, email, phone.
3) When required fields are present, set action="submit" and confirm briefly.

1% Listing (Limited Services):
- If asked, explain it's a Limited Services Listing and not for everyone.
- Do NOT give full details in chat. Encourage a quick call or phone # to review their situation.
- Example: "It can save you money, but it depends on your situation. A 10-minute call is best—what’s the best number and a good time?"

Buyer flow (collect-first, then link):
- If buying or asking for MLS: acknowledge an MLS-connected app exists (iOS & Android) but do not paste the link immediately.
- Ask two qualifiers first: preferred areas/school zones and price range.
- Then collect: name, email, phone ("I’ll text you the app link and set up instant alerts.").
- After phone, you may include the link (https://tinyurl.com/3cjtjupn) and set tag "MLS Link Request".
- Continue collecting timeline + preapproval. If they insist on the link first, share it but still ask for at least one contact method.

Handling:
- Answer state-specific RE questions briefly, then pivot to the next missing field.
- Off-topic: acknowledge briefly and return to real estate.
- Urgent/safety/legal: suggest human handoff; ask best phone/email.
- Validate email/phone; if invalid, politely re-ask.

Return strict JSON only:
{ "intent": "collect_info|relevant_question|off_topic|handoff",
  "bot_text": "string",
  "state_patch": { /* eg { path, answers:{...}, tag } */ },
  "action": null | "submit" }`.trim();

  const msgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: JSON.stringify({
        history: Array.isArray(history) ? history.slice(-12) : [],
        state
      })
    }
  ];

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        response_format: { type: 'json_object' }, // JSON mode for structured output
        messages: msgs,
        temperature: 0.3
      })
    });

    if (!r.ok) {
      const txt = await r.text().catch(()=> '');
      console.error('OpenAI error:', r.status, txt);
      return res.status(500).json({
        intent: 'collect_info',
        bot_text: 'I had trouble reaching my brain—mind trying again?',
        state_patch: {},
        action: null
      });
    }

    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content || '{}';

    let out;
    try { out = JSON.parse(text); }
    catch {
      out = { intent: 'collect_info', bot_text: 'Sorry, hiccup. Could you rephrase that?', state_patch: {}, action: null };
    }
    if (!out || typeof out !== 'object') {
      out = { intent: 'collect_info', bot_text: 'Sorry, hiccup. Could you rephrase that?', state_patch: {}, action: null };
    }
    return res.json(out);
  } catch (e) {
    console.error('LLM exception:', e);
    return res.status(500).json({
      intent: 'collect_info',
      bot_text: 'I hit a snag. Mind trying again?',
      state_patch: {},
      action: null
    });
  }
});

// ---------- Static hosting (so / shows your chat page) ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

app.use(express.static(__dirname)); // serves index.html, css, js placed at repo root
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------- Start ----------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listplicity server running on :${port}`));
