"use client";

import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, ArrowRight, Loader2, Layers } from "lucide-react";

import { supabase } from "@/lib/supabase";

export function AuthScreen({ onAuthSuccess }: { onAuthSuccess: () => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuthSuccess();
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Auto-login or show success message (Supabase might require email confirmation depending on settings)
        onAuthSuccess();
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#F5F5F7] dark:bg-[#000000] p-6 z-[999]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white dark:bg-[#1C1C1E] rounded-[32px] p-10 w-full max-w-[400px] shadow-[0_20px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.4)] border border-black/[0.04] dark:border-white/[0.08] text-center"
      >
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 dark:from-blue-400 dark:to-blue-600 rounded-[20px] flex items-center justify-center mx-auto mb-8 shadow-md">
          <Layers className="text-white w-8 h-8" />
        </div>
        
        <h2 className="text-[28px] font-semibold text-gray-900 dark:text-white mb-3 tracking-tight leading-tight">
          {isLogin ? "С возвращением" : "Создайте аккаунт"}
        </h2>
        <p className="text-[#86868B] dark:text-[#98989D] text-[15px] mb-8 font-medium">
          {isLogin ? "Войдите, чтобы продолжить обучение." : "Начните изучение языков прямо сейчас."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative group">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#F5F5F7] dark:bg-black/50 border border-transparent focus:bg-white dark:focus:bg-[#1C1C1E] focus:border-blue-500 dark:focus:border-blue-500 rounded-2xl py-4 pl-12 pr-4 text-gray-900 dark:text-white outline-none transition-all placeholder:text-[#86868B] font-medium text-[15px]"
            />
          </div>
          
          <div className="relative group">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="password"
              placeholder="Пароль"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#F5F5F7] dark:bg-black/50 border border-transparent focus:bg-white dark:focus:bg-[#1C1C1E] focus:border-blue-500 dark:focus:border-blue-500 rounded-2xl py-4 pl-12 pr-4 text-gray-900 dark:text-white outline-none transition-all placeholder:text-[#86868B] font-medium text-[15px]"
            />
          </div>

          <AnimatePresence>
            {error && (
              <motion.p 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                exit={{ opacity: 0, height: 0 }} 
                className="text-[#FF3B30] text-[13px] font-medium text-left px-2 pt-1"
              >
                {error === 'Invalid login credentials' ? 'Неверный email или пароль' : 
                 error === 'User already registered' ? 'Пользователь уже зарегистрирован' : error}
              </motion.p>
            )}
          </AnimatePresence>

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 dark:bg-white text-white dark:text-black font-semibold rounded-2xl py-4 flex items-center justify-center gap-2 hover:bg-blue-700 dark:hover:bg-gray-100 transition-all active:scale-[0.98] disabled:opacity-50 mt-8 shadow-sm text-[15px]"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <>
                {isLogin ? "Войти" : "Зарегистрироваться"}
                <ArrowRight className="w-[18px] h-[18px]" />
              </>
            )}
          </button>
        </form>

        <button 
          onClick={() => { setIsLogin(!isLogin); setError(null); }}
          className="mt-8 text-[14px] font-medium text-[#86868B] dark:text-[#98989D] hover:text-blue-600 dark:hover:text-white transition-colors"
        >
          {isLogin ? "Нет аккаунта? Создать" : "Уже есть аккаунт? Войти"}
        </button>
      </motion.div>
    </div>
  );
}
