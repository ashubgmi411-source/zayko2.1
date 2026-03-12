"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useVoiceAssistant } from "@/hooks/useVoiceAssistant";

interface ChatMessage {
    role: "assistant" | "user" | "system";
    content: string;
    timestamp: number;
    structured?: StructuredResponse | null;
}

interface OrderedItem {
    name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    item_id: string;
}

interface StructuredResponse {
    status: string;
    items?: OrderedItem[];
    grand_total?: number;
    action?: string;
    message?: string;
    found_items?: OrderedItem[];
    not_found_items?: string[];
    item_name?: string;
    requested?: number;
    available?: number;
    orderId?: string;
    total?: number;
}

export default function JarvisChat() {
    const { user, profile, getIdToken } = useAuth();
    const { items, total, clearCart } = useCart();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [processing, setProcessing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Voice input (mobile mic inside chat)
    const {
        isListening,
        transcript: voiceTranscript,
        startListening,
        stopListening,
    } = useVoiceAssistant();

    // When voice transcript updates, fill the input
    useEffect(() => {
        if (voiceTranscript && !isListening) {
            setInput(voiceTranscript);
        }
    }, [voiceTranscript, isListening]);

    const toggleVoice = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    // Initial Greeting
    useEffect(() => {
        if (open && messages.length === 0) {
            const firstName = profile?.name?.split(" ")[0] || "Buddy";
            setMessages([
                {
                    role: "assistant",
                    content: `Namaste ${firstName}! 🙏 Main hoon Jarvis — Zayko AI Ordering Engine.\n\nSeedha order bolo, jaise:\n• "6 milk"\n• "2 samosa aur 1 chai"\n• "3 coffee order karo"\n\nMain turant process karunga! ⚡`,
                    timestamp: Date.now(),
                },
            ]);
        }
    }, [open, profile, messages.length]);

    // Auto scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Focus input on open
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [open]);

    const handleSend = useCallback(async (action?: string, orderItems?: OrderedItem[]) => {
        const text = input.trim();
        if ((!text && !action) || processing) return;

        const userMsg = text || (action === "execute_order" ? "✅ Order Confirm" : action === "place_order" ? "Place Order" : "");
        if (userMsg && action !== "execute_order") {
            setMessages(prev => [...prev, { role: "user", content: userMsg, timestamp: Date.now() }]);
        }

        setInput("");
        setProcessing(true);

        try {
            const token = await getIdToken();
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    messages: messages.concat(
                        userMsg && action !== "execute_order"
                            ? [{ role: "user" as const, content: userMsg, timestamp: Date.now() }]
                            : []
                    ),
                    cart: action === "execute_order" ? orderItems : items,
                    userProfile: profile,
                    action: action || "chat",
                }),
            });

            const data = await res.json();

            if (res.ok) {
                // Determine if this is a structured response
                const isStructured = data.status && ["ORDER_CONFIRMED", "ITEM_NOT_FOUND", "STOCK_ERROR", "ORDER_PLACED", "ORDER_FAILED", "CHAT_MODE"].includes(data.status);

                if (isStructured) {
                    const displayContent = buildStructuredDisplay(data);
                    setMessages(prev => [
                        ...prev,
                        {
                            role: "assistant",
                            content: displayContent,
                            timestamp: Date.now(),
                            structured: data,
                        },
                    ]);

                    if (data.status === "ORDER_PLACED" || data.action === "order_placed") {
                        toast.success("Order placed! 🎉");
                        clearCart();
                    }
                } else {
                    // Legacy/chat response
                    setMessages(prev => [
                        ...prev,
                        {
                            role: "assistant",
                            content: data.message,
                            timestamp: Date.now(),
                        },
                    ]);

                    if (data.action === "order_placed") {
                        toast.success("Order placed via AI! 🎉");
                        clearCart();
                    }
                }
            } else {
                toast.error(data.error || "AI is taking a break...");
                setMessages(prev => [
                    ...prev,
                    {
                        role: "assistant",
                        content: "Sorry, server side kuch issue hai. Kripya bad mein try karein! 🙏",
                        timestamp: Date.now(),
                    },
                ]);
            }
        } catch (err) {
            console.error("Jarvis Error:", err);
            toast.error("Connection lost");
        } finally {
            setProcessing(false);
        }
    }, [input, processing, messages, items, profile, getIdToken, clearCart]);

    /** Build a human-readable display string from structured JSON */
    function buildStructuredDisplay(data: StructuredResponse): string {
        switch (data.status) {
            case "ORDER_CONFIRMED": {
                const lines = ["🛒 **Order Summary**\n"];
                for (const item of data.items || []) {
                    lines.push(`• ${item.name} × ${item.quantity} — ₹${item.total_price}`);
                }
                lines.push(`\n💰 Grand Total: ₹${data.grand_total}`);
                lines.push("\nConfirm karna hai? 👇");
                return lines.join("\n");
            }
            case "ITEM_NOT_FOUND":
                return `⚠️ ${data.message}`;
            case "STOCK_ERROR":
                return `📦 ${data.message}`;
            case "ORDER_PLACED":
                return data.message || "✅ Order placed!";
            case "ORDER_FAILED":
                return data.message || "❌ Order failed!";
            default:
                return data.message || "...";
        }
    }

    const handleConfirmOrder = useCallback(
        (structured: StructuredResponse) => {
            if (!structured.items || structured.items.length === 0) return;
            handleSend("execute_order", structured.items);
        },
        [handleSend]
    );

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (!user) return null;
    if (pathname?.startsWith("/admin")) return null;
    if (pathname?.startsWith("/stock")) return null;
    if (pathname?.startsWith("/executive")) return null;

    return (
        <>
            {/* ═══ Floating Orb Trigger ═══ */}
            <motion.button
                onClick={() => setOpen(!open)}
                className="fixed bottom-24 right-4 z-50 w-16 h-16 rounded-full flex items-center justify-center text-3xl border-2 border-gold-400/30 breathing-orb"
                style={{
                    background: 'radial-gradient(circle at 35% 35%, #fbbf24, #d4a017, #92400e)',
                }}
                whileTap={{ scale: 0.85 }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
                {open ? (
                    <span className="text-xl text-zayko-950 font-bold">✕</span>
                ) : (
                    <span className="text-2xl drop-shadow-lg">🤖</span>
                )}
                {/* Pulsing ring behind orb */}
                {!open && (
                    <span className="absolute inset-0 rounded-full border-2 border-gold-400/40 animate-ping" style={{ animationDuration: '3s' }} />
                )}
                {/* Notification Badge */}
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-zayko-900 shadow-lg shadow-emerald-500/30">
                    <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                </div>
            </motion.button>

            {/* ═══ Chat Panel ═══ */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 40, scale: 0.85 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 40, scale: 0.85 }}
                        transition={{ type: "spring", stiffness: 350, damping: 28 }}
                        className="fixed bottom-44 right-4 left-4 sm:left-auto sm:right-6 z-50 sm:w-[380px] h-[550px] max-h-[80vh] flex flex-col rounded-3xl overflow-hidden border border-white/[0.08] shadow-[0_32px_64px_rgba(0,0,0,0.7),_0_0_40px_rgba(251,191,36,0.08)] bg-zayko-900/95 backdrop-blur-2xl"
                    >
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-white/[0.06] bg-gradient-to-r from-gold-400/10 via-gold-400/5 to-transparent flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-gold-500/30" style={{ background: 'radial-gradient(circle at 35% 35%, #fbbf24, #d4a017)' }}>
                                        🤖
                                    </div>
                                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-zayko-900 rounded-full"></span>
                                </div>
                                <div>
                                    <h3 className="font-display font-black text-white text-base tracking-tight italic">JARVIS <span className="text-[10px] bg-gold-400/20 text-gold-400 px-1.5 py-0.5 rounded ml-1 not-italic">ENGINE</span></h3>
                                    <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest leading-none mt-1">Order Engine Active</p>
                                </div>
                            </div>
                            <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zayko-400 hover:text-white hover:bg-white/10 transition-all active:scale-90">✕</button>
                        </div>

                        {/* Chat Messages */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide">
                            {messages.map((msg, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: msg.role === "user" ? 20 : -20, y: 8 }}
                                    animate={{ opacity: 1, x: 0, y: 0 }}
                                    transition={{ duration: 0.25, ease: "easeOut" }}
                                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                                >
                                    <div className="max-w-[85%]">
                                        <div className={`px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-sm ${msg.role === "user"
                                            ? "bg-gradient-to-br from-gold-500 to-gold-400 text-zayko-950 font-bold rounded-tr-sm shadow-gold-500/20"
                                            : msg.structured?.status === "ORDER_CONFIRMED"
                                                ? "bg-emerald-500/10 border border-emerald-500/30 text-zayko-100 rounded-tl-sm"
                                                : msg.structured?.status === "ITEM_NOT_FOUND" || msg.structured?.status === "STOCK_ERROR"
                                                    ? "bg-red-500/10 border border-red-500/30 text-zayko-100 rounded-tl-sm"
                                                    : msg.structured?.status === "ORDER_PLACED"
                                                        ? "bg-emerald-500/10 border border-emerald-500/30 text-zayko-100 rounded-tl-sm"
                                                        : "bg-white/5 border border-white/[0.08] text-zayko-100 rounded-tl-sm"
                                            }`}>
                                            {msg.content.split("\n").map((line, idx) => (
                                                <p key={idx} className={idx > 0 ? "mt-1" : ""}>{line}</p>
                                            ))}
                                        </div>

                                        {/* Confirm / Cancel buttons for ORDER_CONFIRMED */}
                                        {msg.structured?.status === "ORDER_CONFIRMED" && (
                                            <div className="flex gap-2 mt-2">
                                                <button
                                                    onClick={() => handleConfirmOrder(msg.structured!)}
                                                    disabled={processing}
                                                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 text-white text-xs font-black uppercase tracking-wider hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-95 transition-all disabled:opacity-50"
                                                >
                                                    ✅ Confirm Order
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        setMessages(prev => [
                                                            ...prev,
                                                            { role: "assistant", content: "Order cancel kar diya. Kuch aur chahiye? 😊", timestamp: Date.now() },
                                                        ])
                                                    }
                                                    className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zayko-300 text-xs font-bold uppercase tracking-wider hover:bg-white/10 active:scale-95 transition-all"
                                                >
                                                    ❌ Cancel
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                            {processing && (
                                <div className="flex justify-start">
                                    <div className="bg-white/5 border border-white/[0.08] px-4 py-3 rounded-2xl rounded-tl-sm">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 bg-gold-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                                            <span className="w-2 h-2 bg-gold-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                                            <span className="w-2 h-2 bg-gold-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-zayko-800/50 border-t border-white/[0.06]">
                            <div className="relative group flex items-center gap-2">
                                {/* Mic Button */}
                                <button
                                    onClick={toggleVoice}
                                    className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                                        isListening
                                            ? "bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse"
                                            : "bg-white/5 border border-white/[0.1] text-zayko-400 hover:text-white hover:bg-white/10"
                                    }`}
                                    title={isListening ? "Stop listening" : "Speak your order"}
                                >
                                    🎙️
                                </button>
                                <div className="relative flex-1">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder={isListening ? "Listening..." : "Type or tap 🎙️ to speak..."}
                                        className="w-full bg-white/5 border border-white/[0.1] rounded-2xl py-4 pl-5 pr-14 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/30 focus:border-gold-400/20 focus:shadow-[0_0_20px_rgba(251,191,36,0.1)] transition-all placeholder:text-zayko-600 font-medium"
                                        disabled={processing || isListening}
                                    />
                                    <button
                                        onClick={() => handleSend()}
                                        disabled={processing || !input.trim()}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-gradient-to-br from-gold-400 to-gold-500 text-zayko-900 flex items-center justify-center transition-all active:scale-85 disabled:opacity-30 disabled:grayscale shadow-lg shadow-gold-500/20"
                                    >
                                        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <p className="text-[9px] text-center text-zayko-600 mt-3 font-black uppercase tracking-[0.2em]">Type or Voice · Powered by Zayko AI</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
