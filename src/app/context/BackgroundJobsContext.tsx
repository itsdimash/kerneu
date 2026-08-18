import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from "react";
import { getParseJobStatus, type ParseJobStatusValue } from "../../api/api";

export type BackgroundJob = {
  jobId: string;
  projectId: number;
  projectName: string;
  fileName: string;
  status: ParseJobStatusValue;
  errorMessage?: string | null;
  mlImportId?: number | null;
};

const PARSE_POLL_INTERVAL_MS = 3000;

type BackgroundJobsContextValue = {
  backgroundJobs: BackgroundJob[];
  startBackgroundJob: (job: {
    jobId: string;
    projectId: number;
    projectName: string;
    fileName: string;
  }) => void;
  dismissBackgroundJob: (jobId: string) => void;
};

const BackgroundJobsContext = createContext<BackgroundJobsContextValue | null>(null);

// Живёт на уровне App.tsx (оборачивает AppShell целиком), поэтому опрос
// статуса и сам тост переживают переключение между страницами дашборда —
// раньше это состояние было локальным в DashboardPM и пропадало вместе с
// компонентом, как только пользователь уходил со страницы дашборда.
export function BackgroundJobsProvider({ children }: { children: React.ReactNode }) {
  const [backgroundJobs, setBackgroundJobs] = useState<BackgroundJob[]>([]);
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    return () => {
      Object.values(pollTimers.current).forEach(clearInterval);
    };
  }, []);

  const dismissBackgroundJob = useCallback((jobId: string) => {
    if (pollTimers.current[jobId]) {
      clearInterval(pollTimers.current[jobId]);
      delete pollTimers.current[jobId];
    }
    setBackgroundJobs((prev) => prev.filter((j) => j.jobId !== jobId));
  }, []);

  const pollJobStatus = useCallback((jobId: string) => {
    pollTimers.current[jobId] = setInterval(async () => {
      try {
        const data = await getParseJobStatus(jobId);

        setBackgroundJobs((prev) =>
          prev.map((j) =>
            j.jobId === jobId
              ? {
                  ...j,
                  status: data.status,
                  errorMessage: data.error_message,
                  mlImportId: data.ml_import_id,
                }
              : j,
          ),
        );

        if (data.status === "done" || data.status === "failed") {
          clearInterval(pollTimers.current[jobId]);
          delete pollTimers.current[jobId];

          if (data.status === "done") {
            localStorage.setItem(
              `project:${data.project_id}:mlImportId`,
              String(data.ml_import_id),
            );
          }
        }
      } catch (err) {
        console.error("Ошибка опроса статуса обработки файла:", err);
      }
    }, PARSE_POLL_INTERVAL_MS);
  }, []);

  const startBackgroundJob = useCallback(
    (job: { jobId: string; projectId: number; projectName: string; fileName: string }) => {
      setBackgroundJobs((prev) => [
        ...prev,
        {
          jobId: job.jobId,
          projectId: job.projectId,
          projectName: job.projectName,
          fileName: job.fileName,
          status: "pending",
        },
      ]);
      pollJobStatus(job.jobId);
    },
    [pollJobStatus],
  );

  return (
    <BackgroundJobsContext.Provider
      value={{ backgroundJobs, startBackgroundJob, dismissBackgroundJob }}
    >
      {children}
    </BackgroundJobsContext.Provider>
  );
}

export function useBackgroundJobs(): BackgroundJobsContextValue {
  const ctx = useContext(BackgroundJobsContext);
  if (!ctx) {
    throw new Error("useBackgroundJobs должен использоваться внутри BackgroundJobsProvider");
  }
  return ctx;
}