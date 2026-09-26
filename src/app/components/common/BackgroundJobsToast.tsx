import { useState } from "react";
import { Loader2, CheckCircle2, XCircle, X, ChevronRight, Download } from "lucide-react";
import { useBackgroundJobs } from "../../context/BackgroundJobsContext";
import { downloadParseJobResult } from "../../../api/api";
import type { Page } from "../../../types";

type Props = {
  onOpenProject: (projectId: number, page?: Page) => void;
};

// Рендерится один раз на уровне App.tsx (внутри BackgroundJobsProvider),
// поэтому остаётся видимым независимо от того, какая страница дашборда
// сейчас открыта — раньше это жило локально внутри DashboardPM и исчезало
// при переходе на другую страницу.
export function BackgroundJobsToast({ onOpenProject }: Props) {
  const { backgroundJobs, dismissBackgroundJob } = useBackgroundJobs();
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);

  if (backgroundJobs.length === 0) return null;

  const handleDownload = async (jobId: string) => {
    setDownloadingJobId(jobId);
    try {
      await downloadParseJobResult(jobId);
    } catch (e) {
      console.error(`Не удалось скачать результат обработки файла (job ${jobId})`, e);
      alert("Не удалось скачать результат обработки файла. Попробуйте ещё раз.");
    } finally {
      setDownloadingJobId(null);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 w-80">
      {backgroundJobs.map((job) => (
        <div
          key={job.jobId}
          className="bg-card border border-border rounded-lg shadow-lg p-4 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              {(job.status === "pending" || job.status === "processing") && (
                <Loader2 size={16} className="text-primary animate-spin flex-shrink-0 mt-0.5" />
              )}
              {job.status === "done" && (
                <CheckCircle2 size={16} className="text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" />
              )}
              {job.status === "failed" && (
                <XCircle size={16} className="text-destructive flex-shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{job.projectName}</p>
                <p className="text-xs text-muted-foreground truncate">{job.fileName}</p>
                <p className="text-xs mt-1">
                  {job.status === "pending" && <span className="text-muted-foreground">В очереди...</span>}
                  {job.status === "processing" && <span className="text-muted-foreground">Обрабатывается...</span>}
                  {job.status === "done" && <span className="text-green-600 dark:text-green-400">Готово — товары сопоставлены</span>}
                  {job.status === "failed" && (
                    <span className="text-destructive">{job.errorMessage || "Ошибка обработки"}</span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={() => dismissBackgroundJob(job.jobId)}
              className="text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          {job.status === "done" && (
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={() => {
                  dismissBackgroundJob(job.jobId);
                  onOpenProject(job.projectId);
                }}
                className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-0.5"
              >
                Открыть проект <ChevronRight size={12} />
              </button>

              {!job.isContractMode && (
                <button
                  onClick={() => handleDownload(job.jobId)}
                  disabled={downloadingJobId === job.jobId}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-60"
                >
                  {downloadingJobId === job.jobId ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Download size={12} />
                  )}
                  Скачать результат
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}