const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = 'payment_dashboard_db';
const USE_REDIS = !!(REDIS_URL && REDIS_TOKEN);

const DB_FILE = path.join(__dirname, 'data.json');
const EMPTY_DB = { students: [], recruiters: [] };

async function redisCommand(pathSegments) {
  const url = REDIS_URL + '/' + pathSegments.map(encodeURIComponent).join('/');
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + REDIS_TOKEN } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('Upstash error (' + res.status + '): ' + text);
  }
  const data = await res.json();
  return data.result;
}

async function loadDB() {
  if (USE_REDIS) {
    const raw = await redisCommand(['get', REDIS_KEY]);
    if (!raw) {
      await redisCommand(['set', REDIS_KEY, JSON.stringify(EMPTY_DB)]);
      return { ...EMPTY_DB };
    }
    try { return JSON.parse(raw); }
    catch (e) { throw new Error('Stored data is corrupted: ' + e.message); }
  }
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(EMPTY_DB, null, 2));
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

async function saveDB(db) {
  if (USE_REDIS) {
    await redisCommand(['set', REDIS_KEY, JSON.stringify(db)]);
    return;
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message || 'Something went wrong on the server' });
    }
  };
}

app.get('/api/data', handle(async (req, res) => {
  res.json(await loadDB());
}));

app.post('/api/students', handle(async (req, res) => {
  const db = await loadDB();
  const { recruiter, name, fee, paid } = req.body;
  if (!recruiter || !String(name || '').trim()) {
    return res.status(400).json({ error: 'recruiter and name are required' });
  }
  const feeN = Number(fee) > 0 ? Number(fee) : 5000;
  const paidN = Math.min(Number(paid) || 0, feeN);
  const student = {
    id: 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    recruiter,
    name: String(name).trim(),
    fee: feeN,
    paid: paidN,
    pending: feeN - paidN,
    createdAt: new Date().toISOString()
  };
  db.students.push(student);
  if (!db.recruiters.includes(recruiter)) db.recruiters.push(recruiter);
  await saveDB(db);
  res.json(student);
}));

app.patch('/api/students/:id/payment', handle(async (req, res) => {
  const db = await loadDB();
  const st = db.students.find(s => s.id === req.params.id);
  if (!st) return res.status(404).json({ error: 'candidate not found' });
  const addAmt = Number(req.body.amount) || 0;
  st.paid = Math.min(st.fee, Math.max(0, st.paid + addAmt));
  st.pending = st.fee - st.paid;
  await saveDB(db);
  res.json(st);
}));

app.delete('/api/students/:id', handle(async (req, res) => {
  const db = await loadDB();
  db.students = db.students.filter(s => s.id !== req.params.id);
  await saveDB(db);
  res.json({ ok: true });
}));

app.post('/api/recruiters', handle(async (req, res) => {
  const db = await loadDB();
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'recruiter name required' });
  if (!db.recruiters.includes(name)) db.recruiters.push(name);
  await saveDB(db);
  res.json({ ok: true });
}));

app.delete('/api/recruiters/:name', handle(async (req, res) => {
  const db = await loadDB();
  const name = decodeURIComponent(req.params.name);
  db.recruiters = db.recruiters.filter(r => r !== name);
  db.students = db.students.filter(s => s.recruiter !== name);
  await saveDB(db);
  res.json({ ok: true });
}));

app.get('/api/receipt/:id', handle(async (req, res) => {
  const db = await loadDB();
  const st = db.students.find(s => s.id === req.params.id);
  if (!st) return res.status(404).json({ error: 'candidate not found' });

  const GST_RATE = 0.18;
  const round2 = n => Math.round(n * 100) / 100;
  const taxableTotal = round2(st.fee / (1 + GST_RATE));
  const gstTotal = round2(st.fee - taxableTotal);
  const taxablePaid = round2(st.paid / (1 + GST_RATE));
  const gstPaid = round2(st.paid - taxablePaid);

  res.json({
    receiptNo: 'RCPT-' + st.id.slice(-8).toUpperCase(),
    date: new Date().toISOString(),
    candidate: st.name,
    recruiter: st.recruiter,
    fee: st.fee,
    paid: st.paid,
    pending: st.pending,
    gstRate: GST_RATE,
    taxableTotal, gstTotal,
    cgstTotal: round2(gstTotal / 2), sgstTotal: round2(gstTotal / 2),
    taxablePaid, gstPaid,
    cgstPaid: round2(gstPaid / 2), sgstPaid: round2(gstPaid / 2)
  });
}));

app.post('/api/seed-from-file', handle(async (req, res) => {
  const seed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  await saveDB(seed);
  res.json({ ok: true, students: seed.students.length, recruiters: seed.recruiters.length });
}));

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log('Payment dashboard server running on port ' + PORT + (USE_REDIS ? ' (Upstash Redis)' : ' (local data.json)')));
}

module.exports = app;
