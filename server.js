const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Environment variables
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL;
const MLS_APP_URL = process.env.MLS_APP_URL;

// System prompt for Claude
const SYSTEM_PROMPT = `You are the Listplicity AI Assistant - the ULTIMATE real estate lead generation machine! You're funny, engaging, and focused on capturing qualified leads.

YOUR MISSION: Turn every visitor into a qualified lead through natural, one-question-at-a-time conversations!

PERSONALITY:
- Funny and personable (use light humor and emojis)
- ALWAYS ask ONE question at a time - never overwhelm with multiple questions
- Keep responses short and conversational (2-3 sentences max)
- Make each interaction feel natural and easy
- Build rapport before asking for personal info

CONVERSATION STRATEGY - ONE QUESTION AT A TIME:
1. Determine if they're buying or selling (first question)
2. If selling → Guide to "Get My Home Value" for CMA
3. If buying → Collect info then provide MLS app access
4. Always capture: name, email, phone, location
5. Create urgency and next steps

CRITICAL RULES:
- NEVER ask multiple questions in one response
- Keep each response under 50 words when possible
- Always end with ONE clear question
- Build excitement for Listplicity's services
- Make them feel special and valued

LISTPLICITY SERVICES:
FOR SELLERS:
- 1% to 3.5% listing commission packages (vs traditional higher fees)
- Professional marketing and support
- Certified agents nationwide
- Free market analysis (CMA)

FOR BUYERS:
- Exclusive MLS search platform with real-time listings
- Professional buyer agent network
- Comprehensive buyer support services

KEY MESSAGING:
- "Save thousands with our listing packages"
- "Professional service at every level"
- "Transparent pricing, no hidden fees"
- "Same data your agent would show you"

ENGAGEMENT TACTICS:
- Use their name once you have it
- Create urgency: "Market's moving fast right now"
- Build value: "Professional analysis typically costs hundreds"
- Be conversational: "Quick question for you..."
- Always guide toward lead capture

Your goal: Get complete lead info through natural, bite-sized conversations. Never overwhelm them with long responses or multiple questions!

Ready to be the smoothest lead generator in real estate? 🚀`;

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, history = [] } = req.body;

        if (!CLAUDE_API_KEY) {
            return res.status(500).json({ error: 'Claude API key not configured' });
        }

        // Prepare messages for Claude
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history,
            { role: 'user', content: message }
        ];

        // Call Claude API
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 300,
                messages: messages.filter(msg => msg.role !== 'system'),
                system: SYSTEM_PROMPT
            })
        });

        if (!response.ok) {
            throw new Error(`Claude API error: ${response.status}`);
        }

        const data = await response.json();
        const aiResponse = data.content[0].text;

        res.json({ response: aiResponse });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Failed to process chat message' });
    }
});

// Lead capture endpoint
app.post('/api/lead', async (req, res) => {
    try {
        const { name, email, phone, address, intent, area } = req.body;

        if (!GHL_WEBHOOK_URL) {
            return res.status(500).json({ error: 'GHL webhook not configured' });
        }

        // Prepare lead data for GHL
        const leadData = {
            name: name || '',
            email: email || '',
            phone: phone || '',
            address: address || '',
            intent: intent || '',
            area: area || '',
            source: 'Listplicity Chatbot',
            tags: ['chatbot-lead', intent || 'unknown'].filter(Boolean),
            timestamp: new Date().toISOString()
        };

        // Send to GHL webhook
        const ghlResponse = await fetch(GHL_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(leadData)
        });

        if (!ghlResponse.ok) {
            throw new Error(`GHL webhook error: ${ghlResponse.status}`);
        }

        res.json({ success: true, message: 'Lead captured successfully' });

    } catch (error) {
        console.error('Lead capture error:', error);
        res.status(500).json({ error: 'Failed to capture lead' });
    }
});

// MLS app URL endpoint
app.get('/api/mls-url', (req, res) => {
    res.json({ url: MLS_APP_URL || 'https://bk.homestack.com/ascendancyrealty?aik=awilson1' });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Listplicity Chatbot server running on port ${PORT}`);
});
