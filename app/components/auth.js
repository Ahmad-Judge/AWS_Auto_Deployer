"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AuthButton() {
  const { data: session } = useSession();
  const router = useRouter();

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <div className="flex flex-col items-center gap-4 p-6 border rounded-lg shadow-lg bg-white max-w-sm w-full mx-4">
        {session ? (
          <>
            <p className="text-gray-700 text-center">
              Signed in as <span className="font-semibold">{session.user.email}</span>
            </p>
            <button
              onClick={() => router.push('/repos')}
              className="px-4 py-2 w-full rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 transition focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              View Repositories
            </button>
            <button
              onClick={() => signOut()}
              className="px-4 py-2 w-full rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              Sign Out
            </button>
          </>
        ) : (
          <button
            onClick={() => signIn("github")}
            className="px-4 py-2 w-full rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-800 transition focus:outline-none focus:ring-2 focus:ring-gray-500 flex items-center justify-center gap-2"
          >
            Sign in with GitHub
          </button>
        )}
      </div>
    </div>
  );
}
