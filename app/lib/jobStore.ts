// Simple in-memory store for job results
// In production, replace with Redis, database, or Inngest's state management

import type { VideoSearchResult } from "@/app/db/videos";

type JobStatus = "processing" | "completed" | "failed";

interface JobData {
  status: JobStatus;
  results?: VideoSearchResult[];
  error?: string;
  progress?: {
    step: number;
    totalSteps: number;
    currentStep: string;
  };
}

class JobStore {
  private store = new Map<string, JobData>();

  set(jobId: string, data: JobData) {
    this.store.set(jobId, data);

    // Clean up after 10 minutes
    setTimeout(
      () => {
        this.store.delete(jobId);
      },
      10 * 60 * 1000,
    );
  }

  get(jobId: string): JobData | undefined {
    return this.store.get(jobId);
  }

  updateProgress(
    jobId: string,
    progress: { step: number; totalSteps: number; currentStep: string },
  ) {
    const existing = this.store.get(jobId) || {
      status: "processing" as JobStatus,
    };
    this.store.set(jobId, { ...existing, progress });
  }

  delete(jobId: string) {
    this.store.delete(jobId);
  }
}

export const jobStore = new JobStore();
