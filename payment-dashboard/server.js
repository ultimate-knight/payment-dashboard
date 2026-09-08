const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'data.json');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ students: [], recruiters: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---- Read everything (dashboard loads this on every device) ----
app.get('/api/data', (req, res) => {
  res.json(loadDB());
});

// ---- Add a candidate ----
app.post('/api/students', (req, res) => {
  const db = loadDB();
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
  saveDB(db);
  res.json(student);
});

// ---- Record an additional payment against an existing candidate ----
app.patch('/api/students/:id/payment', (req, res) => {
  const db = loadDB();
  const st = db.students.find(s => s.id === req.params.id);
  if (!st) return res.status(404).json({ error: 'candidate not found' });
  const addAmt = Number(req.body.amount) || 0;
  st.paid = Math.min(st.fee, Math.max(0, st.paid + addAmt));
  st.pending = st.fee - st.paid;
  saveDB(db);
  res.json(st);
});

// ---- Delete a candidate ----
app.delete('/api/students/:id', (req, res) => {
  const db = loadDB();
  db.students = db.students.filter(s => s.id !== req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

// ---- Add an empty recruiter (no candidates yet) ----
app.post('/api/recruiters', (req, res) => {
  const db = loadDB();
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'recruiter name required' });
  if (!db.recruiters.includes(name)) db.recruiters.push(name);
  saveDB(db);
  res.json({ ok: true });
});

// ---- Delete a recruiter (and all their candidates) ----
app.delete('/api/recruiters/:name', (req, res) => {
  const db = loadDB();
  const name = decodeURIComponent(req.params.name);
  db.recruiters = db.recruiters.filter(r => r !== name);
  db.students = db.students.filter(s => s.recruiter !== name);
  saveDB(db);
  res.json({ ok: true });
});

// ---- Receipt data for one candidate (18% GST breakup) ----
app.get('/api/receipt/:id', (req, res) => {
  const db = loadDB();
  const st = db.students.find(s => s.id === req.params.id);
  if (!st) return res.status(404).json({ error: 'candidate not found' });

  const GST_RATE = 0.18;
  // st.fee / st.paid are treated as GST-inclusive amounts.
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
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Payment dashboard server running on port ' + PORT));
