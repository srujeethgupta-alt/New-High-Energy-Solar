import crypto from 'crypto';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_RECIPIENT = process.env.EMAILJS_RECIPIENT;

if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY || !EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_RECIPIENT) {
  console.error('Missing required environment variables');
  process.exit(1);
}

function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

async function getFirestoreToken() {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const input = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claim));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(input);
  const sig = signer.sign(PRIVATE_KEY, 'base64url');
  const jwt = input + '.' + sig;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get OAuth token: ' + JSON.stringify(data));
  return data.access_token;
}

async function fetchTransactions(token) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/transactions/all`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Firestore error ${res.status}: ${await res.text()}`);
  const doc = await res.json();
  const values = doc.fields?.transactions?.arrayValue?.values;
  if (!values) return [];
  return values.map(v => {
    const f = v.mapValue.fields;
    return {
      id: f.id?.stringValue || '',
      type: f.type?.stringValue || '',
      product_id: f.product_id?.stringValue || '',
      product_name: f.product_name?.stringValue || '',
      quantity: Number(f.quantity?.integerValue || f.quantity?.doubleValue || 0),
      entity: f.entity?.stringValue || '',
      date: f.date?.stringValue || '',
      remarks: f.remarks?.stringValue || '',
    };
  });
}

async function sendReport(range, transactions) {
  const now = new Date();
  let filtered = transactions;
  const today = now.toISOString().split('T')[0];
  if (range === 'daily') {
    filtered = transactions.filter(tx => tx.date === today);
  } else if (range === 'weekly') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const cutoff = weekAgo.toISOString().split('T')[0];
    filtered = transactions.filter(tx => tx.date >= cutoff);
  }

  const totalIn = filtered.filter(t => t.type === 'IN').reduce((s, t) => s + t.quantity, 0);
  const totalOut = filtered.filter(t => t.type === 'OUT').reduce((s, t) => s + t.quantity, 0);
  const summary = `IN: ${totalIn}, OUT: ${totalOut}, Total transactions: ${filtered.length}`;

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: {
        to_email: EMAILJS_RECIPIENT,
        from_name: 'New High Energy Solar',
        report_date: now.toLocaleDateString('en-IN'),
        report_range: range.charAt(0).toUpperCase() + range.slice(1),
        transaction_count: filtered.length,
        report_summary: summary,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`EmailJS error ${res.status}: ${errText}`);
  }

  console.log(`✓ ${range} report sent — ${filtered.length} transactions, ${summary}`);
}

async function main() {
  console.log('Authenticating with Firestore...');
  const token = await getFirestoreToken();
  console.log('Fetching transactions...');
  const transactions = await fetchTransactions(token);
  console.log(`Total transactions on record: ${transactions.length}`);

  await sendReport('daily', transactions);

  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 1) {
    await sendReport('weekly', transactions);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
