# Listplicity Conversational Funnel (Chatbot)

Front-and-center chatbot for desktop, full-screen on mobile. Captures buyer/seller details and pushes to Go High Level via an inbound webhook.

## Quick Start (Render - Direct Upload)
1. Create **Web Service → Manual Deploy → Direct Upload** on Render.
2. Upload this ZIP.
3. **Runtime:** Node | **Build:** `npm install` | **Start:** `npm start`
4. Add env var `GHL_WEBHOOK_URL` with your GHL inbound webhook URL.
5. Deploy. Copy your Render URL (e.g., https://listplicity-chatbot.onrender.com).

## Add to GHL Funnel/Page
- Paste the HTML overlay from `index.html` into a **Custom HTML** block.
- Paste `styles.css` inside a **Custom Code** block wrapped with `<style>...</style>`.
- Paste `chat-widget.js` inside a **Custom Code** block wrapped with `<script>...</script>`.
- In `chat-widget.js`, change `fetch('/api/lead'...)` to your Render URL + `/api/lead`.

