import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import firebaseConfig from '../firebase-applet-config.json';

const foods = [
  ['Cooked white rice', '100', 'g', 130, 2.7, 28, 0.3, 0.4],
  ['Roti', '1', 'piece', 120, 3.5, 18, 3.5, 2.5],
  ['Dal', '1', 'cup', 180, 10, 28, 4, 7],
  ['Paneer', '100', 'g', 265, 18, 4, 20, 0],
  ['Chicken breast', '100', 'g', 165, 31, 0, 3.6, 0],
  ['Whole egg', '1', 'egg', 72, 6.3, 0.4, 4.8, 0],
  ['Egg white', '1', 'white', 17, 3.6, 0.2, 0.1, 0],
  ['Banana', '1', 'medium', 105, 1.3, 27, 0.4, 3.1],
  ['Milk', '250', 'ml', 155, 8, 12, 8, 0],
  ['Curd', '100', 'g', 98, 3.5, 4.7, 4.3, 0],
  ['Almonds', '28', 'g', 164, 6, 6, 14, 3.5],
  ['Oats', '40', 'g', 150, 5, 27, 3, 4],
  ['Greek yogurt', '100', 'g', 59, 10, 3.6, 0.4, 0],
  ['Peanut butter', '1', 'tbsp', 94, 3.5, 3.2, 8, 1],
  ['Whey protein', '1', 'scoop', 120, 24, 3, 2, 0],
  ['Apple', '1', 'medium', 95, 0.5, 25, 0.3, 4.4],
  ['Potato', '100', 'g', 87, 1.9, 20, 0.1, 1.8],
  ['Sweet potato', '100', 'g', 86, 1.6, 20, 0.1, 3],
  ['Broccoli', '100', 'g', 35, 2.4, 7, 0.4, 3.3],
  ['Spinach', '100', 'g', 23, 2.9, 3.6, 0.4, 2.2],
  ['Tofu', '100', 'g', 144, 17, 3, 8.7, 2.3],
  ['Fish', '100', 'g', 120, 22, 0, 3, 0],
  ['Chapati', '1', 'piece', 104, 3, 15.7, 3.7, 2.6],
  ['Idli', '1', 'piece', 58, 2, 12, 0.4, 0.8],
  ['Poha', '1', 'cup', 250, 5, 46, 6, 3],
  ['Sprouts', '100', 'g', 100, 7, 18, 1, 6],
  ['Cottage cheese', '100', 'g', 98, 11, 3.4, 4.3, 0],
  ['Avocado', '100', 'g', 160, 2, 9, 15, 7]
];

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) {
  throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to a Firebase service-account JSON file before running this seed.');
}

const serviceAccount = JSON.parse(await readFile(keyPath, 'utf8'));
const token = await getAccessToken(serviceAccount);
const projectId = firebaseConfig.projectId;
const now = new Date().toISOString();

const writes = foods.map(([name, servingSize, unit, calories, protein, carbs, fat, fiber]) => ({
  update: {
    name: `projects/${projectId}/databases/(default)/documents/sharedFoods/${idFor(String(name))}`,
    fields: {
      name: { stringValue: String(name) },
      servingSize: { doubleValue: Number(servingSize) },
      unit: { stringValue: String(unit) },
      calories: { doubleValue: Number(calories) },
      protein: { doubleValue: Number(protein) },
      carbs: { doubleValue: Number(carbs) },
      fat: { doubleValue: Number(fat) },
      fiber: { doubleValue: Number(fiber) },
      curated: { booleanValue: true },
      updatedAt: { timestampValue: now }
    }
  }
}));

const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ writes })
});

if (!response.ok) {
  throw new Error(`Seed failed: ${response.status} ${await response.text()}`);
}

console.log(`Seeded ${foods.length} shared foods into ${projectId}/sharedFoods.`);

async function getAccessToken(serviceAccount: any) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const assertion = [
    base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    base64Url(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSeconds,
      exp: nowSeconds + 3600
    }))
  ].join('.');

  const signer = createSign('RSA-SHA256');
  signer.update(assertion);
  const jwt = `${assertion}.${signer.sign(serviceAccount.private_key, 'base64url')}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!response.ok) {
    throw new Error(`Token request failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  return body.access_token;
}

function idFor(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function base64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}
