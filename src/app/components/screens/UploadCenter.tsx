import React, { useMemo, useRef, useState } from "react";
import {
  Upload, FileText, Search, Send, Edit3, Trash2, RefreshCw, Clock,
  CheckCircle2, XCircle, AlertCircle, AlertTriangle, Loader2, Download,
  Check, Info,
} from "lucide-react";

import { cn } from "../ui/utils";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { Progress } from "../ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../ui/dialog";

// ─── Types ────────────────────────────────────────────────
export type FileStatus = "queued" | "processing" | "ready" | "error" | "needs_input";

export type UploadedFile = {
  id: string;
  filename: string;
  project: string;
  uploadedAt: string;
  totalItems: number;
  missingPrices: number;
  status: FileStatus;
  size: string;
  /** 0–100, only meaningful while status === "processing" (req. 7.5) */
  progress?: number;
  /** human-readable reason, only when status === "error" (req. 7.5) */
  errorMessage?: string;
};

export type UnpricedItem = {
  fileId: string;
  filename: string;
  itemId: number;
  name: string;
  qty: number;
  unit: string;
  price: number;
};

// ─── Utils ────────────────────────────────────────────────
const formatTenge = (n: number) => `${n.toLocaleString("ru-RU")} ₸`;

// ─── Mock data (screen-local; swap for API later) ─────────
const MOCK_QUEUE: UploadedFile[] = [
  { id: "f1", filename: "КП_Башня_v.xlsx",        project: "Офисный комплекс «Башня»",  uploadedAt: "10:32", totalItems: 12, missingPrices: 3, status: "needs_input", size: "248 КБ" },
  { id: "f2", filename: "КП_Меридиан_final.xlsx",  project: "Торговый центр «Меридиан»", uploadedAt: "10:15", totalItems:  8, missingPrices: 0, status: "ready",       size: "192 КБ" },
  { id: "f3", filename: "Спецификация_Nord.pdf",   project: "Реконструкция склада Nord", uploadedAt: "09:58", totalItems:  0, missingPrices: 0, status: "error",       size: "1.2 МБ", errorMessage: "Не удалось распознать таблицу в документе" },
  { id: "f4", filename: "КП_Парковый_v1.xlsx",     project: "Жилой комплекс «Парковый»", uploadedAt: "09:41", totalItems: 15, missingPrices: 5, status: "needs_input", size: "310 КБ" },
  { id: "f5", filename: "Смета_2024_Q3.xlsx",      project: "Офисный комплекс «Башня»",  uploadedAt: "09:20", totalItems:  0, missingPrices: 0, status: "queued",      size: "88 КБ"  },
  { id: "f6", filename: "КП_Технопарк_draft.xlsx", project: "Технопарк «Горизонт»",      uploadedAt: "09:05", totalItems:  0, missingPrices: 0, status: "processing",  size: "156 КБ", progress: 78 },
];

const MOCK_HISTORY: UploadedFile[] = [
  { id: "h1", filename: "КП_Башня_v2.xlsx",       project: "Офисный комплекс «Башня»",  uploadedAt: "15.07.2024", totalItems: 12, missingPrices: 0, status: "ready",       size: "231 КБ" },
  { id: "h2", filename: "КП_Башня_v1.xlsx",       project: "Офисный комплекс «Башня»",  uploadedAt: "12.07.2024", totalItems: 10, missingPrices: 0, status: "ready",       size: "198 КБ" },
  { id: "h3", filename: "КП_Nord_spec.xlsx",      project: "Реконструкция склада Nord", uploadedAt: "10.07.2024", totalItems: 18, missingPrices: 4, status: "needs_input", size: "442 КБ" },
  { id: "h4", filename: "Смета_Q2_final.pdf",     project: "Жилой комплекс «Парковый»", uploadedAt: "05.07.2024", totalItems:  0, missingPrices: 0, status: "error",       size: "3.1 МБ", errorMessage: "Файл повреждён или защищён паролем" },
  { id: "h5", filename: "КП_Меридиан_v3.xlsx",    project: "Торговый центр «Меридиан»", uploadedAt: "01.07.2024", totalItems: 24, missingPrices: 0, status: "ready",       size: "512 КБ" },
  { id: "h6", filename: "КП_Меридиан_v2.xlsx",    project: "Торговый центр «Меридиан»", uploadedAt: "28.06.2024", totalItems: 22, missingPrices: 0, status: "ready",       size: "487 КБ" },
  { id: "h7", filename: "КП_Парковый_draft.xlsx", project: "Жилой комплекс «Парковый»", uploadedAt: "25.06.2024", totalItems:  8, missingPrices: 2, status: "needs_input", size: "189 КБ" },
];

