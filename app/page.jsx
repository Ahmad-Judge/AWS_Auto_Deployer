"use client";
import { signIn, signOut, useSession } from "next-auth/react";

export default function HomePage() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50">
      <header className="w-full max-w-md mb-12 flex justify-between items-center px-6">
        <h1 className="text-xl font-semibold text-gray-900">Welcome to TeamTasks</h1>
        {session ? (
          <button onClick={() => signOut()}
            className="ml-auto rounded bg-gray-800 text-white px-4 py-2 hover:bg-gray-900 transition">
            Sign out
          </button>
        ) : (
          <button onClick={() => signIn("github")}
            className="ml-auto rounded bg-gray-800 text-white px-4 py-2 hover:bg-gray-900 transition">
            Sign in
          </button>
        )}
      </header>

      <main className="w-full max-w-md bg-white shadow rounded-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Organize your tasks, simply.
        </h2>
        <p className="text-gray-600 mb-6">
          Stay on top of teamwork and deadlines without distractions. Log in and start managing your day—all from one place.
        </p>
        {session ? (
          <a href="/dashboard" className="inline-block bg-black text-white rounded-lg px-6 py-3 font-medium hover:bg-black-slate-700 transition">
            Go to your dashboard
          </a>
        ) : (
          <button onClick={() => signIn("github")}
            className="inline-block bg-black text-white rounded-lg px-6 py-3 font-medium hover:bg-purple-700 transition">
            Sign in with GitHub
          </button>
        )}
      </main>

      <footer className="mt-12 text-sm text-gray-500 text-center">
        Built for teams that care about getting things done.
      </footer>
    </div>
  );
}
