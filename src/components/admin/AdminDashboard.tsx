"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Crown, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

import { supabase } from "@/lib/supabase";

interface Profile {
  id: string;
  email: string;
  role: 'admin' | 'user';
  tier: 'free' | 'premium';
  created_at: string;
}

export function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('kraft_profiles').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setUsers(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  const toggleTier = async (userId: string, currentTier: 'free' | 'premium') => {
    const newTier = currentTier === 'free' ? 'premium' : 'free';
    
    setUsers(users.map(u => u.id === userId ? { ...u, tier: newTier } : u));
    
    const { error } = await supabase.from('kraft_profiles').update({ tier: newTier }).eq('id', userId);
    
    if (error) {
      alert("Ошибка обновления статуса пользователя: " + error.message);
      fetchUsers();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md" onClick={onClose}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl rounded-3xl p-8 w-full max-w-4xl border border-black/5 dark:border-white/10 text-gray-900 dark:text-[#F2F2F7] shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar"
      >
        <button onClick={onClose} className="absolute top-6 right-6 flex items-center justify-center w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 text-gray-500 hover:text-gray-900 dark:text-white/60 dark:hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
        
        <h2 className="text-2xl font-bold tracking-tight mb-2 text-gray-900 dark:text-white">Пользователи</h2>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <p className="text-gray-500 dark:text-white/50 text-sm font-medium">
            Управление аккаунтами и премиум-доступом
          </p>
          <input 
            type="text" 
            placeholder="Поиск по email..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 px-4 py-2 bg-gray-100 dark:bg-white/5 border border-transparent dark:border-white/10 rounded-xl text-[14px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-500"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/5 dark:border-white/10">
                  <th className="pb-4 px-4 font-semibold text-[13px] uppercase tracking-wider text-gray-500 dark:text-gray-400 w-2/5">Пользователь</th>
                  <th className="pb-4 px-4 font-semibold text-[13px] uppercase tracking-wider text-gray-500 dark:text-gray-400 w-1/5">Регистрация</th>
                  <th className="pb-4 px-4 font-semibold text-[13px] uppercase tracking-wider text-gray-500 dark:text-gray-400 w-1/6">Роль</th>
                  <th className="pb-4 px-4 font-semibold text-[13px] uppercase tracking-wider text-gray-500 dark:text-gray-400 w-1/6">Статус</th>
                  <th className="pb-4 px-4 font-semibold text-[13px] uppercase tracking-wider text-gray-500 dark:text-gray-400 text-right w-16">Pro</th>
                </tr>
              </thead>
              <tbody>
                {users.filter(u => u.email.toLowerCase().includes(search.toLowerCase())).map(user => (
                  <tr key={user.id} className="border-b border-black/[0.02] dark:border-white/5 hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors group">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        </div>
                        <span className="font-semibold text-[15px]">{user.email}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-[14px] font-medium text-gray-500 dark:text-gray-400">
                      {new Date(user.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="py-4 px-4">
                      <span className={cn(
                        "inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider",
                        user.role === 'admin' 
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400" 
                          : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400"
                      )}>
                        {user.role === 'admin' ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className={cn(
                        "inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider w-[72px]",
                        user.tier === 'premium' 
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" 
                          : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400"
                      )}>
                        {user.tier === 'premium' && <Crown className="w-3.5 h-3.5" />}
                        {user.tier === 'premium' ? 'Pro' : 'Free'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button
                        onClick={() => toggleTier(user.id, user.tier)}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 dark:focus:ring-offset-[#1C1C1E]",
                          user.tier === 'premium' ? "bg-green-500" : "bg-gray-200 dark:bg-white/20"
                        )}
                        role="switch"
                        aria-checked={user.tier === 'premium'}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                            user.tier === 'premium' ? "translate-x-5" : "translate-x-0"
                          )}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400 font-medium">Нет пользователей.</div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