const UNPRICED_ITEMS_INIT: UnpricedItem[] = [
  { fileId: "f1", filename: "КП_Башня_v3.xlsx",    itemId: 1, name: "Фурнитура ROTO NT (комплект)", qty: 180,  unit: "компл.", price: 0 },
  { fileId: "f1", filename: "КП_Башня_v3.xlsx",    itemId: 2, name: "Подоконник ПВХ Danke 300мм",   qty: 320,  unit: "п.м.",   price: 0 },
  { fileId: "f1", filename: "КП_Башня_v3.xlsx",    itemId: 3, name: "Откос пластиковый 200мм",      qty: 180,  unit: "п.м.",   price: 0 },
  { fileId: "f4", filename: "КП_Парковый_v1.xlsx", itemId: 4, name: "Профиль алюминиевый 80×80",    qty: 1200, unit: "м.п.",   price: 0 },
  { fileId: "f4", filename: "КП_Парковый_v1.xlsx", itemId: 5, name: "Москитная сетка 1200×1400",    qty: 240,  unit: "шт",     price: 0 },
  { fileId: "f4", filename: "КП_Парковый_v1.xlsx", itemId: 6, name: "Заглушка торцевая F-образная", qty: 480,  unit: "шт",     price: 0 },
  { fileId: "f4", filename: "КП_Парковый_v1.xlsx", itemId: 7, name: "Уплотнитель щёточный 9мм",     qty: 960,  unit: "п.м.",   price: 0 },
  { fileId: "f4", filename: "КП_Парковый_v1.xlsx", itemId: 8, name: "Крепёжный профиль KP-01",      qty: 600,  unit: "шт",     price: 0 },
];

