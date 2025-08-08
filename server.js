import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

app.get('/api/health', (_req,res)=>res.json({ok:true, service:'listplicity-chatbot'}));

app.post('/api/lead', async (req, res) => {
  const webhook = process.env.GHL_WEBHOOK_URL;
  if (!webhook) return res.status(500).json({ ok:false, error: 'Webhook not configured' });
  try {
    const payload = req.body || {};
    await fetch(webhook, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('Lead forward failed:', e);
    res.status(500).json({ ok:false, error:'forward_failed' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
