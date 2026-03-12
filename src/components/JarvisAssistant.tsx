"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useVoiceAssistant } from "@/hooks/useVoiceAssistant";

export default function JarvisAssistant() {
    const { user, profile, getIdToken } = useAuth();
    const { items, clearCart } = useCart();
    const pathname = usePathname();
    const {
        isListening,
        isSpeaking,
        transcript,
        lastResponse,
        startListening,
        stopListening,
        speak,
        cancelSpeech,
    } = useVoiceAssistant();

    const [isProcessing, setIsProcessing] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const greetAttempted = useRef(false);
    const lastProcessedRef = useRef<string>("");

    // Voice Confirmation State
    const [pendingOrder, setPendingOrder] = useState<any[] | null>(null);
    const [pendingTotal, setPendingTotal] = useState<number>(0);

    // ── Auto Greeting Logic ──
    useEffect(() => {
        if (!user || !profile?.name || greetAttempted.current) return;

        const hasGreeted = sessionStorage.getItem("jarvis_greeted");
        if (!hasGreeted) {
            greetAttempted.current = true;
            const firstName = profile.name.split(" ")[0] || "Buddy";
            const greetingText = `Hey ${firstName}, Zayko mein aapka swagat hai. Bataye main aapke liye kya order karu?`;

            const playGreeting = () => {
                sessionStorage.setItem("jarvis_greeted", "true");
                speak(greetingText);
                window.removeEventListener("pointerdown", playGreeting);
            };

            // 1. Try to play immediately (might be blocked by strict autoplay policies)
            setTimeout(() => {
                if (!sessionStorage.getItem("jarvis_greeted")) {
                    speak(greetingText).catch((err) => {
                        console.warn("Autoplay blocked, waiting for interaction", err);
                    });
                }
            }, 2000);

            // 2. Attach to first user interaction as fallback
            window.addEventListener("pointerdown", playGreeting, { once: true });

            return () => window.removeEventListener("pointerdown", playGreeting);
        }
    }, [user, profile, speak]);

    // ── Process Transcript when listening stops ──
    const processTranscript = useCallback(async (text: string) => {
        if (!text.trim()) return;

        setIsProcessing(true);
        setIsOpen(true); // Open the UI if it was closed but we got a command

        try {
            const token = await getIdToken();

            // ── Check Voice Confirmation State ──
            if (pendingOrder) {
                const lower = text.toLowerCase().trim();
                const yesWords = ["yes", "haan", "han", "kardo", "kar do", "confirm", "sure", "ok", "okay", "ha", "yup", "हाँ", "हा", "कर दो", "ठीक", "done", "place", "it", "ji", "haanji"];
                const noWords = ["no", "nahi", "cancel", "rahne do", "rehne do", "mat", "stop", "na", "नहीं", "रहने दो", "मत"];

                const words = lower.split(/\s+/);
                // Strict check: It's a pure cancellation if any 'no' word is present in a short sentence
                const isOnlyNo = words.length <= 4 && words.some(w => noWords.includes(w));
                // Strict check: It's a pure confirmation if every word is a 'yes' word
                const isOnlyYes = words.length <= 4 && words.every(w => yesWords.includes(w) || w === "order");

                if (isOnlyNo) {
                    setPendingOrder(null);
                    setPendingTotal(0);
                    speak("Theek hai, order cancel kar diya.");
                    setIsProcessing(false);
                    return;
                }

                if (isOnlyYes) {
                    speak("Thik hai, order place kar raha hoon...");
                    await placeExtractedOrder(pendingOrder, token || "");
                    setPendingOrder(null);
                    setPendingTotal(0);
                    setIsProcessing(false);
                    return;
                }

                // If it's a complex sentence (e.g. "2 milk add kar do" or "haan 1 aur de do")
                // We FALL THROUGH to let the powerful /api/chat NLP parser extract items!
            }

            const payload = {
                messages: [{ role: "user", content: text }],
                cart: items,
                userProfile: profile,
                action: "chat",
            };

            const res = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token || ""}`,
                },
                body: JSON.stringify(payload),
            });

            let data;
            try {
                data = await res.json();
            } catch (e) {
                toast.error("Failed to parse AI response.");
                throw new Error("Invalid JSON from /api/chat");
            }

            if (res.ok) {
                // Determine if it's an order intent that needs confirmation
                if (data.status === "ORDER_CONFIRMED" && data.items?.length > 0) {
                    let newOrderList = [...data.items];

                    // Feature: Multi-turn Conversational Order Merging
                    if (pendingOrder && pendingOrder.length > 0) {
                        newOrderList = [...pendingOrder];
                        data.items.forEach((newItem: any) => {
                            const existingIdx = newOrderList.findIndex(i => i.item_id === newItem.item_id);
                            if (existingIdx >= 0) {
                                newOrderList[existingIdx].quantity += newItem.quantity;
                            } else {
                                newOrderList.push(newItem);
                            }
                        });
                    }

                    setPendingOrder(newOrderList);
                    const newTotal = newOrderList.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
                    setPendingTotal(newTotal);

                    const itemNames = newOrderList.map((i: any) => `${i.quantity} ${i.name}`).join(", ");
                    const prompt = pendingOrder
                        ? `Items add kar diye hain. Ab aapke list mein hai: ${itemNames}. Naya bill hai ${newTotal} rupees. Kya ab order confirm kar doon?`
                        : `Aapne ${itemNames} bola hai. Total bill hai ${newTotal} rupees. Kya main order confirm kar doon?`;

                    toast.success(pendingOrder ? "Items appended to pending order" : "Awaiting confirmation...");
                    speak(prompt);
                } else if (data.status === "ITEM_NOT_FOUND" || data.status === "STOCK_ERROR") {
                    toast.error(`Jarvis: ${data.message}`);
                    speak(data.message);
                } else if (pendingOrder) {
                    // It fell through to API but couldn't find items. Might be a messy confirmation phrase.
                    const lower = text.toLowerCase();
                    const isFuzzyYes = ["yes", "haan", "haanji", "hanji", "kardo", "confirm", "ok", "हाँ", "ठीक"].some(w => lower.includes(w));
                    if (isFuzzyYes) {
                        speak("Thik hai, order place kar raha hoon...");
                        await placeExtractedOrder(pendingOrder, token || "");
                        setPendingOrder(null);
                        setPendingTotal(0);
                    } else {
                        speak(`Main samajh nahi paya. Total hai ${pendingTotal} rupees. Kripya haan ya naa bole, ya naye items bataein.`);
                    }
                } else {
                    // Just spoke back the response
                    toast.success(`Jarvis says: ${data.message || "Done!"}`);
                    speak(data.message || "Done!");
                }
            } else {
                console.error("Jarvis API failed:", res.status, data);
                if (res.status === 429) {
                    toast.error("You are speaking too fast! Wait a minute.");
                    speak("I am receiving too many requests. Please wait a moment.");
                } else {
                    toast.error(`API Error ${res.status}: ${data?.message || "Unknown error"}`);
                    speak("Sorry, I could not understand the order. Please try again.");
                }
            }
        } catch (err) {
            console.error("Voice process error:", err);
            toast.error("Network or parsing error.");
            speak("Network connection error. Try again.");
        } finally {
            setIsProcessing(false);
        }
    }, [getIdToken, items, profile, speak]);

    // Auto-process when transcript stops updating and we are no longer listening
    useEffect(() => {
        if (!isListening && transcript && !isProcessing && transcript !== lastProcessedRef.current) {
            lastProcessedRef.current = transcript;
            processTranscript(transcript);
        }
    }, [isListening, transcript, isProcessing, processTranscript]);

    // ── Execute Auto Order ──
    const placeExtractedOrder = async (orderItems: any[], token: string) => {
        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token || ""}`,
                },
                body: JSON.stringify({
                    cart: orderItems,
                    userProfile: profile,
                    action: "execute_order", // The existing trigger in /api/chat route
                }),
            });

            const data = await res.json();
            if (res.ok && data.status === "ORDER_PLACED") {
                toast.success("Voice Order Placed! 🎉");
                clearCart();
                // Feature 5: Voice Confirmation
                speak("Your order has been placed successfully. It is currently in pending status.");
            } else {
                toast.error(`Order failed: ${data.message}`);
                speak(`Sorry, order place nahi ho paya. ${data.message || ""}`);
            }
        } catch (e) {
            console.error(e);
            speak("Failed to place order due to network issue.");
        }
    };

    // ── Manual UI Handlers for Confirmation ──
    const handleConfirmOrder = async () => {
        if (!pendingOrder) return;
        setIsProcessing(true);
        speak("Thik hai, order place kar raha hoon...");
        try {
            const token = await getIdToken();
            await placeExtractedOrder(pendingOrder, token || "");
        } catch (e) {
            console.error(e);
            toast.error("Failed to confirm order.");
        } finally {
            setPendingOrder(null);
            setPendingTotal(0);
            setIsProcessing(false);
            setIsOpen(false);
        }
    };

    const handleCancelOrder = () => {
        setPendingOrder(null);
        setPendingTotal(0);
        speak("Theek hai, order cancel kar diya.");
    };

    const toggleListening = () => {
        if (isSpeaking) {
            cancelSpeech();
        }
        if (isListening) {
            stopListening();
        } else {
            startListening();
            setIsOpen(true);
        }
    };

    // Hide on admin/stock routes
    if (!user) {
        console.log("JarvisAssistant: No user, not rendering");
        return null;
    }
    if (pathname?.startsWith("/admin") || pathname?.startsWith("/stock") || pathname?.startsWith("/executive")) {
        console.log("JarvisAssistant: On admin/stock route, not rendering");
        return null;
    }

    return (
        <div className="hidden md:flex fixed bottom-24 left-4 sm:left-6 z-[100] items-end gap-3 pointer-events-none">

            {/* ═══ Floating Voice UI Card ═══ */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        className="pointer-events-auto bg-zayko-900/95 backdrop-blur-xl border border-white/10 rounded-3xl p-4 sm:w-[320px] shadow-[0_20px_40px_rgba(0,0,0,0.5),_0_0_30px_rgba(251,191,36,0.1)] flex flex-col gap-3"
                    >
                        <div className="flex justify-between items-center px-1">
                            <h3 className="text-white font-bold text-sm tracking-wide flex items-center gap-2">
                                <span className="text-xl">🎙️</span> Zayko Assistant
                            </h3>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-zayko-400 hover:text-white hover:bg-white/10 transition-all"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Status/Waveform Area */}
                        <div className="h-24 bg-zayko-950/50 rounded-2xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden p-3 text-center">

                            {/* Listening Waveform */}
                            {isListening ? (
                                <div className="flex items-center justify-center h-full gap-1">
                                    {[...Array(5)].map((_, i) => (
                                        <motion.div
                                            key={i}
                                            className="w-1.5 bg-gold-400 rounded-full"
                                            animate={{ height: ["12px", "40px", "12px"] }}
                                            transition={{
                                                duration: 0.8,
                                                repeat: Infinity,
                                                delay: i * 0.1,
                                                ease: "easeInOut"
                                            }}
                                        />
                                    ))}
                                </div>
                            ) : isProcessing ? (
                                // Processing pulse
                                <div className="flex items-center justify-center h-full gap-2">
                                    <div className="w-3 h-3 bg-emerald-400 rounded-full animate-ping" />
                                    <span className="text-emerald-400 text-xs font-bold animate-pulse">Processing...</span>
                                </div>
                            ) : isSpeaking ? (
                                // Speaking visualization
                                <div className="flex items-center justify-center h-full w-full">
                                    <div className="w-12 h-12 rounded-full border-2 border-gold-400/50 flex items-center justify-center voice-speaker-ring">
                                        <div className="w-8 h-8 rounded-full bg-gold-400/20" />
                                    </div>
                                </div>
                            ) : (
                                // Idle text
                                <div className="text-zayko-400 text-xs font-medium">
                                    Tap mic and say<br />
                                    <span className="text-white italic">"Order 2 samosa"</span>
                                </div>
                            )}
                        </div>

                        {/* Transcript Display */}
                        {(transcript || lastResponse) && (
                            <div className="text-[11px] leading-relaxed">
                                {transcript && (
                                    <p className="text-zayko-300 italic mb-1">
                                        You: <span className="text-white">"{transcript}"</span>
                                    </p>
                                )}
                                {lastResponse && !isListening && (
                                    <p className="text-gold-400">
                                        Jarvis: <span className="text-white">"{lastResponse}"</span>
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Action Buttons for Pending Order */}
                        {pendingOrder && (
                            <div className="flex justify-between gap-3 mt-1 px-1">
                                <button
                                    onClick={handleCancelOrder}
                                    disabled={isProcessing}
                                    className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-500 border border-red-500/50 font-bold py-2 rounded-xl text-xs transition-all active:scale-95 disabled:opacity-50"
                                >
                                    ✕ Cancel
                                </button>
                                <button
                                    onClick={handleConfirmOrder}
                                    disabled={isProcessing}
                                    className="flex-[2] bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-xl text-xs transition-all shadow-[0_4px_15px_rgba(16,185,129,0.3)] hover:shadow-[0_4px_20px_rgba(16,185,129,0.5)] active:scale-95 disabled:opacity-50"
                                >
                                    ✅ Confirm Order
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ Floating Mic Button ═══ */}
            <motion.button
                onClick={toggleListening}
                className={`pointer-events-auto relative z-50 w-14 h-14 rounded-full flex items-center justify-center text-2xl border-2 transition-all ${isListening
                    ? "bg-red-500 border-red-400 shadow-[0_0_30px_rgba(239,68,68,0.4)]"
                    : "bg-zayko-800 border-gold-400/30 hover:border-gold-400/60 shadow-[0_8px_20px_rgba(0,0,0,0.4)]"
                    }`}
                whileTap={{ scale: 0.9 }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.5 }}
            >
                {/* Listening Pulsing Rings */}
                {isListening && (
                    <>
                        <span className="absolute inset-0 rounded-full border border-red-400 animate-ping opacity-75" style={{ animationDuration: '1.5s' }} />
                        <span className="absolute inset-[-8px] rounded-full border border-red-500/50 animate-ping opacity-50" style={{ animationDuration: '2s' }} />
                    </>
                )}

                <span className={isListening ? "text-white animate-pulse" : "drop-shadow-lg"}>
                    🎙️
                </span>

                {/* Status Dot */}
                {!isListening && (
                    <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-zayko-900">
                        <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                    </div>
                )}
            </motion.button>

        </div>
    );
}