// ─── Status chip ──────────────────────────────────────────
const STATUS_META: Record<FileStatus, { label: string; icon: React.ElementType; cls: string; spin?: boolean }> = {
  queued:      { label: "В очереди",     icon: Clock,        cls: "bg-slate-100 text-slate-600 border-slate-200" },
  processing:  { label: "Обрабатывается", icon: Loader2,      cls: "bg-blue-50 text-blue-700 border-blue-200", spin: true },
  ready:       { label: "Готово",         icon: CheckCircle2, cls: "bg-green-50 text-green-700 border-green-200" },
  error:       { label: "Ошибка",         icon: XCircle,      cls: "bg-red-50 text-red-700 border-red-200" },
  needs_input: { label: "Требует ввода",  icon: AlertCircle,  cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

function FileStatusChip({ status }: { status: FileStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1", meta.cls)}>
      <Icon className={cn("size-3", meta.spin && "animate-spin")} />
      {meta.label}
    </Badge>
  );
}
        const handleGenerateKP = async () => {
    if (!excelFile) return;

    const formData = new FormData();
    formData.append("file", excelFile);

    formData.append(
        "contract_data",
        JSON.stringify({
            "{{company_name}}": companyName,
            "{{total_sum}}": totalSum,
            "{{delivery_days}}": deliveryDays,
        })
    );

    const response = await fetch(
        "/api/v1/kp/generate",
        {
            method: "POST",
            body: formData,
        }
    );

    if (!response.ok) {
        alert(await response.text());
        return;
    }

    const blob = await response.blob();

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "KP.docx";
    a.click();

    URL.revokeObjectURL(url);
};

// ─── KPI card ─────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, iconColor, iconBg }: {
  label: string; value: number; icon: React.ElementType; iconColor: string; iconBg: string;
}) {
  return (
    <Card className="rounded-lg shadow-none">
      <CardContent className="flex items-center gap-3 px-5">
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
          <Icon className={cn("size-[18px]", iconColor)} />
        </div>
        <div className="min-w-0">
          <p className="mb-0.5 text-xs font-medium text-slate-500">{label}</p>
          <p className="text-xl font-semibold leading-none text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── A button wrapped so its tooltip still fires when disabled ──
function GuardedAction({ tip, disabled, children }: {
  tip: string; disabled: boolean; children: React.ReactNode;
}) {
  if (!tip) return <>{children}</>;
  return (
    <Tooltip>
      {/* span keeps hover events alive even when the inner button is disabled */}
      <TooltipTrigger asChild>
        <span className={cn("inline-flex", disabled && "cursor-not-allowed")}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

// ─── Bulk price-edit dialog (req. 7.4) ────────────────────
function BulkPriceDialog({ open, onOpenChange, items, onSave }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: UnpricedItem[];
  onSave: (prices: Record<number, number>) => void;
}) {
  const [prices, setPrices] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);

  const fileIds = useMemo(() => Array.from(new Set(items.map(i => i.fileId))), [items]);
  const filledCount = items.filter(i => (prices[i.itemId] || 0) > 0).length;
  const allFilled = items.length > 0 && filledCount === items.length;

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      onSave(prices);
      setSaving(false);
      setPrices({});
      onOpenChange(false);
    }, 900);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-6 py-4 text-left">
          <DialogTitle>Массовое редактирование цен</DialogTitle>
          <DialogDescription>
            {items.length} позиций из {fileIds.length} файлов · {filledCount}/{items.length} заполнено
          </DialogDescription>
        </DialogHeader>

        <div className={cn(
          "flex items-center gap-2 border-b px-6 py-3 text-sm",
          allFilled ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700",
        )}>
          {allFilled ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
          {allFilled
            ? "Все цены заполнены. Нажмите «Сохранить все цены», чтобы применить."
            : "Заполните цены для всех позиций — поля без значения выделены жёлтым."}
        </div>

        <div className="flex-1 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
              <TableRow>
                <TableHead>Файл / Наименование</TableHead>
                <TableHead className="text-right">Кол-во</TableHead>
                <TableHead>Ед.</TableHead>
                <TableHead>Цена за ед.</TableHead>
                <TableHead className="text-right">Сумма</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fileIds.map(fileId => {
                const fileItems = items.filter(i => i.fileId === fileId);
                return (
                  <React.Fragment key={fileId}>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      <TableCell colSpan={5} className="py-2">
                        <div className="flex items-center gap-2">
                          <FileText className="size-3 text-slate-400" />
                          <span className="text-xs font-semibold text-slate-600">{fileItems[0].filename}</span>
                          <span className="text-xs text-slate-400">({fileItems.length} позиций без цены)</span>
                        </div>
                      </TableCell>
                    </TableRow>
                    {fileItems.map(item => {
                      const p = prices[item.itemId] || 0;
                      return (
                        <TableRow key={item.itemId} className={p > 0 ? "bg-green-50/20" : "bg-yellow-50/30"}>
                          <TableCell className="pl-8 text-slate-800">{item.name}</TableCell>
                          <TableCell className="text-right font-mono text-slate-700">{item.qty.toLocaleString("ru-RU")}</TableCell>
                          <TableCell className="text-xs text-slate-500">{item.unit}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              placeholder="0 ₸"
                              value={prices[item.itemId] || ""}
                              onChange={e => setPrices(prev => ({ ...prev, [item.itemId]: parseFloat(e.target.value) || 0 }))}
                              className={cn(
                                "h-8 w-36",
                                p > 0 ? "border-green-300 bg-green-50/30" : "border-yellow-300",
                              )}
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-slate-700">
                            {p > 0 ? formatTenge(p * item.qty) : <span className="text-slate-400">—</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button onClick={handleGenerateKP}>
            Сгенерировать КП
          </Button>
          <GuardedAction tip={!allFilled ? "Заполните все поля" : ""} disabled={!allFilled}>
            <Button
              onClick={handleSave}
              disabled={!allFilled || saving}
              className="bg-green-600 hover:bg-green-700"
            >
              {saving
                ? <><Loader2 className="size-3.5 animate-spin" />Сохранение…</>
                : <><Check className="size-3.5" />Сохранить все цены</>}
            </Button>
          </GuardedAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Screen ───────────────────────────────────────────────
const HISTORY_FILTERS: { value: string; label: string }[] = [
  { value: "all",         label: "Все" },
  { value: "ready",       label: "Готово" },
  { value: "needs_input", label: "Требует ввода" },
  { value: "error",       label: "Ошибка" },
];

const ACCEPTED_EXT = ["PDF"];

export function UploadCenter() {
  const [files, setFiles] = useState<UploadedFile[]>(MOCK_QUEUE);
  const [unpricedItems, setUnpricedItems] = useState<UnpricedItem[]>(UNPRICED_ITEMS_INIT);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isDragOver, setIsDragOver] = useState(false);
  const [tab, setTab] = useState<"queue" | "history">("queue");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Derived state ──
  const stats = {
    queued:      files.filter(f => f.status === "queued").length,
    processing:  files.filter(f => f.status === "processing").length,
    ready:       files.filter(f => f.status === "ready").length,
    needs_input: files.filter(f => f.status === "needs_input").length,
    error:       files.filter(f => f.status === "error").length,
  };
  const attention = stats.needs_input + stats.error;

  const selectedFiles = files.filter(f => selected.has(f.id));
  const canSend = selectedFiles.some(f => f.status === "ready");
  const canFillPrices = selectedFiles.some(f => f.status === "needs_input");

  const allChecked: boolean | "indeterminate" =
    files.length > 0 && selected.size === files.length
      ? true
      : selected.size > 0
      ? "indeterminate"
      : false;

  const bulkEditItems = unpricedItems.filter(i =>
    selectedFiles.some(f => f.id === i.fileId && f.status === "needs_input"),
  );

  const filteredHistory = MOCK_HISTORY.filter(f => historyFilter === "all" || f.status === historyFilter);

  // ── Handlers ──
  const toggleSelect = (id: string) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelected(s => (s.size === files.length ? new Set() : new Set(files.map(f => f.id))));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const count = Math.max(1, e.dataTransfer.files.length);
    const newFiles: UploadedFile[] = Array.from({ length: count }, (_, i) => ({
      id: `new-${Date.now()}-${i}`,
      filename: e.dataTransfer.files[i]?.name || `Новый_файл_${i + 1}.xlsx`,
      project: "—",
      uploadedAt: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      totalItems: 0, missingPrices: 0, status: "queued", size: "—",
    }));
    setFiles(f => [...newFiles, ...f]);
  };

  const removeFile = (id: string) =>
    setFiles(f => f.filter(x => x.id !== id));

  const handleDeleteSelected = () => {
    setFiles(f => f.filter(x => !selected.has(x.id)));
    setSelected(new Set());
  };

  const handleSendSelected = () => {
    setSending(true);
    setTimeout(() => { setSending(false); setSelected(new Set()); }, 1400);
  };

  const openBulkForFile = (id: string) => { setSelected(new Set([id])); setBulkOpen(true); };

  const handleBulkSave = (prices: Record<number, number>) => {
    const updated = unpricedItems.map(i => ({ ...i, price: prices[i.itemId] ?? i.price }));
    setUnpricedItems(updated);
    setFiles(f => f.map(file => {
      if (file.status !== "needs_input") return file;
      const stillMissing = updated.filter(i => i.fileId === file.id && i.price === 0).length;
      return stillMissing === 0
        ? { ...file, status: "ready" as FileStatus, missingPrices: 0 }
        : { ...file, missingPrices: stillMissing };
    }));
  };

  return (
    <div className="mx-auto max-w-[1200px] p-8">
      <BulkPriceDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        items={bulkEditItems.length > 0 ? bulkEditItems : unpricedItems}
        onSave={handleBulkSave}
      />

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-0.5 text-[22px] font-semibold text-slate-900">Центр загрузки КП</h1>
          <p className="text-sm text-slate-500">
            Пакетная загрузка и обработка коммерческих предложений
          </p>
        </div>
        {attention > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <AlertTriangle className="size-3.5 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">{attention} файла требуют внимания</span>
          </div>
        )}
      </div>

      {/* KPI row — five cards incl. «Ошибка» (req. 7.1) */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="В очереди"      value={stats.queued}      icon={Clock}        iconColor="text-slate-500" iconBg="bg-slate-100" />
        <KpiCard label="Обрабатывается" value={stats.processing}  icon={RefreshCw}    iconColor="text-blue-500"  iconBg="bg-blue-50" />
        <KpiCard label="Готово"         value={stats.ready}       icon={CheckCircle2} iconColor="text-green-500" iconBg="bg-green-50" />
        <KpiCard label="Требует ввода"  value={stats.needs_input} icon={AlertCircle}  iconColor="text-amber-500" iconBg="bg-amber-50" />
        <KpiCard label="Ошибка"         value={stats.error}       icon={XCircle}      iconColor="text-red-500"   iconBg="bg-red-50" />
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as "queue" | "history")}>
        <TabsList className="mb-6">
          <TabsTrigger value="queue">Очередь обработки ({files.length})</TabsTrigger>
          <TabsTrigger value="history">История загрузок (30 дней)</TabsTrigger>
        </TabsList>

        {/* ── QUEUE ── */}
        <TabsContent value="queue" className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-all",
              isDragOver ? "border-primary bg-blue-50" : "border-border hover:border-primary/50 hover:bg-slate-50",
            )}
          >
            <input ref={fileInputRef} type="file" multiple accept=".pdf" className="hidden" />
            <div className={cn(
              "mx-auto mb-4 flex size-16 items-center justify-center rounded-full transition-colors",
              isDragOver ? "bg-blue-100" : "bg-slate-100",
            )}>
              <Upload className={cn("size-6", isDragOver ? "text-primary" : "text-slate-400")} />
            </div>
            <p className="mb-1 text-base font-semibold text-slate-700">
              {isDragOver ? "Отпустите файлы для загрузки" : "Перетащите файлы сюда"}
            </p>
            <p className="mb-5 text-sm text-slate-400">
              или <span className="text-primary hover:underline">выберите файлы</span> на вашем компьютере
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {ACCEPTED_EXT.map(ext => (
                <span key={ext} className="rounded border border-border bg-white px-2.5 py-1 text-xs text-slate-500">{ext}</span>
              ))}
              <span className="px-2.5 py-1 text-xs text-slate-400">· До 50 файлов · Макс. 20 МБ каждый</span>
            </div>
          </div>

          {/* Background-processing hint (req. 7.7) */}
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
            <Info className="size-3.5 shrink-0 text-slate-400" />
            Файлы обрабатываются в фоновом режиме. Вы можете закрыть страницу — уведомление придёт в колокольчик.
          </div>

          {/* Bulk actions bar (req. 7.3) */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-[#EFF6FF] px-4 py-3">
              <span className="shrink-0 text-sm font-semibold text-primary">{selected.size} выбрано</span>
              <div className="h-4 w-px shrink-0 bg-blue-200" />

              <GuardedAction tip={!canSend ? "Выберите файлы со статусом «Готово»" : ""} disabled={!canSend}>
                <Button size="sm" disabled={!canSend || sending} onClick={handleSendSelected}>
                  {sending
                    ? <><Loader2 className="size-3 animate-spin" />Отправка…</>
                    : <><Send className="size-3" />Отправить выбранные КП на утверждение</>}
                </Button>
              </GuardedAction>

              <GuardedAction tip={!canFillPrices ? "Нет файлов, требующих ввода цен" : ""} disabled={!canFillPrices}>
                <Button
                  size="sm"
                  disabled={!canFillPrices}
                  onClick={() => setBulkOpen(true)}
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  <Edit3 className="size-3" />Заполнить цены для выбранных
                </Button>
              </GuardedAction>

              <Button
                size="sm"
                variant="ghost"
                onClick={handleDeleteSelected}
                className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="size-3" />Удалить выбранные
              </Button>
            </div>
          )}

          {/* Queue table */}
          <Card className="overflow-hidden p-0 shadow-none">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/60">
                  <TableHead className="w-10">
                    <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Выбрать все" />
                  </TableHead>
                  <TableHead>Файл</TableHead>
                  <TableHead>Проект</TableHead>
                  <TableHead>Загружен</TableHead>
                  <TableHead className="text-right">Позиций</TableHead>
                  <TableHead className="text-right">Без цены</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Размер</TableHead>
                  <TableHead className="text-right">Действие</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map(file => {
                  const checked = selected.has(file.id);
                  const rowTint = checked
                    ? "bg-blue-50/40"
                    : file.status === "error"
                    ? "bg-red-50/20"
                    : file.status === "needs_input"
                    ? "bg-amber-50/20"
                    : "";
                  return (
                    <TableRow key={file.id} className={rowTint}>
                      <TableCell>
                        <Checkbox checked={checked} onCheckedChange={() => toggleSelect(file.id)} aria-label={`Выбрать ${file.filename}`} />
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <div className="flex items-center gap-2">
                          <FileText className="size-3.5 shrink-0 text-slate-400" />
                          <span className="truncate font-medium text-slate-800" title={file.filename}>{file.filename}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate text-slate-600">{file.project}</span>
                          </TooltipTrigger>
                          <TooltipContent>{file.project}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-slate-500">{file.uploadedAt}</TableCell>
                      <TableCell className="text-right font-mono text-slate-700">
                        {file.totalItems > 0 ? file.totalItems : <span className="text-slate-400">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {file.missingPrices > 0
                          ? <span className="font-bold text-amber-600">{file.missingPrices}</span>
                          : file.totalItems > 0
                          ? <span className="text-green-600">0</span>
                          : <span className="text-slate-400">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <FileStatusChip status={file.status} />
                          {file.status === "error" && file.errorMessage && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertCircle className="size-3.5 cursor-help text-red-500" />
                              </TooltipTrigger>
                              <TooltipContent className="bg-red-600 fill-red-600">{file.errorMessage}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        {/* Progress bar while processing (req. 7.5) */}
                        {file.status === "processing" && typeof file.progress === "number" && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <Progress value={file.progress} className="h-1 w-24" />
                            <span className="text-[10px] font-medium text-blue-600">{file.progress}%</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-slate-400">{file.size}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {file.status === "needs_input" && (
                            <Button
                              size="sm" variant="outline"
                              onClick={() => openBulkForFile(file.id)}
                              className="h-7 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
                            >
                              Ввести цены
                            </Button>
                          )}
                          {file.status === "ready" && (
                            <Button
                              size="sm" variant="outline"
                              className="h-7 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                            >
                              Отправить
                            </Button>
                          )}
                          {file.status === "error" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="size-7 text-slate-400 hover:text-blue-600">
                                  <RefreshCw className="size-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Повторить обработку</TooltipContent>
                            </Tooltip>
                          )}
                          <Button
                            size="icon" variant="ghost"
                            onClick={() => removeFile(file.id)}
                            className="size-7 text-slate-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {files.length === 0 && (
              <div className="py-14 text-center">
                <Upload className="mx-auto mb-3 size-7 text-slate-300" />
                <p className="mb-1 text-sm font-medium text-slate-500">Очередь пуста</p>
                <p className="text-xs text-slate-400">Перетащите файлы в зону выше или нажмите «выберите файлы»</p>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── HISTORY (req. 7.6) ── */}
        <TabsContent value="history" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 overflow-hidden rounded-lg border border-border bg-white">
              {HISTORY_FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setHistoryFilter(f.value)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    historyFilter === f.value ? "bg-primary text-primary-foreground" : "text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative ml-auto max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Поиск по файлу или проекту…" className="h-9 pl-8 text-xs" />
            </div>
          </div>

          <Card className="overflow-hidden p-0 shadow-none">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/60">
                  <TableHead>Файл</TableHead>
                  <TableHead>Проект</TableHead>
                  <TableHead>Загружен</TableHead>
                  <TableHead className="text-right">Позиций</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Размер</TableHead>
                  <TableHead className="text-right">Действие</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.map(file => (
                  <TableRow key={file.id} className={file.status === "error" ? "bg-red-50/20" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="size-3.5 shrink-0 text-slate-400" />
                        <span className="text-slate-700">{file.filename}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600">{file.project}</TableCell>
                    <TableCell className="text-slate-500">{file.uploadedAt}</TableCell>
                    <TableCell className="text-right font-mono text-slate-700">{file.totalItems > 0 ? file.totalItems : "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <FileStatusChip status={file.status} />
                        {file.status === "error" && file.errorMessage && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertCircle className="size-3.5 cursor-help text-red-500" />
                            </TooltipTrigger>
                            <TooltipContent className="bg-red-600 fill-red-600">{file.errorMessage}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-400">{file.size}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="h-7 text-slate-400 hover:text-slate-700">
                        <Download className="size-3" />Скачать
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <p className="text-xs text-slate-400">История за последние 30 дней · {filteredHistory.length} файлов</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default UploadCenter;
