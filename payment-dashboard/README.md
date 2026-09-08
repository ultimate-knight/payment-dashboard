# Payment Status Dashboard — with backend + GST receipts

Same dashboard you had, but now backed by a tiny Node/Express server instead of
the browser's localStorage. That means the data is the same no matter which
phone/laptop opens the page — everyone hits the same server.

## What changed
- **Backend (`server.js`)** — a small Express API that reads/writes `data.json`
  on disk. Endpoints: add/delete candidates, add/delete recruiters, record a
  payment, and fetch a GST receipt for any candidate.
- **Frontend (`public/index.html`)** — same look and charts, but now calls the
  API instead of localStorage. Every device that opens it sees the same data.
- **Receipt generator** — tap "🧾 Receipt" next to any candidate. It shows a
  printable receipt with an **18% GST breakup (9% CGST + 9% SGST)**, using
  your 3DWebSoft Foundation letterhead (CIN/GSTIN from your dashboard). "Print
  / Save PDF" opens the browser's print dialog — choose "Save as PDF" to get
  a file.

## Run it locally
```bash
cd payment-dashboard
npm install
npm start
```
Open **http://localhost:3000** — that's it, frontend and backend are served
from the same place.

`data.json` is the database. It's seeded with your existing 37 candidates. Back
it up occasionally (copy the file) since it's just a file on disk.

## Make it work "from any device" (not just your laptop)
Right now it only works on devices on the same machine/network as wherever you
run `npm start`. To actually access it from your phone, teammates' laptops,
etc., you need to deploy the server somewhere reachable on the internet — a
few free options:

1. **Render.com** (easiest, free tier) — push this folder to a GitHub repo,
   create a new "Web Service" on Render pointing at it, build command
   `npm install`, start command `npm start`. Render gives you a public URL
   like `https://your-app.onrender.com` — open that from any phone or laptop.
2. **Railway.app** — similar one-click deploy from a GitHub repo.
3. **Replit / Glitch** — paste the files in, hit run, get a public URL
   instantly (good for a quick test, free tiers sleep when idle).

⚠️ Free tiers on Render/Railway "sleep" after inactivity — the first request
after a while takes ~20–30s to wake up. Fine for internal tools like this.

Once deployed, if you ever split the frontend and backend (host them on
different URLs), set the `API` constant near the top of the `<script>` in
`public/index.html` to your backend's URL, e.g.
`const API = 'https://your-app.onrender.com';`.

## Data model
`data.json`:
```json
{
  "students": [
    { "id": "...", "recruiter": "Abhinaya", "name": "Gowthami", "fee": 5000, "paid": 2000, "pending": 3000, "createdAt": "..." }
  ],
  "recruiters": ["Abhinaya", "Ameena", ...]
}
```
`fee` is treated as **GST-inclusive** (₹5,000 total, not +18% on top) — the
receipt backs out the taxable value and GST from that total. If your actual
fee should be ₹5,000 **plus** 18% GST on top, tell me and I'll flip the
calculation.
