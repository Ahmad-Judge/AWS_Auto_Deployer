import { NextResponse } from "next/server";
import { deployQueue } from "@/lib/queues/deployQueue";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "Job ID is required" },
        { status: 400 }
      );
    }

    const job = await deployQueue.getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    const logs = await job.getLog();

    return NextResponse.json({
      jobId,
      logs: logs ? logs.split('\n').filter(Boolean) : [],
    });
  } catch (error) {
    console.error("Logs fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch logs" },
      { status: 500 }
      );
  }
}