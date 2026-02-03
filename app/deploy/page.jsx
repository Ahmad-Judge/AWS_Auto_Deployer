"use client";

import { useEffect, useState, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

// --- Design Theme Constants for easy modification ---
const THEME = {
  // Base Black/White Palette
  BACKGROUND: "bg-gray-50", // Light background for main content
  CARD_BG: "bg-white", // White background for cards/sections
  TEXT_PRIMARY: "text-gray-900", // Near black for main text
  TEXT_SECONDARY: "text-gray-600", // Gray for descriptive text
  BORDER_COLOR: "border-gray-200", // Light border for separation

  // Accent Colors (subtle grays)
  ACCENT: "text-gray-700",
  ACCENT_BG: "bg-gray-100",
  CODE_BG: "bg-gray-900",
  CODE_TEXT: "text-gray-200",

  // State Colors (subtle grays or minimal color accent)
  SUCCESS: { TEXT: "text-green-600", BG: "bg-green-50", BORDER: "border-green-300" },
  ERROR: { TEXT: "text-red-600", BG: "bg-red-50", BORDER: "border-red-300" },
  BUTTON_PRIMARY: { BG: "bg-gray-900", HOVER_BG: "bg-gray-700", TEXT: "text-white" },
  BUTTON_SECONDARY: { BG: "bg-white", HOVER_BG: "bg-gray-100", TEXT: "text-gray-900", BORDER: "border-gray-300" },
};

// Simplified Step Logic for the new design
const buildSteps = [
  { name: 'Cloning repository', key: 'cloning', progress: 15, description: "Clones your repository from GitHub." },
  { name: 'Installing dependencies', key: 'installing', progress: 40, description: "Installs project dependencies with npm." },
  { name: 'Building project', key: 'building', progress: 70, description: "Builds your project for production (e.g., using `npm run build`)." },
  { name: 'Uploading to S3', key: 'uploading', progress: 95, description: "Uploads all production files to an AWS S3 bucket." },
  { name: 'CloudFront invalidation', key: 'cloudfront', progress: 100, description: "Invalidates the CloudFront cache and provides a global CDN URL." },
];

function DeployContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const repoName = searchParams.get("repo");
  const repoUrl = searchParams.get("url");

  const [copied, setCopied] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deploymentResult, setDeploymentResult] = useState(null);
  const [error, setError] = useState(null);
  const [buildPath, setBuildPath] = useState("");
  const [backendUrl, setBackendUrl] = useState("");
  const [envVariables, setEnvVariables] = useState("");
  const [jobId, setJobId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  // Poll for job status and logs
  useEffect(() => {
    if (!jobId || !deploying) return;

    const pollInterval = setInterval(async () => {
      try {
        // Fetch logs
        const logsRes = await fetch(`/api/deploy/logs?jobId=${jobId}`);
        const logsData = await logsRes.json();
        
        if (logsData.logs) {
          setLogs(logsData.logs);
        }

        // Fetch status
        const statusRes = await fetch(`/api/deploy/status?jobId=${jobId}`);
        const statusData = await statusRes.json();
        
        if (statusData.progress !== undefined) {
          setProgress(statusData.progress);
        }

        // Check if completed
        if (statusData.state === 'completed' && statusData.result) {
          setDeploymentResult(statusData.result);
          setDeploying(false);
          clearInterval(pollInterval);
        } else if (statusData.state === 'failed') {
          setError(statusData.failedReason || 'Deployment failed');
          setDeploying(false);
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1000); // Poll every second

    return () => clearInterval(pollInterval);
  }, [jobId, deploying]);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeploy = async () => {
    setDeploying(true);
    setError(null);
    setDeploymentResult(null);
    setLogs([]);
    setProgress(0);

    try {
      const response = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl,
          repoName: repoName || "repository",
          branch: "main",
          buildPath: buildPath.trim() || "",
          backendUrl: backendUrl.trim() || "",
          envVariables: envVariables.trim() || "",
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setJobId(data.jobId);
      } else {
        setError(data.error || data.details || "Deployment failed");
        setDeploying(false);
      }
    } catch (err) {
      setError(err.message || "Network error");
      setDeploying(false);
    }
  };

  if (status === "loading") {
    return (
      <div className={`min-h-screen ${THEME.ACCENT_BG} flex items-center justify-center`}>
        <div className={THEME.TEXT_SECONDARY}>Loading...</div>
      </div>
    );
  }

  // Get the primary deployment URL (prefer CloudFront over S3)
  const getPrimaryUrl = () => {
    if (!deploymentResult) return null;
    return deploymentResult.cloudFrontUrl || deploymentResult.s3Url;
  };

  const primaryUrl = getPrimaryUrl();

  return (
    <div className={`min-h-screen ${THEME.ACCENT_BG}`}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Header with Navigation */}
        <div className="flex justify-between items-center mb-10">
          <button
            onClick={() => router.push('/repos')}
            className={`px-4 py-2 ${THEME.BUTTON_SECONDARY.BG} hover:${THEME.BUTTON_SECONDARY.HOVER_BG} ${THEME.BUTTON_SECONDARY.TEXT} rounded-lg transition border ${THEME.BUTTON_SECONDARY.BORDER} flex items-center gap-2 text-sm shadow-sm`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Repos
          </button>
          <button
            onClick={() => signOut()}
            className={`px-4 py-2 ${THEME.BUTTON_SECONDARY.BG} hover:${THEME.BUTTON_SECONDARY.HOVER_BG} ${THEME.BUTTON_SECONDARY.TEXT} rounded-lg transition border ${THEME.BUTTON_SECONDARY.BORDER} text-sm shadow-sm`}
          >
            Sign out
          </button>
        </div>
        
        {/* Page Title */}
        <div className="text-center mb-12">
          <h1 className={`text-4xl sm:text-5xl font-extrabold ${THEME.TEXT_PRIMARY} mb-2`}>
            Deploy Repository
          </h1>
          <p className={`text-lg ${THEME.TEXT_SECONDARY}`}>
            Build and deploy to a global CloudFront CDN
          </p>
        </div>

        {/* Repository Card */}
        <div className={`${THEME.CARD_BG} border ${THEME.BORDER_COLOR} rounded-xl p-6 mb-8 shadow-md`}>
          <div className="flex items-start gap-5">
            <div className="flex-shrink-0">
              {/* GitHub Icon */}
              <svg className={`w-12 h-12 ${THEME.ACCENT}`} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className={`text-2xl font-bold ${THEME.TEXT_PRIMARY} mb-1`}>{repoName}</h2>
              <div className={`${THEME.CODE_BG} rounded-lg p-3 mb-2`}>
                <code className={`${THEME.CODE_TEXT} text-sm break-all`}>{repoUrl}</code>
              </div>
              <button
                onClick={() => handleCopy(repoUrl)}
                className={`text-xs px-3 py-1.5 ${THEME.ACCENT_BG} ${THEME.ACCENT} rounded-lg hover:bg-gray-200 transition`}
              >
                {copied ? '✓ Copied URL' : '📋 Copy Repository URL'}
              </button>
            </div>
          </div>
        </div>

        {/* Build Path Configuration (Pre-Deployment) */}
        {!deploying && !deploymentResult && (
          <div className={`${THEME.CARD_BG} border ${THEME.BORDER_COLOR} rounded-xl p-6 mb-8 shadow-md`}>
            <label className={`block ${THEME.TEXT_PRIMARY} font-semibold mb-3`}>
              Build Path (Optional)
              <span className={`text-sm font-normal ml-2 ${THEME.TEXT_SECONDARY}`}>
                For monorepos or nested projects
              </span>
            </label>
            <input
              type="text"
              value={buildPath}
              onChange={(e) => setBuildPath(e.target.value)}
              placeholder="e.g., frontend, packages/web, client"
              className={`w-full px-4 py-3 ${THEME.ACCENT_BG} border ${THEME.BORDER_COLOR} rounded-lg ${THEME.TEXT_PRIMARY} placeholder-gray-400 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500/50`}
            />
            <p className={`${THEME.TEXT_SECONDARY} text-sm mt-2`}>
              Leave empty if `package.json` is in the repository root. Enter the subdirectory path if your project is in a subfolder.
            </p>
          </div>
        )}

        {/* Environment Variables Configuration (Pre-Deployment) */}
        {!deploying && !deploymentResult && (
          <div className={`${THEME.CARD_BG} border ${THEME.BORDER_COLOR} rounded-xl p-6 mb-8 shadow-md`}>
            <label className={`block ${THEME.TEXT_PRIMARY} font-semibold mb-3`}>
              Environment Variables (Optional)
              <span className={`text-sm font-normal ml-2 ${THEME.TEXT_SECONDARY}`}>
                Configure your build environment
              </span>
            </label>
            
            {/* Quick Backend URL Input */}
            <div className="mb-4">
              <label className={`block ${THEME.TEXT_SECONDARY} text-sm mb-2`}>
                Quick Setup - Backend API URL
              </label>
              <input
                type="text"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="e.g., https://api.example.com"
                className={`w-full px-4 py-2 ${THEME.ACCENT_BG} border ${THEME.BORDER_COLOR} rounded-lg ${THEME.TEXT_PRIMARY} placeholder-gray-400 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500/50 text-sm`}
              />
              <p className={`${THEME.TEXT_SECONDARY} text-xs mt-1`}>
                Auto-creates: REACT_APP_API_URL, VITE_API_URL, NEXT_PUBLIC_API_URL
              </p>
            </div>

            {/* Custom Environment Variables */}
            <div>
              <label className={`block ${THEME.TEXT_SECONDARY} text-sm mb-2`}>
                Custom Variables (one per line)
              </label>
              <textarea
                value={envVariables}
                onChange={(e) => setEnvVariables(e.target.value)}
                placeholder={`REACT_APP_CUSTOM_KEY=value
VITE_FIREBASE_API_KEY=your_key
NEXT_PUBLIC_SITE_URL=https://example.com
API_TIMEOUT=5000`}
                rows={6}
                className={`w-full px-4 py-3 ${THEME.ACCENT_BG} border ${THEME.BORDER_COLOR} rounded-lg ${THEME.TEXT_PRIMARY} placeholder-gray-400 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500/50 font-mono text-sm`}
              />
              <p className={`${THEME.TEXT_SECONDARY} text-xs mt-2`}>
                Format: <code className="bg-gray-200 px-1 py-0.5 rounded">KEY=value</code> (one per line)
                <br />
                These will be available during build time in your application.
              </p>
            </div>
          </div>
        )}

        {/* Main Deploy Button (Initial State) */}
        {!deploying && !deploymentResult && !error && (
          <div className={`${THEME.CARD_BG} border ${THEME.BORDER_COLOR} rounded-xl p-8 mb-8 text-center shadow-lg`}>
            <h3 className={`text-3xl font-bold ${THEME.TEXT_PRIMARY} mb-3`}>
              Ready to Deploy?
            </h3>
            <p className={`${THEME.TEXT_SECONDARY} mb-8 text-lg`}>
              Initiate the build and deployment process to a high-speed CloudFront CDN.
            </p>
            
            <button
              onClick={handleDeploy}
              disabled={!repoUrl}
              className={`inline-flex items-center gap-3 px-10 py-4 ${THEME.BUTTON_PRIMARY.BG} ${THEME.BUTTON_PRIMARY.TEXT} font-bold text-xl rounded-lg hover:${THEME.BUTTON_PRIMARY.HOVER_BG} transition-all transform hover:scale-[1.02] shadow-xl disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              Deploy Now
            </button>
          </div>
        )}

        {/* Deployment Progress (Active State) */}
        {deploying && (
          <div className={`${THEME.CARD_BG} border ${THEME.BORDER_COLOR} rounded-xl p-8 mb-8 shadow-lg`}>
            <div className="text-center mb-6">
              <h3 className={`text-2xl font-bold ${THEME.TEXT_PRIMARY} mb-2`}>
                <span className="text-gray-500">🚀</span> Deploying...
              </h3>
              <div className={THEME.TEXT_SECONDARY}>Progress: **{progress}%**</div>
            </div>

            {/* Progress Bar (Monochromatic but distinct) */}
            <div className={`w-full ${THEME.ACCENT_BG} rounded-full h-3 mb-8`}>
              <div 
                className="bg-gray-900 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Build Steps */}
            <div className="space-y-5 mb-8">
              {buildSteps.map((step, index) => {
                const isActive = progress >= (buildSteps[index - 1]?.progress || 0) && progress < step.progress;
                const isComplete = progress >= step.progress;
                
                let iconClass = THEME.TEXT_SECONDARY;
                let textClass = THEME.TEXT_SECONDARY;

                if (isComplete) {
                  iconClass = "text-green-600"; // Slight color accent for completion
                  textClass = THEME.TEXT_PRIMARY;
                } else if (isActive) {
                  iconClass = "text-gray-900"; // Strong contrast for active step
                  textClass = THEME.TEXT_PRIMARY;
                }

                return (
                  <div key={step.key} className="flex items-center gap-4">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-2 ${isComplete ? 'border-green-600' : isActive ? 'border-gray-900' : THEME.BORDER_COLOR}`}>
                      {isComplete ? (
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isActive ? (
                        <svg className="animate-spin h-5 w-5 text-gray-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className={`font-medium ${textClass}`}>
                        {step.name}
                      </div>
                      <div className={`text-xs ${THEME.TEXT_SECONDARY}`}>{step.description.split('.')[0]}...</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live Logs */}
            {logs.length > 0 && (
              <div className={`${THEME.CODE_BG} rounded-lg p-4 max-h-64 overflow-y-auto border border-gray-700`}>
                <div className="text-xs font-mono space-y-1">
                  <div className="text-gray-500 sticky top-0 bg-gray-900 py-1 mb-1 border-b border-gray-700">**Deployment Logs**</div>
                  {logs.map((log, index) => (
                    // Highlight error logs in red, success in green
                    <div key={index} className={log.toLowerCase().includes('error') ? 'text-red-400' : log.toLowerCase().includes('success') || log.toLowerCase().includes('complete') ? 'text-green-400' : THEME.CODE_TEXT}>
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Success Result */}
        {deploymentResult && (
          <div className={`${THEME.CARD_BG} border ${THEME.SUCCESS.BORDER} bg-green-50 rounded-xl p-8 mb-8 shadow-lg`}>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 rounded-full mb-4 shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className={`text-3xl font-bold ${THEME.TEXT_PRIMARY} mb-2`}> Deployment Successful!</h3>
              <p className={THEME.SUCCESS.TEXT}>Your app is now live on the global CloudFront CDN.</p>
            </div>

            {/* Primary Deployment URL - CloudFront or S3 */}
            {primaryUrl && (
              <div className={`border ${THEME.SUCCESS.BORDER} ${THEME.CARD_BG} rounded-lg p-6 mb-6 shadow-inner`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-8 h-8 bg-green-600 rounded-full`}>
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                    </div>
                    <div>
                      <div className={`${THEME.TEXT_PRIMARY} font-bold text-lg`}>
                        {deploymentResult.cloudFrontUrl ? '🌐 Live CloudFront URL' : '📦 Deployment URL'}
                      </div>
                      <div className={`text-green-700 text-sm`}>
                        {deploymentResult.cloudFrontUrl ? 'Global CDN - Fast & Secure (HTTPS)' : 'Your site is live'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => window.open(primaryUrl, '_blank')}
                    className={`px-6 py-2 ${THEME.BUTTON_PRIMARY.BG} hover:${THEME.BUTTON_PRIMARY.HOVER_BG} ${THEME.BUTTON_PRIMARY.TEXT} rounded-lg transition text-sm font-bold shadow-md`}
                  >
                    Visit Site
                  </button>
                </div>
                <div className={`${THEME.ACCENT_BG} rounded-lg p-3 mb-3 border ${THEME.BORDER_COLOR}`}>
                  <code className={`${THEME.TEXT_PRIMARY} font-mono text-sm break-all`}>{primaryUrl}</code>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopy(primaryUrl)}
                    className={`flex-1 text-sm px-4 py-2 ${THEME.BUTTON_SECONDARY.BG} border ${THEME.BUTTON_SECONDARY.BORDER} hover:${THEME.BUTTON_SECONDARY.HOVER_BG} ${THEME.BUTTON_SECONDARY.TEXT} rounded-lg transition font-semibold`}
                  >
                    {copied ? '✓ Copied!' : '📋 Copy URL'}
                  </button>
                </div>
              </div>
            )}

            {/* Deployment Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className={`${THEME.ACCENT_BG} rounded-lg p-4 border ${THEME.BORDER_COLOR}`}>
                <div className={`text-sm mb-1 ${THEME.TEXT_SECONDARY}`}>Deployment ID</div>
                <code className={`${THEME.TEXT_PRIMARY} font-mono text-sm`}>{deploymentResult.deploymentId}</code>
              </div>
              <div className={`${THEME.ACCENT_BG} rounded-lg p-4 border ${THEME.BORDER_COLOR}`}>
                <div className={`text-sm mb-1 ${THEME.TEXT_SECONDARY}`}>Files Deployed</div>
                <div className={`${THEME.TEXT_PRIMARY} font-semibold`}>{deploymentResult.uploadedCount} files</div>
              </div>
              <div className={`${THEME.ACCENT_BG} rounded-lg p-4 border ${THEME.BORDER_COLOR}`}>
                <div className={`text-sm mb-1 ${THEME.TEXT_SECONDARY}`}>S3 Bucket</div>
                <code className={`${THEME.TEXT_PRIMARY} font-mono text-sm`}>{deploymentResult.bucket}</code>
              </div>
              <div className={`${THEME.ACCENT_BG} rounded-lg p-4 border ${THEME.BORDER_COLOR}`}>
                <div className={`text-sm mb-1 ${THEME.TEXT_SECONDARY}`}>Repository</div>
                <div className={`${THEME.TEXT_PRIMARY} font-semibold`}>{deploymentResult.repoName}</div>
              </div>
            </div>
            
            <button
              onClick={() => { 
                setDeploymentResult(null); 
                setError(null); 
                setLogs([]);
                setProgress(0);
              }}
              className={`w-full px-6 py-3 ${THEME.BUTTON_SECONDARY.BG} border ${THEME.BUTTON_SECONDARY.BORDER} hover:${THEME.BUTTON_SECONDARY.HOVER_BG} ${THEME.BUTTON_SECONDARY.TEXT} font-semibold rounded-lg transition mt-4`}
            >
              Deploy Another Project
            </button>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className={`${THEME.CARD_BG} border ${THEME.ERROR.BORDER} bg-red-50 rounded-xl p-8 mb-8 text-center shadow-lg`}>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 rounded-full mb-4 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className={`text-2xl font-bold ${THEME.TEXT_PRIMARY} mb-2`}>❌ Deployment Failed</h3>
            <p className={THEME.ERROR.TEXT}>**Error:** {error}</p>
            
            {logs.length > 0 && (
              <div className={`${THEME.CODE_BG} rounded-lg p-4 mb-6 mt-6 max-h-48 overflow-y-auto text-left border border-gray-700`}>
                <div className="text-xs font-mono space-y-1">
                  <div className="text-gray-500 sticky top-0 bg-gray-900 py-1 mb-1 border-b border-gray-700">**Failure Logs**</div>
                  {logs.map((log, index) => (
                    <div key={index} className="text-red-400">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <button
              onClick={() => { 
                setError(null); 
                setDeploymentResult(null); 
                setLogs([]);
                setProgress(0);
              }}
              className={`px-6 py-3 ${THEME.BUTTON_PRIMARY.BG} ${THEME.BUTTON_PRIMARY.TEXT} font-semibold rounded-lg hover:${THEME.BUTTON_PRIMARY.HOVER_BG} transition mt-4`}
            >
              Try Deploying Again
            </button>
          </div>
        )}

        {/* Steps Guide (Initial State) */}
        {!deploying && !deploymentResult && (
          <div className={`${THEME.CARD_BG} border ${THEME.BORDER_COLOR} rounded-xl p-8 mb-8 shadow-md`}>
            <h3 className={`text-2xl font-bold ${THEME.TEXT_PRIMARY} mb-6 border-b ${THEME.BORDER_COLOR} pb-3 flex items-center gap-3`}>
              <span className={`flex items-center justify-center w-6 h-6 bg-gray-900 text-white text-sm rounded-full`}>?</span>
              Deployment Workflow
            </h3>
            
            <div className="space-y-6">
              {buildSteps.map((step, index) => (
                <div key={step.key} className="flex gap-4 items-start">
                  <div className={`flex-shrink-0 w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h4 className={`${THEME.TEXT_PRIMARY} font-semibold mb-1 text-lg`}>{step.name}</h4>
                    <p className={`${THEME.TEXT_SECONDARY} text-sm`}>
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className={`${THEME.ACCENT_BG} border ${THEME.BORDER_COLOR} rounded-xl p-6`}>
          <h3 className={`${THEME.TEXT_PRIMARY} font-semibold mb-3 border-b ${THEME.BORDER_COLOR} pb-2 flex items-center gap-2`}>
            <span>💡</span>
            About CloudFront CDN
          </h3>
          <p className={`${THEME.TEXT_SECONDARY} text-sm mb-3`}>
            Your application is served from **AWS CloudFront**, a robust Content Delivery Network that ensures your site loads fast globally.
          </p>
          <ul className={`${THEME.TEXT_PRIMARY} text-sm space-y-2`}>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>**HTTPS encryption** by default for security.</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>**Fast loading** from edge locations worldwide.</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>**Automatic caching** for optimal performance and scale.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function DeployPage() {
  return (
    <Suspense fallback={
      <div className={`min-h-screen ${THEME.ACCENT_BG} flex items-center justify-center`}>
        <div className={`${THEME.TEXT_PRIMARY} text-xl`}>Loading...</div>
      </div>
    }>
      <DeployContent />
    </Suspense>
  );
}