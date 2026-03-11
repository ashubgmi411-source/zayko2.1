
# 🎓 Campus Canteen - Deployment Guide

## Prerequisites
- Node.js 18+
- Firebase project with Firestore & Phone Auth enabled
- Vercel account
- AI API keys (at least one of: Gemini, Groq, Cohere, Claude)

---

## 🔥 Firebase Setup

### 1. Create a Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (e.g., "campus-canteen")
3. Enable **Firestore Database** (start in test mode)
4. Enable **Phone Authentication** under Authentication → Sign-in method

### 2. Get Firebase Config
1. Go to Project Settings → General → Your apps
2. Register a web app and copy the config values

### 3. Generate Service Account Key
1. Go to Project Settings → Service Accounts
2. Click "Generate new private key"
3. Save the JSON file (you'll need `project_id`, `client_email`, `private_key`)

### 4. Firestore Indexes
Create these composite indexes in Firestore:
- **orders**: `userId` (ASC) + `createdAt` (DESC)
- **orders**: `createdAt` (DESC)
- **walletTransactions**: `userId` (ASC) + `createdAt` (DESC)

---

## 🚀 Deploy to Vercel

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/campus-canteen.git
git push -u origin main
```

### 2. Import to Vercel
1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repository
3. Set the root directory to `college-canteen`
4. Framework: **Next.js** (auto-detected)

### 3. Environment Variables
Add these in Vercel → Project Settings → Environment Variables:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `your-project.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase app ID |
| `FIREBASE_ADMIN_PROJECT_ID` | Same project ID |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Service account email |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Service account private key (with `\n` line breaks) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GROQ_API_KEY` | Groq API key |
| `COHERE_API_KEY` | Cohere API key |
| `CLAUDE_API_KEY` | Anthropic Claude API key |
| `ADMIN_USERNAME` | Admin login username |
| `ADMIN_PASSWORD` | Admin login password |
| `ADMIN_SECRET` | Secret for admin token generation |

### 4. Deploy
Click **Deploy** — Vercel will build and deploy automatically.

---

## 🧪 Local Development

```bash
cd college-canteen
cp .env.local.example .env.local
# Fill in your actual values in .env.local
npm install
npm run dev
```

Visit:
- **User App**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin

---

## 📱 Features Overview

| Feature | Route | Description |
|---------|-------|-------------|
| Auth | `/auth` | Phone OTP sign-in with name & roll number |
| Menu | `/` | Real-time menu with search & filters |
| Cart | `/cart` | Cart management with wallet balance check |
| Wallet | `/wallet` | UPI top-up & transaction history |
| Orders | `/orders` | Real-time order tracking |
| AI Chat | `/chat` | AI-assisted order placement |
| Admin Login | `/admin` | Staff authentication |
| Dashboard | `/admin/dashboard` | Sales charts & statistics |
| Admin Orders | `/admin/orders` | Order management with prep times |
| Admin Menu | `/admin/menu` | Full menu CRUD |

---

## 🤖 AI Fallback Chain
The chat assistant tries providers in order: **Gemini → Groq → Cohere → Claude**. 
If all fail, a friendly fallback message is shown. You only need ONE API key for the chat to work.
