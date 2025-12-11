"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function ReposPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }

    if (status === "authenticated") {
      fetch("/api/github/repos")
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch");
          return res.json();
        })
        .then((data) => {
          if (data.error) {
            setError(data.error);
            setRepos([]);
          } else {
            setRepos(Array.isArray(data) ? data : []);
          }
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setRepos([]);
          setLoading(false);
        });
    }
  }, [status, router]);

  const handleDeployClick = (repo) => {
    // Navigate to deploy page with repo data
    router.push(`/deploy?repo=${encodeURIComponent(repo.full_name)}&url=${encodeURIComponent(repo.clone_url)}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading your repositories...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-slate-600 hover:text-slate-900 transition"
              title="Back to Dashboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <h1 className="text-xl font-semibold text-slate-900">Your Repositories</h1>
            <span className="text-sm text-slate-600 bg-slate-100 px-2 py-1 rounded">
              {repos.length}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {session?.user?.email && (
              <span className="text-sm text-slate-600 hidden sm:block">
                {session.user.email}
              </span>
            )}
            <button
              onClick={() => signOut()}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 transition text-sm text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {error ? (
          <div className="text-center py-20">
            <p className="text-red-600">Error: {error}</p>
          </div>
        ) : repos.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-500">No repositories found</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {repos.map((repo) => (
              <div
                key={repo.id}
                className="border border-slate-200 rounded-lg p-5 bg-white hover:shadow-md transition group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-lg font-medium text-blue-600 hover:text-blue-700 transition inline-flex items-center gap-2"
                    >
                      {repo.name}
                      <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                    {repo.description && (
                      <p className="text-slate-600 text-sm mt-2 line-clamp-2">
                        {repo.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500">
                      {repo.language && (
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                          {repo.language}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        {repo.stargazers_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {repo.forks_count}
                      </span>
                      {repo.private && (
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">Private</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeployClick(repo)}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition flex-shrink-0"
                  >
                    Deploy
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}