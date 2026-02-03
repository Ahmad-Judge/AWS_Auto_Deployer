import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { deployQueue } from "@/lib/queues/deployQueue";

function generateDeploymentId() {
  return crypto.randomBytes(8).toString("hex");
}

async function ensureDistDirectory() {
  const distPath = path.join(process.cwd(), "dist");
  try {
    await fs.access(distPath);
  } catch {
    await fs.mkdir(distPath, { recursive: true });
  }
  return distPath;
}

async function ensureTempDirectory() {
  const tempPath = path.join(process.cwd(), "temp");
  try {
    await fs.access(tempPath);
  } catch {
    await fs.mkdir(tempPath, { recursive: true });
  }
  return tempPath;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { repoUrl, repoName, branch = "main", buildPath = "", backendUrl = "", envVariables = "", useQueue = true } = body;

    // Validate required fields
    if (!repoUrl) {
      return NextResponse.json(
        { error: "Repository URL is required" },
        { status: 400 }
      );
    }

    // Validate repository URL format
    const gitUrlPattern = /^(https?:\/\/)?([\w\.-]+@)?([\w\.-]+)(:\d+)?(\/[\w\.-]+)*\.git$/i;
    const githubPattern = /^https?:\/\/github\.com\/[\w-]+\/[\w-]+$/i;
    
    if (!gitUrlPattern.test(repoUrl) && !githubPattern.test(repoUrl) && !repoUrl.endsWith('.git')) {
      return NextResponse.json(
        { error: "Invalid repository URL format" },
        { status: 400 }
      );
    }

    // Generate unique deployment ID
    const deploymentId = generateDeploymentId();
    
    // Ensure directories exist
    await ensureDistDirectory();
    await ensureTempDirectory();

    // Use BullMQ queue for build & deploy
    if (useQueue) {
      try {
        const job = await deployQueue.add("deploy", {
          repoUrl,
          repoName: repoName || "repository",
          branch,
          buildPath,
          backendUrl,
          envVariables,
          deploymentId,
        }, {
          attempts: 3, // Retry failed jobs 3 times
          backoff: {
            type: 'exponential',
            delay: 5000, // Start with 5 second delay
          },
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 50, // Keep last 50 failed jobs
        });

        return NextResponse.json({
          success: true,
          deploymentId,
          jobId: job.id,
          repoName: repoName || "repository",
          branch,
          message: "Deployment job created. Build process will start shortly.",
          statusUrl: `/api/deploy/status?jobId=${job.id}`,
          logsUrl: `/api/deploy/logs?jobId=${job.id}`,
          useQueue: true,
          timestamp: new Date().toISOString(),
        });
      } catch (queueError) {
        console.error("Queue error:", queueError);
        return NextResponse.json(
          { 
            error: "Failed to create deployment job", 
            details: queueError.message 
          },
          { status: 500 }
        );
      }
    }

    // Fallback: Direct deployment (not recommended for production)
    return NextResponse.json({
      error: "Direct deployment is disabled. Use queue-based deployment.",
    }, { status: 400 });

  } catch (error) {
    console.error("Deployment error:", error);
    
    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { 
        error: "Deployment failed", 
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check deployment status
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const deploymentId = searchParams.get("deploymentId");

    if (!deploymentId) {
      return NextResponse.json(
        { error: "Deployment ID is required" },
        { status: 400 }
      );
    }

    const distPath = path.join(process.cwd(), "dist", deploymentId);
    
    try {
      await fs.access(distPath);
      const stats = await fs.stat(distPath);
      
      // Count files in deployment
      const files = await fs.readdir(distPath, { recursive: true });
      
      const bucket = process.env.AWS_S3_BUCKET_NAME || "aws-auto-deployer";
      const s3Url = `https://${bucket}.s3.${process.env.AWS_REGION || 'eu-north-1'}.amazonaws.com/${deploymentId}/index.html`;

      return NextResponse.json({
        success: true,
        deploymentId,
        exists: true,
        path: distPath,
        created: stats.birthtime,
        modified: stats.mtime,
        filesCount: files.length,
        s3Url,
      });
    } catch {
      return NextResponse.json({
        success: false,
        deploymentId,
        exists: false,
        message: "Deployment not found",
      });
    }
  } catch (error) {
    console.error("Error checking deployment:", error);
    return NextResponse.json(
      { error: "Failed to check deployment status" },
      { status: 500 }
    );
  }
}