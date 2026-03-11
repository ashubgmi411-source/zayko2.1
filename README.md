# 🍛 Zayko - Campus Canteen Redefined

Zayko is a modern, high-performance web application designed to streamline the campus canteen experience. From AI-assisted ordering to seamless wallet integrations, Zayko brings technology to the heart of campus dining.

## 🚀 Key Features

- **🤖 Intelligent AI Assistant (Jarvis)**: A fully conversational AI assistant powered by Gemini, Groq, Cohere, and Claude. Order food, inquire about the menu, and get recommendations using natural Hinglish.
- **💳 Integrated Wallet System**: Seamless top-ups via Razorpay UPI and real-time transaction tracking.
- **📱 Phone OTP Authentication**: Secure and fast login using Firebase Phone Auth.
- **📊 Admin & Stock Manager Dashboards**: Comprehensive analytics, real-time order management, and stock forecasting for canteen staff.
- **🍔 Dynamic Menu**: Real-time menu updates with categorization, search, and availability toggles.
- **🕒 Real-time Order Tracking**: Track your order from preparation to pickup with live status updates.

## 🛠️ Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, Framer Motion
- **Backend/Database**: Firebase Firestore, Firebase Admin SDK
- **Authentication**: Firebase Phone Auth
- **Payments**: Razorpay Gateway
- **AI Models**: Google Gemini, Groq, Cohere, Anthropic Claude
- **Utilities**: Lucide Icons, React Hot Toast, Recharts

## 📦 Getting Started

### Prerequisites

- Node.js 18+
- NPM or PNPM

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ashu7869819242-cloud/zakko.git
   cd newzakko
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Create a `.env.local` file in the root directory and add your keys (refer to `DEPLOYMENT.md` for a complete list).

4. **Run the development server**:
   ```bash
   npm run dev
   ```

## 📜 Deployment

Refer to the [DEPLOYMENT.md](file:///c:/Users/pande/Desktop/newzakko/DEPLOYMENT.md) for detailed instructions on setting up Firebase, Firestore indexes, and deploying to Vercel.

---

Built with ❤️ for a better campus experience.

# run once
npm run build 
npm start
