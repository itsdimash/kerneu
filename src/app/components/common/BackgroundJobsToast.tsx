import { useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Loader2, CheckCircle2, XCircle, X, ChevronRight, Download } from "lucide-react";
import { useBackgroundJobs } from "../../context/BackgroundJobsContext";
import { downloadParseJobResult } from "../../../api/api";
import type { Page } from "../../../types";

// Тот же изгиб, что и --ease-out-strong в theme.css
const EASE_OUT_STRONG = [0.23, 1, 0.32, 1] as const;

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
    // Контейнер остаётся смонтированным, чтобы последний тост тоже успел уехать.
    // reducedMotion="user": при «уменьшить движение» остаются только фейды.
    <MotionConfig reducedMotion="user">
    <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 w-80">
      {/* popLayout: закрытый тост сразу выходит из потока, и соседи
          доезжают на место одновременно с его исчезновением */}
      <AnimatePresence mode="popLayout" initial={false}>
      {backgroundJobs.map((job) => (
        <motion.div
          key={job.jobId}
          layout
          // y, а не строка transform: layout-анимация сама пишет transform,
          // и motion должен собрать их в одно значение
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8, transition: { duration: 0.15, ease: EASE_OUT_STRONG } }}
          transition={{
            opacity: { duration: 0.2, ease: EASE_OUT_STRONG },
            y: { duration: 0.2, ease: EASE_OUT_STRONG },
            // Остальные тосты доезжают на место, когда соседний закрыли
            layout: { type: "spring", duration: 0.4, bounce: 0 },
          }}
          className="bg-card border border-border rounded-lg shadow-lg p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              {(job.status === "pending" || job.status === "processing") && (
                <Loader2 size={16} className="text-primary animate-spin flex-shrink-0 mt-0.5" />
              )}
              {job.status === "done" && (
                <CheckCircle2 size={16} className="text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5 animate-in fade-in zoom-in-90 duration-200 ease-out-strong" />
              )}
              {job.status === "failed" && (
                <XCircle size={16} className="text-destructive flex-shrink-0 mt-0.5 animate-in fade-in zoom-in-90 duration-200 ease-out-strong" />
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
        </motion.div>
      ))}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}