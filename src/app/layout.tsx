import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileBottomNav from "@/components/MobileBottomNav";
import JarvisChat from "@/components/JarvisChat";
import JarvisAssistant from "@/components/JarvisAssistant";
import PageTransition from "@/components/PageTransition";
import IntroProvider from "@/components/IntroProvider";
import UserThemeWrapper from "@/components/UserThemeWrapper";
import { Toaster } from "react-hot-toast";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Zayko – Order Smart. Eat Fresh.",
  description: "Zayko — your AI-powered campus food ordering platform. Browse menu, manage wallet, and track orders in real-time.",
  keywords: "zayko, food ordering, campus, AI chatbot, smart canteen",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="afterInteractive"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <AuthProvider>
          <CartProvider>
            <UserThemeWrapper>
              <IntroProvider>
                <Navbar />
                <main className="flex-1"><PageTransition>{children}</PageTransition></main>
                <Footer />
                <MobileBottomNav />
                <JarvisChat />
                <JarvisAssistant />
              </IntroProvider>
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 3000,
                  style: {
                    borderRadius: "12px",
                    background: "#1e3a5f",
                    color: "#fff",
                    fontSize: "14px",
                  },
                }}
              />
            </UserThemeWrapper>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
