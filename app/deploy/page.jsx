"use client";

import { useEffect, useState, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

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
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setJobId(data.jobId);
        // Polling will start via useEffect
      } else {
        setError(data.error || data.details || "Deployment failed");
        setDeploying(false);
      }
    } catch (err) {
      setError(err.message || "Network error");
      setDeploying(false);
    }
  };

  const getStepStatus = (stepName) => {
    const logText = logs.join(' ').toLowerCase();
    
    if (logText.includes(stepName.toLowerCase())) {
      if (logText.includes(`✓ ${stepName.toLowerCase()}`) || 
          logText.includes(`${stepName.toLowerCase()} complete`)) {
        return 'complete';
      }
      return 'active';
    }
    return 'pending';
  };

  const buildSteps = [
    { name: 'Cloning repository', key: 'cloning', progress: 15 },
    { name: 'Installing dependencies', key: 'installing', progress: 40 },
    { name: 'Building project', key: 'building', progress: 70 },
    { name: 'Uploading to S3', key: 'uploading', progress: 95 },
    { name: 'CloudFront invalidation', key: 'cloudfront', progress: 100 },
  ];

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading...</div>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header with Navigation */}
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => router.push('/repos')}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition border border-white/20 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Repos
          </button>
          <button
            onClick={() => signOut()}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition border border-white/20"
          >
            Sign out
          </button>
        </div>
        
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-500 rounded-2xl mb-6 shadow-lg">
            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
            </svg>
          </div>
          <h1 className="text-5xl font-bold text-white mb-3">Deploy Repository</h1>
          <p className="text-blue-200 text-lg">Build and deploy to CloudFront CDN</p>
        </div>

        {/* Repository Card */}
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <svg className="w-14 h-14 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-white mb-2">{repoName}</h2>
              <div className="bg-slate-900/50 rounded-lg p-3 mb-2">
                <code className="text-green-400 text-sm break-all">{repoUrl}</code>
              </div>
              <button
                onClick={() => handleCopy(repoUrl)}
                className="text-xs px-3 py-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition"
              >
                {copied ? '✓ Copied!' : '📋 Copy URL'}
              </button>
            </div>
          </div>
        </div>

        {/* Build Path Configuration */}
        {!deploying && !deploymentResult && (
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 mb-8">
            <label className="block text-white font-semibold mb-3">
              Build Path (Optional)
              <span className="text-blue-300 text-sm font-normal ml-2">For monorepos or nested projects</span>
            </label>
            <input
              type="text"
              value={buildPath}
              onChange={(e) => setBuildPath(e.target.value)}
              placeholder="e.g., frontend, packages/web, client"
              className="w-full px-4 py-3 bg-slate-900/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/50"
            />
            <p className="text-blue-200 text-sm mt-2">
              Leave empty if package.json is in the repository root. Enter the subdirectory path if your project is in a subfolder.
            </p>
          </div>
        )}

        {/* Deployment Progress */}
        {deploying && (
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 mb-8">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">🚀 Deploying...</h3>
              <div className="text-blue-200 text-sm">Progress: {progress}%</div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-900/50 rounded-full h-3 mb-8">
              <div 
                className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Build Steps */}
            <div className="space-y-4 mb-6">
              {buildSteps.map((step, index) => {
                const status = progress >= step.progress ? 'complete' : 
                              progress >= (buildSteps[index - 1]?.progress || 0) ? 'active' : 
                              'pending';
                
                return (
                  <div key={step.key} className="flex items-center gap-4">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                      status === 'complete' ? 'bg-green-500' :
                      status === 'active' ? 'bg-blue-500 animate-pulse' :
                      'bg-slate-700'
                    }`}>
                      {status === 'complete' ? (
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : status === 'active' ? (
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className={`font-semibold ${
                        status === 'complete' ? 'text-green-400' :
                        status === 'active' ? 'text-blue-400' :
                        'text-slate-400'
                      }`}>
                        {step.name}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live Logs */}
            {logs.length > 0 && (
              <div className="bg-slate-900 rounded-lg p-4 max-h-64 overflow-y-auto">
                <div className="text-xs font-mono space-y-1">
                  {logs.map((log, index) => (
                    <div key={index} className="text-green-400">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Deploy Button */}
        {!deploying && !deploymentResult && !error && (
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl p-10 mb-8 text-center shadow-2xl">
            <h3 className="text-3xl font-bold text-white mb-3">🚀 Deploy to CloudFront</h3>
            <p className="text-blue-100 mb-8 text-lg">
              Build and deploy your app to AWS CloudFront CDN with HTTPS
            </p>
            
            <button
              onClick={handleDeploy}
              className="inline-flex items-center gap-3 px-10 py-5 bg-white text-blue-600 font-bold text-xl rounded-xl hover:bg-blue-50 transition-all transform hover:scale-105 shadow-xl"
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              Deploy Now
            </button>

            <p className="text-xs text-blue-100 mt-5">
              This will clone, build, and deploy your repository to CloudFront CDN
            </p>
          </div>
        )}

        {/* Success Result */}
        {deploymentResult && (
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 mb-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500 rounded-full mb-4">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-3xl font-bold text-white mb-2">✅ Deployment Successful!</h3>
              <p className="text-green-400">Your app is now live on CloudFront CDN</p>
            </div>

            {/* Primary Deployment URL - CloudFront or S3 */}
            {primaryUrl && (
              <div className="bg-gradient-to-r from-green-500/20 to-blue-500/20 border-2 border-green-500/50 rounded-xl p-6 mb-6 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 bg-green-500 rounded-full">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-white font-bold text-lg">
                        {deploymentResult.cloudFrontUrl ? '🌐 CloudFront URL (HTTPS)' : '📦 Deployment URL'}
                      </div>
                      <div className="text-green-300 text-xs">
                        {deploymentResult.cloudFrontUrl ? 'Global CDN - Fast & Secure' : 'Your site is live'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => window.open(primaryUrl, '_blank')}
                    className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition text-sm font-bold shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    🚀 Visit Site
                  </button>
                </div>
                <div className="bg-slate-900 rounded-lg p-4 mb-3">
                  <code className="text-green-300 font-mono text-sm break-all">{primaryUrl}</code>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopy(primaryUrl)}
                    className="flex-1 text-sm px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition font-semibold"
                  >
                    {copied ? '✓ Copied!' : '📋 Copy URL'}
                  </button>
                  <button
                    onClick={() => window.open(primaryUrl, '_blank')}
                    className="flex-1 text-sm px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg transition font-semibold"
                  >
                    🔗 Open in New Tab
                  </button>
                </div>
              </div>
            )}

            {/* Deployment Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-blue-300 text-sm mb-1">Deployment ID</div>
                <code className="text-white font-mono text-sm">{deploymentResult.deploymentId}</code>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-blue-300 text-sm mb-1">Files Deployed</div>
                <div className="text-white font-semibold">{deploymentResult.uploadedCount} files</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-blue-300 text-sm mb-1">S3 Bucket</div>
                <code className="text-white font-mono text-sm">{deploymentResult.bucket}</code>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-blue-300 text-sm mb-1">Repository</div>
                <div className="text-white font-semibold">{deploymentResult.repoName}</div>
              </div>
            </div>

            {/* Additional URLs Section - Only show if both URLs exist */}
            {deploymentResult.cloudFrontUrl && deploymentResult.s3Url && (
              <div className="bg-slate-900/30 border border-slate-700 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-slate-400 text-sm font-semibold">Alternative Access</div>
                </div>
                <div className="text-slate-500 text-xs mb-2">S3 Direct URL (not recommended for production):</div>
                <code className="text-slate-400 text-xs break-all block bg-slate-900/50 p-2 rounded">{deploymentResult.s3Url}</code>
              </div>
            )}

            <button
              onClick={() => { 
                setDeploymentResult(null); 
                setError(null); 
                setLogs([]);
                setProgress(0);
              }}
              className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition"
            >
              Deploy Another Project
            </button>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-2xl p-8 mb-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-red-500 rounded-full mb-4">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">❌ Deployment Failed</h3>
            <p className="text-red-200 mb-6">{error}</p>
            
            {logs.length > 0 && (
              <div className="bg-slate-900 rounded-lg p-4 mb-6 max-h-48 overflow-y-auto text-left">
                <div className="text-xs font-mono space-y-1">
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
              className="px-6 py-3 bg-white text-red-600 font-semibold rounded-lg hover:bg-red-50 transition"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Steps Guide */}
        {!deploying && !deploymentResult && (
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 mb-8">
            <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 bg-blue-500 text-white text-sm rounded-full">?</span>
              How It Works
            </h3>
            
            <div className="space-y-6">
              {buildSteps.map((step, index) => (
                <div key={step.key} className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-semibold mb-1 text-lg">{step.name}</h4>
                    <p className="text-blue-200 text-sm">
                      {index === 0 && "Clone your repository from GitHub"}
                      {index === 1 && "Install project dependencies with npm"}
                      {index === 2 && "Build your project for production"}
                      {index === 3 && "Upload files to AWS S3 bucket"}
                      {index === 4 && "Invalidate CloudFront cache and generate CDN URL"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <span>💡</span>
            About CloudFront Deployment
          </h3>
          <p className="text-blue-200 text-sm mb-3">
            Your app will be deployed to AWS CloudFront, a global CDN that provides:
          </p>
          <ul className="text-blue-200 text-sm space-y-2">
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>HTTPS encryption by default</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Fast loading from edge locations worldwide</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Automatic caching for better performance</span>
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    }>
      <DeployContent />
    </Suspense>
  );
}