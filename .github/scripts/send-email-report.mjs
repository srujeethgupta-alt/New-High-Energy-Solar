import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_RECIPIENT = process.env.EMAILJS_RECIPIENT;

const missing = [];
if (!PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
if (!EMAILJS_PUBLIC_KEY) missing.push('EMAILJS_PUBLIC_KEY');
if (!EMAILJS_PRIVATE_KEY) missing.push('EMAILJS_PRIVATE_KEY');
if (!EMAILJS_SERVICE_ID) missing.push('EMAILJS_SERVICE_ID');
if (!EMAILJS_TEMPLATE_ID) missing.push('EMAILJS_TEMPLATE_ID');
if (!EMAILJS_RECIPIENT) missing.push('EMAILJS_RECIPIENT');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) missing.push('GOOGLE_APPLICATION_CREDENTIALS (env var — set by workflow step)');
if (missing.length) {
  console.error('Missing required environment variables:');
  missing.forEach(v => console.error(`  - ${v}`));
  process.exit(1);
}

function isEmail(val) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}

async function getFirestoreToken() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/datastore'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

async function fetchFirestoreDoc(token, collectionId) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionId}/all`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Firestore error ${res.status}: ${await res.text()}`);
  const doc = await res.json();
  const values = doc.fields?.items?.arrayValue?.values;
  if (!values) return [];
  return values;
}

async function fetchTransactions(token) {
  const items = await fetchFirestoreDoc(token, 'transactions');
  return items.map(v => {
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

async function fetchProducts(token) {
  const items = await fetchFirestoreDoc(token, 'products');
  return items.map(v => {
    const f = v.mapValue.fields;
    return {
      id: f.id?.stringValue || '',
      name: f.name?.stringValue || '',
      category: f.category?.stringValue || '',
      brand: f.brand?.stringValue || '',
      quantity: Number(f.quantity?.integerValue || f.quantity?.doubleValue || 0),
      unit: f.unit?.stringValue || '',
      minimum_stock: Number(f.minimum_stock?.integerValue || f.minimum_stock?.doubleValue || 0),
    };
  });
}

function buildStockListHtml(products) {
  if (!products.length) return '<p>No products in inventory.</p>';
  const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name));
  let rows = '';
  for (const p of sorted) {
    const isLow = p.quantity < p.minimum_stock && p.quantity > 0;
    const isOut = p.quantity === 0;
    let statusBadge = '<span style="color:#22C55E;">OK</span>';
    if (isOut) statusBadge = '<span style="color:#EF4444;font-weight:700;">OUT OF STOCK</span>';
    else if (isLow) statusBadge = '<span style="color:#F59E0B;font-weight:700;">LOW</span>';
    rows += `<tr>
        <td style="padding:6px 10px;border:1px solid #374151;">${p.name}</td>
        <td style="padding:6px 10px;border:1px solid #374151;">${p.brand || '—'}</td>
        <td style="padding:6px 10px;border:1px solid #374151;">${p.category}</td>
        <td style="padding:6px 10px;border:1px solid #374151;text-align:center;">${p.quantity} ${p.unit}</td>
        <td style="padding:6px 10px;border:1px solid #374151;text-align:center;">${statusBadge}</td>
      </tr>`;
  }
  return `
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;color:#E2E8F0;">
      <thead>
        <tr style="background:#F59E0B;color:#0F172A;">
          <th style="padding:8px 10px;border:1px solid #F59E0B;text-align:left;">Product</th>
          <th style="padding:8px 10px;border:1px solid #F59E0B;text-align:left;">Brand</th>
          <th style="padding:8px 10px;border:1px solid #F59E0B;text-align:left;">Category</th>
          <th style="padding:8px 10px;border:1px solid #F59E0B;text-align:center;">Qty</th>
          <th style="padding:8px 10px;border:1px solid #F59E0B;text-align:center;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
}

async function sendReport(range, transactions, products) {
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

  const stockListHtml = buildStockListHtml(products);

  // If there are no transactions AND no products, skip sending the email
  if (filtered.length === 0 && products.length === 0) {
    console.log(`No transactions or products for ${range} report — skipping email send.`);
    return;
  }

  const recipient = (EMAILJS_RECIPIENT || '').trim();
  if (!recipient) {
    throw new Error('EMAILJS_RECIPIENT is empty after trimming — aborting email send');
  }
  if (!isEmail(recipient)) {
    throw new Error(`EMAILJS_RECIPIENT does not look like a valid email address: "${recipient}"`);
  }

  const templateParams = {
    to_email: recipient,
    from_name: 'New High Energy Solar',
    report_date: now.toLocaleDateString('en-IN'),
    report_range: range.charAt(0).toUpperCase() + range.slice(1),
    transaction_count: filtered.length,
    report_summary: summary,
    stock_list: stockListHtml,
  };

  if (!templateParams.to_email) {
    throw new Error('Recipient is empty in template_params — aborting.');
  }

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      // Note: private key is not required in the public REST call; keep it out of the body for security.
      template_params: templateParams,
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
  console.log('Fetching products...');
  const products = await fetchProducts(token);
  console.log(`Total products on record: ${products.length}`);

  await sendReport('daily', transactions, products);

  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 1) {
    await sendReport('weekly', transactions, products);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
