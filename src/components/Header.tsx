"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import AuthModal from "@/components/AuthModal";
import ProfileModal from "@/components/ProfileModal";

type User = { email?: string; username?: string; isAdmin?: boolean };

export default function Header({ activePage }: { activePage?: "home" | "leaderboard" | "about" | "settings" }) {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    async function loadUser(userId: string, email?: string) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, is_admin")
        .eq("id", userId)
        .maybeSingle();
      setUser({ email, username: profile?.username, isAdmin: profile?.is_admin ?? false });
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadUser(session.user.id, session.user.email);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user) loadUser(session.user.id, session.user.email);
      else setUser(null);
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navLinkClass = (page?: string) =>
    `px-3 py-1.5 text-xs font-semibold transition-colors rounded-lg hover:bg-zinc-800/60 ${
      activePage === page ? "text-white" : "text-zinc-400 hover:text-white"
    }`;

  return (
    <div className="relative">
      {/* Logo row with profile icon in top-right of container */}
      <div className="relative flex items-center justify-center gap-2.5 mb-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="text-2xl font-black tracking-tight text-white">PANTHERS</span>
          <span className="rounded bg-[#0085CA] px-2 py-0.5 text-sm font-black tracking-widest text-white">
            TRIVIA
          </span>
        </Link>
      </div>

      {/* Profile icon */}
      <div className="absolute top-0 left-0 z-30">
        <button
          className={`rounded-full p-1 transition-colors hover:bg-zinc-800/60 ${user ? "text-[#0085CA]" : "text-zinc-500 hover:text-zinc-300"}`}
          onClick={() => user ? setShowUserMenu((v) => !v) : setShowAuthModal(true)}
          title={user ? (user.username ?? user.email) : "Sign in"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="9" r="3" />
            <path d="M5.5 19.5c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" strokeLinecap="round" />
          </svg>
        </button>
        {showUserMenu && user && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
            <div className="absolute left-0 mt-1 z-20 w-44 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
              <div className="px-4 py-2.5">
                <p className="text-xs font-semibold text-zinc-100">Hello, {user.username ?? user.email}!</p>
              </div>
              <button
                className="w-full px-4 py-2.5 text-left text-xs font-semibold text-rose-400 hover:bg-zinc-800 transition-colors border-t border-zinc-800"
                onClick={async () => {
                  await supabase.auth.signOut();
                  localStorage.removeItem("panthers_daily_v1");
                  window.location.reload();
                }}
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>

      {/* Nav bar */}
      <nav className="relative flex items-center border-b border-zinc-800 pb-4 mb-2">
        {/* Centered nav links */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
          <Link href="/" className={navLinkClass("home")}>
            Home
          </Link>
          {user && (
            <Link href="/stats" className={navLinkClass("leaderboard")}>
              Leaderboard
            </Link>
          )}
          <Link href="/about" className={navLinkClass("about")}>
            About
          </Link>
          {user && (
            <Link href="/settings" className={navLinkClass("settings")}>
              Settings
            </Link>
          )}
        </div>

      </nav>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showProfileModal && <ProfileModal onClose={() => setShowProfileModal(false)} />}
    </div>
  );
}
