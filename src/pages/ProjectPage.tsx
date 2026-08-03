import React, { useState, useEffect } from "react";
import type { Role, Page, ProjectState, Receipt } from "../types";
import { PageWrap } from "../app/components/common/PageWrap";
import { Chip } from "../app/components/common/Chip";
import { Tooltip as AppTooltip } from "../app/components/common/Tooltip";
import { fmt } from "../lib/format";
import { INVOICES_INIT } from "../data/invoices";
import { STOCK_INIT } from "../data/stock";
import { AlertTriangle, Calculator, CheckCircle2, Loader2, Send, Truck, Check, XCircle, Download, FileText } from "lucide-react";
import {
  fetchProjectDetails,
  fetchProjectItems,
  getMlImport,
  updateMlImportItem,
  createProductForMlImportItem,
  confirmMlImport,
  startProjectEditing,
  sendProjectToDirector,
  approveProjectDirector,
  rejectProjectDirector,
  approveProjectClient,
  rejectProjectClient,
  downloadProjectExcel,
  downloadKpDocument,
} from "../api/api";

import type {
  ProjectItem,
  ProjectResponse,
  ProjectItemResponse,
  MlImportDetailResponse,
  MlImportItemResponse,
  MlImportItemCreateProduct,
  MlImportItemUpdate,
} from "../api/api";

type MlStatus =
  | "Нет в системе"
  | "Есть в системе (недостаточно)"
  | "На складе";

const ML_STATUS_STYLES: Record<
  MlStatus,
  {
    badge: string;
    row: string;
  }
> = {
  "Нет в системе": {
    badge: "bg-red-100 text-red-800 border border-red-300",
    row: "bg-red-50 hover:bg-red-100/60",
  },
  "Есть в системе (недостаточно)": {
    badge: "bg-yellow-100 text-yellow-800 border border-yellow-300",
    row: "bg-yellow-50 hover:bg-yellow-100/60",
  },
  "На складе": {
    badge: "bg-green-100 text-green-800 border border-green-300",
    row: "bg-green-50 hover:bg-green-100/60",
  },
};

const normalizeMlStatus = (status: string | null | undefined): MlStatus => {
  const normalized = status?.trim();
  if (normalized === "На складе") return "На складе";
  if (normalized === "Есть в системе (недостаточно)") return "Есть в системе (недостаточно)";
  return "Нет в системе";
};

type EstimateRow = {
  id: number;
  name: string;
  code: string | null;
  quantity: number;
  estimatedPrice: number | null;
};

function EstimateTable({ rows }: { rows: EstimateRow[] }) {
  const formatEstimateMoney = (value: number) =>
    new Intl.NumberFormat("ru-KZ", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value) + " ₸";

  const estimatedTotal = rows.reduce(
    (sum, row) => sum + (row.estimatedPrice ?? 0) * row.quantity,
    0,
  );

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-[#E2E8F0] bg-white">
      <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0] bg-slate-50/60 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Смета проекта</h3>
          <p className="mt-1 text-xs text-slate-500">
            Справочные цены КазНИИСА. Они не участвуют в расчёте себестоимости и маржи.
          </p>
        </div>
        <span className="whitespace-nowrap rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
          План
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-white">
              {["Товар", "Код", "Количество", "Сметная цена", "Сметная сумма"].map((heading) => (
                <th
                  key={heading}
                  className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                  В смете пока нет позиций
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const rowTotal = (row.estimatedPrice ?? 0) * row.quantity;

                return (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm text-slate-700">{row.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.code ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-sm text-slate-700">
                      {row.quantity.toLocaleString("ru-RU")}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-slate-700">
                      {row.estimatedPrice == null ? "Не найдена" : formatEstimateMoney(row.estimatedPrice)}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-800">
                      {row.estimatedPrice == null ? "—" : formatEstimateMoney(rowTotal)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#E2E8F0] bg-slate-50/80">
              <td colSpan={4} className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                Итого по смете
              </td>
              <td className="px-4 py-3 font-mono text-base font-bold text-[#2563EB]">
                {formatEstimateMoney(estimatedTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function ProjectPagePM({
  onNavigate,
  projectState,
  onKpSent,
  projectId,
}: {
  onNavigate: (p: Page) => void;
  projectState: ProjectState;
  onKpSent: () => void;
  receipts: Receipt[];
  projectItems: ProjectItem[];
  projectId: number;
})  {
  const [sending, setSending] = useState(false);

  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);

  const [mlImport, setMlImport] = useState<MlImportDetailResponse | null>(null);
  const [mlImportLoading, setMlImportLoading] = useState(false);
  const [mlImportError, setMlImportError] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingKP, setIsGeneratingKP] = useState(false);
  const [kpGenerated, setKpGenerated] = useState(false);
  const [approvingClient, setApprovingClient] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [productModalItem, setProductModalItem] =
    useState<MlImportItemResponse | null>(null);
  const [productModalForm, setProductModalForm] = useState({
    product_name: "",
    supplier_name: "",
    unit: "шт",
    price_cost: "",
    price: "",
  });
  const [productModalError, setProductModalError] = useState<string | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [showEstimate, setShowEstimate] = useState(false);

  const resolvedProjectId = projectId; // Let it be a string or a number!
  const hasValidProjectId = Boolean(resolvedProjectId); // Just check that it's not empty
  useEffect(() => {
    if (!hasValidProjectId) {
      setProject(null);
      setProjectError(`Некорректный ID проекта: ${String(projectId)}`);
      return;
    }
    let cancelled = false;
    setProjectError(null);
    setKpGenerated(false);
    fetchProjectDetails(resolvedProjectId)
      .then((data) => { if (!cancelled) { setProject(data); setProjectError(null); } })
      .catch((error) => { if (!cancelled) { setProject(null); setProjectError(error instanceof Error ? error.message : "Не удалось загрузить проект"); } });
    return () => { cancelled = true; };
  }, [resolvedProjectId, hasValidProjectId]);

  useEffect(() => {
    if (!hasValidProjectId) {
      setMlImport(null);
      setMlImportLoading(false);
      return;
    }
    const storageKey = `project:${resolvedProjectId}:mlImportId`;
    const savedImportId = localStorage.getItem(storageKey);
    if (!savedImportId) {
      setMlImport(null);
      setMlImportError(null);
      setMlImportLoading(false);
      return;
    }
    const importId = Number(savedImportId);
    if (!Number.isInteger(importId) || importId <= 0) {
      setMlImport(null);
      setMlImportLoading(false);
      setMlImportError(`Некорректный ID ML-импорта: ${savedImportId}`);
      return;
    }
    let cancelled = false;
    setMlImportLoading(true);
    setMlImportError(null);
    getMlImport(importId)
      .then((data) => {
        if (cancelled) return;
        if (data.project_id !== resolvedProjectId) {
          throw new Error(`ML-импорт ${importId} относится к проекту ${data.project_id}, а открыт проект ${resolvedProjectId}`);
        }
        setMlImport(data);
      })
      .catch((error) => {
        if (cancelled) return;
        setMlImport(null);
        setMlImportError(error instanceof Error ? error.message : "Не удалось загрузить ML-импорт");
      })
      .finally(() => { if (!cancelled) setMlImportLoading(false); });
    return () => { cancelled = true; };
  }, [resolvedProjectId, hasValidProjectId]);

  const currentStatus = project?.status?.status_name || "Новый";

  const refreshProject = async (): Promise<ProjectResponse> => {
    const updatedProject = await fetchProjectDetails(resolvedProjectId);
    setProject(updatedProject);
    setProjectError(null);
    return updatedProject;
  };

  useEffect(() => {
    if (!mlImport) return;
    let cancelled = false;
    getMlImport(mlImport.id)
      .then((data) => { if (!cancelled) setMlImport(data); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStatus]);

  const statusToIndex: Record<string, number> = {
    "Новый": 0,
    "Новый проект": 0,
    "В редактировании": 1,
    "На согласовании у Комдира": 2,
    "Отклонено Комдиром": 2,
    "Одобрено Комдиром": 3,
    "Ожидание клиента": 3,
    "Ожидание подписания": 4,
    "Активный закуп": 5,
    "На приходе": 6,
    "На отгрузке": 7,
    "Ожидание документов": 8,
    "Завершен": 9,
  };

  const currentIndex = statusToIndex[currentStatus] ?? 0;
  const isKpApproved = project ? currentIndex >= 3 : projectState.kpApproved;
  const isPendingDirector = currentStatus === "На согласовании у Комдира";
  const isRejected = currentStatus === "Отклонено Комдиром";
  const isApproved = isKpApproved;
  const sent = isPendingDirector;
  // Генерация КП доступна, пока проект ожидает решения клиента.
  // После «Одобрено клиентом» проект переходит в отдельный статус
  // «Ожидание подписания» (index 4), поэтому кнопка больше не нужна.
  const isPastApprovalWindow = project ? currentIndex >= 4 : false;

  const STAGES = [
    { label: "Новый", done: currentIndex > 0, active: currentIndex === 0 },
    { label: "В редактировании", done: currentIndex > 1, active: currentIndex === 1 },
    { label: "На согласовании", done: currentIndex > 2, active: currentIndex === 2 },
    { label: "Ожидание клиента", done: currentIndex > 3, active: currentIndex === 3 },
    { label: "Ожидание подписания", done: currentIndex > 4, active: currentIndex === 4 },
    { label: "Активный закуп", done: currentIndex > 5, active: currentIndex === 5 },
    { label: "На приходе", done: currentIndex > 6, active: currentIndex === 6 },
    { label: "На отгрузке", done: currentIndex > 7, active: currentIndex === 7 },
    { label: "Ожидание документов", done: currentIndex > 8, active: currentIndex === 8 },
    { label: "Завершен", done: currentIndex === 9, active: currentIndex === 9 },
  ];

  const title = project?.name ?? "Офисный комплекс «Башня»";
  const subtitle = project
      ? `${project.client?.client_name ?? "—"} · ${project.pm?.name ?? "—"} · ${project.deadline ? new Date(project.deadline).toLocaleDateString("ru-RU") : "—"}`
      : "ООО «СтройТех» · А. Петров · 15.08.2024";

  const sidebarDetails: [string, string][] = project
      ? [
          ["Бюджет", fmt(Number(project.invoice?.amount ?? 0))],
          ["Маржа", project.planned_margin != null ? `${project.planned_margin}%` : "—"],
          ["Дедлайн", project.deadline ? new Date(project.deadline).toLocaleDateString("ru-RU") : "—"],
          ["Менеджер", project.pm?.name ?? "—"],
          ["Клиент", project.client?.client_name ?? "—"],
          ["Договор", project.contract_number ?? "—"],
        ]
      : [
          ["Бюджет", "12 500 000 ₸"], ["Маржа", "24.5%"], ["Дедлайн", "15.08.2024"],
          ["Менеджер", "А. Петров"], ["Клиент", "ООО «СтройТех»"], ["Договор", "ДГ-2024-0041"],
        ];

  const handleMlItemUpdate = async (itemId: number, payload: MlImportItemUpdate) => {
    if (!mlImport) return;
    try {
      setUpdatingItemId(itemId);
      setMlImportError(null);
      const updatedItem = await updateMlImportItem(mlImport.id, itemId, payload);
      setMlImport((current) => {
        if (!current) return current;
        return { ...current, items: current.items.map((item) => item.id === updatedItem.id ? updatedItem : item) };
      });
    } catch (error) {
      setMlImportError(error instanceof Error ? error.message : "Не удалось изменить строку");
    } finally {
      setUpdatingItemId(null);
    }
  };

  const openProductModal = (item: MlImportItemResponse) => {
    setProductModalItem(item);
    setProductModalForm({
      product_name: item.input_product,
      supplier_name: item.supplier_name ?? "",
      unit: item.unit?.trim() || "шт",
      price_cost: Number(item.price_cost ?? 0) > 0
        ? String(item.price_cost)
        : "",
      price: Number(item.price ?? 0) > 0 ? String(item.price) : "",
    });
    setProductModalError(null);
  };

  const closeProductModal = () => {
    if (savingProduct) return;
    setProductModalItem(null);
    setProductModalError(null);
  };

  const handleCreateProduct = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!mlImport || !productModalItem) return;

    const productName = productModalForm.product_name.trim();
    const supplierName = productModalForm.supplier_name.trim();
    const unit = productModalForm.unit.trim();
    const priceCost = Number(productModalForm.price_cost);
    const price = Number(productModalForm.price);

    if (!productName || !supplierName || !unit) {
      setProductModalError(
        "Заполните название товара, поставщика и единицу измерения.",
      );
      return;
    }

    if (!Number.isFinite(priceCost) || priceCost <= 0) {
      setProductModalError("Себестоимость должна быть больше нуля.");
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setProductModalError("Цена продажи должна быть больше нуля.");
      return;
    }

    if (price < priceCost) {
      setProductModalError("Цена продажи не может быть ниже себестоимости.");
      return;
    }

    const payload: MlImportItemCreateProduct = {
      product_name: productName,
      supplier_name: supplierName,
      unit,
      price_cost: priceCost,
      price,
    };

    try {
      setSavingProduct(true);
      setProductModalError(null);
      setMlImportError(null);

      const updatedItem = await createProductForMlImportItem(
        mlImport.id,
        productModalItem.id,
        payload,
      );

      setMlImport((current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((item) =>
            item.id === updatedItem.id ? updatedItem : item,
          ),
        };
      });
      setProductModalItem(null);
    } catch (error) {
      setProductModalError(
        error instanceof Error
          ? error.message
          : "Не удалось создать товар",
      );
    } finally {
      setSavingProduct(false);
    }
  };

  const handleConfirmMlImport = async () => {
    if (!mlImport || mlImport.status !== "draft") return;
    try {
      setConfirmingImport(true);
      setMlImportError(null);
      await confirmMlImport(mlImport.id);

      // Подтверждение импорта должно переводить проект:
      // «Новый» / «Новый проект» → «В редактировании».
      // Повторно читаем проект с backend, чтобы не оставлять старый статус
      // в локальном состоянии после git merge/pull.
      let updatedProject = await refreshProject();
      const statusName = updatedProject.status?.status_name?.trim();

      // Совместимость с backend-версиями, где confirm ML-импорта ещё
      // не вызывает переход START_EDITING самостоятельно.
      if (statusName === "Новый" || statusName === "Новый проект") {
        await startProjectEditing(updatedProject.id);
        updatedProject = await refreshProject();
      }

      if (updatedProject.status?.status_name !== "В редактировании") {
        throw new Error(
          `Импорт подтверждён, но проект остался в статусе «${
            updatedProject.status?.status_name || "не задан"
          }»`,
        );
      }

      setMlImport(await getMlImport(mlImport.id));
    } catch (error) {
      setMlImportError(error instanceof Error ? error.message : "Не удалось подтвердить ML-импорт");
    } finally {
      setConfirmingImport(false);
    }
  };

  const handleSendToDirector = async () => {
    if (!project) return;
    setSending(true);
    try {
      await sendProjectToDirector(project.id);
      onKpSent();
      await refreshProject();
    } catch (error) {
      console.error("Не удалось отправить Комдиру:", error);
      alert("Ошибка при отправке Комдиру.");
    } finally {
      setSending(false);
    }
  };

  const handleClientApprove = async () => {
    if (!project) return;
    setApprovingClient(true);
    try {
      await approveProjectClient(project.id);
      await refreshProject();
      alert("КП одобрено клиентом и сохранено на странице «Документы».");
      onNavigate("documents");
    } catch (error) {
      console.error("Не удалось зафиксировать одобрение клиента:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Ошибка при одобрении КП клиентом.",
      );
    } finally {
      setApprovingClient(false);
    }
  };

  const handleClientReject = async () => {
    if (!project) return;
    setRejecting(true);
    try {
      await rejectProjectClient(project.id);
      await refreshProject();
      if (mlImport) {
        try {
          const refreshedImport = await getMlImport(mlImport.id);
          setMlImport(refreshedImport);
        } catch (refreshError) {
          console.error("Не удалось обновить ML-импорт после отказа клиента:", refreshError);
        }
      }
      alert("Проект возвращён в редактирование. Отредактируйте позиции и подтвердите импорт заново.");
    } catch (error) {
      console.error("Не удалось отправить проект на доработку:", error);
      alert("Ошибка при отправке на доработку.");
    } finally {
      setRejecting(false);
    }
  };

  const canConfirmMlImport =
  mlImport !== null &&
  mlImport.status === "draft" &&
  mlImport.items.length > 0 &&
  mlImport.items.every((item) => {
    const quantity = Number(
      item.final_quantity ?? item.input_quantity ?? 0
    );

    const price = Number(item.price ?? 0);
    const priceCost = Number(item.price_cost ?? 0);
    const margin = Number(item.margin ?? 0);
    const noSystemItemReady =
      normalizeMlStatus(item.ml_status) !== "Нет в системе" ||
      (item.is_confirmed && item.selected_product_id !== null);

    return (
      quantity > 0 &&
      price > 0 &&
      priceCost >= 0 &&
      margin >= 0 &&
      Boolean(item.supplier_name?.trim()) &&
      noSystemItemReady
    );
  });
  const handleExportExcel = async () => {
    if (!project) return;
    try {
      setIsExporting(true);
      await downloadProjectExcel(project.id);
    } catch (error) {
      console.error("Ошибка при скачивании Excel:", error);
      alert("Не удалось скачать файл");
    } finally {
      setIsExporting(false);
    }
  };

  const handleGenerateKP = async () => {
    if (!project) return;
    try {
      setIsGeneratingKP(true);
      await downloadKpDocument(project.id);
      setKpGenerated(true);
    } catch (error) {
      console.error("Ошибка генерации КП:", error);
      alert(error instanceof Error ? error.message : "Не удалось сгенерировать КП");
    } finally {
      setIsGeneratingKP(false);
    }
  };

  if (!hasValidProjectId) {
    return (
      <PageWrap title="Проект не выбран" subtitle="Не удалось определить ID проекта">
        <div className="bg-red-50 border border-red-200 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-500 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">Некорректный ID проекта</p>
              <p className="text-sm text-red-600 mt-1">Получено значение: {String(projectId)}</p>
            </div>
          </div>
        </div>
      </PageWrap>
    );
  }

  const formatMoney = (value: number | string | null | undefined) => {
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount)) return "0 ₸";
    return new Intl.NumberFormat("ru-KZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount) + " ₸";
  };

  const estimateRows: EstimateRow[] = (mlImport?.items ?? []).map((item) => {
    const parsedPrice = item.estimated_price == null
      ? null
      : Number(item.estimated_price);

    return {
      id: item.id,
      name: item.matched_product ?? item.input_product,
      code: item.matched_external_id,
      quantity: Number(item.final_quantity ?? item.input_quantity ?? 0),
      estimatedPrice: parsedPrice != null && Number.isFinite(parsedPrice)
        ? parsedPrice
        : null,
    };
  });

  return (
    <PageWrap
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Chip status={currentStatus}/>
            <Chip status="kp"/>
            <button
              type="button"
              onClick={() => setShowEstimate((current) => !current)}
              disabled={!mlImport}
              aria-expanded={showEstimate}
              className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                showEstimate
                  ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                  : "border-[#E2E8F0] bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Calculator size={14}/>
              Смета
            </button>
            <AppTooltip text={(!mlImport || mlImport.status !== "confirmed") ? "Сначала подтвердите импорт товаров" : ""}>
              <button
                onClick={handleExportExcel}
                disabled={isExporting || !project || !mlImport || mlImport.status !== "confirmed"}
                className="flex items-center gap-1.5 ml-2 px-3 py-1.5 bg-white border border-[#E2E8F0] text-slate-600 text-xs font-medium rounded hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? <Loader2 size={14} className="animate-spin"/> : <Download size={14} />}
                {isExporting ? "Скачивание..." : "Скачать Excel"}
              </button>
            </AppTooltip>
          </div>
        }
    >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white rounded-lg border border-[#E2E8F0] p-5 overflow-x-auto flex items-center">
            <div className="flex items-start min-w-max">
              {STAGES.map((step, i) => (
                  <div key={step.label} className="flex items-center">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                          step.done ? "bg-[#2563EB] border-[#2563EB] text-white" : 
                          step.active ? "bg-white border-[#2563EB] text-[#2563EB]" : 
                          "bg-white border-[#E2E8F0] text-slate-400"
                      }`}>
                        {step.done ? <Check size={12}/> : i + 1}
                      </div>
                      <span className={`text-xs mt-1.5 transition-colors ${step.done || step.active ? "text-[#2563EB]" : "text-slate-400"}`}>
                        {step.label}
                      </span>
                    </div>
                    {i < STAGES.length - 1 && (
                      <div className={`h-0.5 w-8 mx-2 mb-4 transition-colors ${step.done ? "bg-[#2563EB]" : "bg-[#E2E8F0]"}`}/>
                    )}
                  </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Детали проекта</h3>
            {projectError ? (
              <div className="flex items-start gap-2.5 text-red-600">
                <AlertTriangle size={15} className="mt-0.5 flex-shrink-0"/>
                <div>
                  <p className="text-sm font-medium">Не удалось загрузить детали проекта</p>
                  <p className="text-xs text-red-500 mt-1">{projectError}</p>
                </div>
              </div>
            ) : (
              <dl className="space-y-2.5">
                {sidebarDetails.map(([l, v]) => (
                    <div key={l} className="flex items-start justify-between gap-3">
                      <dt className="text-xs text-slate-400">{l}</dt>
                      <dd className="text-xs font-medium text-slate-700 text-right">{v}</dd>
                    </div>
                ))}
              </dl>
            )}
          </div>
        </div>

        {showEstimate && <EstimateTable rows={estimateRows}/>} 

        {sent && !isApproved && (
            <div className="mb-6 rounded-lg border p-5 bg-slate-50 border-[#E2E8F0]">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={14} className="animate-spin text-slate-400"/>
                  Ожидаем подтверждения Комдира…
                </div>
            </div>
        )}

        {isRejected && (
            <div className="mb-6 rounded-lg border p-5 bg-red-50 border-red-200">
                <div className="flex items-center gap-2 text-sm text-red-700">
                  <XCircle size={14}/>
                  КП отклонено Комдиром. Отредактируйте товары ниже и отправьте повторно.
                </div>
            </div>
        )}

        {(currentStatus === "Ожидание клиента" || currentStatus === "Одобрено Комдиром") && (
            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/70 shadow-sm p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <FileText size={18} className="text-blue-600"/>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Ожидание решения клиента</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      КП отправлено клиенту на подпись. Отметьте результат, когда получите ответ.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
                  <AppTooltip text={!kpGenerated ? "Сначала сгенерируйте КП" : ""}>
                    <button
                        onClick={handleClientReject}
                        disabled={approvingClient || rejecting || !kpGenerated}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-red-300 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {rejecting ? <Loader2 size={14} className="animate-spin"/> : <XCircle size={14}/>}
                      Клиент просит правки
                    </button>
                  </AppTooltip>
                  <AppTooltip text={!kpGenerated ? "Сначала сгенерируйте КП" : ""}>
                    <button
                        onClick={handleClientApprove}
                        disabled={approvingClient || rejecting || !kpGenerated}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {approvingClient ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>}
                      Одобрено клиентом
                    </button>
                  </AppTooltip>
                </div>
              </div>
            </div>
        )}

        <div className="mt-2">
            <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                    <h3 className="text-sm font-semibold text-slate-900">Результаты ML-импорта</h3>
                    {mlImport && <p className="text-xs text-slate-400 mt-1">Файл: {mlImport.source_file_name}</p>}
                </div>

                <div className="flex items-center gap-3">
                  {/* Бейдж "Подтверждено" нужен только пока КП ещё не решён Комдиром —
                      после одобрения/отклонения это уже видно по статусу проекта
                      сверху, и дублирующий зелёный бейдж только путает. */}
                  {mlImport && !isApproved && !isRejected && (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${mlImport.status === "confirmed" ? "bg-green-50 text-green-700 ring-1 ring-green-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"}`}>
                      {mlImport.status === "confirmed" ? "Подтверждено" : "Черновик"}
                    </span>
                  )}

                  {!isPastApprovalWindow && (
                    <AppTooltip text={
                      !mlImport || mlImport.status !== "confirmed"
                        ? "Сначала подтвердите импорт товаров"
                        : !isApproved
                        ? "Генерация КП доступна только после одобрения Комдиром"
                        : ""
                    }>
                      <button
                        onClick={handleGenerateKP}
                        disabled={!mlImport || mlImport.status !== "confirmed" || !isApproved || isGeneratingKP}
                        className={`flex items-center gap-2 px-5 py-2.5 border text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                          mlImport?.status === "confirmed" && isApproved
                            ? "bg-white border-[#E2E8F0] text-slate-700 hover:bg-slate-50 cursor-pointer"
                            : "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        {isGeneratingKP ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        {isGeneratingKP ? "Генерация..." : "Сгенерировать КП"}
                      </button>
                    </AppTooltip>
                  )}

                  <AppTooltip text={
                    !mlImport ? "Сначала подтвердите импорт товаров" :
                    mlImport.status !== "confirmed" ? (isRejected ? "Сначала подтвердите изменённый импорт товаров" : "Сначала подтвердите импорт товаров") :
                    ""
                  }>
                    <button
                      onClick={handleSendToDirector}
                      disabled={!mlImport || mlImport.status !== "confirmed" || sending || sent || isApproved}
                      className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap ${
                          sent ? "bg-green-600 text-white cursor-default" :
                          isApproved ? "bg-green-700 text-white cursor-default" :
                          mlImport?.status !== "confirmed" ? "bg-slate-200 text-slate-400 cursor-not-allowed" :
                          isRejected ? "bg-red-600 hover:bg-red-700 text-white" :
                          !sending ? "bg-[#2563EB] hover:bg-[#1d4ed8] text-white" :
                          "bg-slate-200 text-slate-400 cursor-not-allowed"
                      }`}>
                      {sending ? <><Loader2 size={14} className="animate-spin"/>Отправка…</> :
                          sent ? <><CheckCircle2 size={14}/>КП на согласовании</> :
                          isPastApprovalWindow ? <><CheckCircle2 size={14}/>Клиент принял КП</> :
                          isApproved ? <><CheckCircle2 size={14}/>КП одобрено</> :
                          isRejected ? <><XCircle size={14}/>Отправить повторно</> :
                              <><Send size={14}/>Отправить Комдиру</>}
                    </button>
                  </AppTooltip>
                </div>
            </div>

            {mlImportError && (
              <div className="flex items-start gap-2.5 mb-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-700">Ошибка ML-импорта</p>
                  <p className="text-xs text-red-600 mt-1">{mlImportError}</p>
                </div>
              </div>
            )}

            {mlImportLoading ? (
              <div className="bg-white rounded-lg border border-[#E2E8F0] p-10 flex flex-col items-center">
                <Loader2 size={26} className="animate-spin text-[#2563EB] mb-3" />
                <p className="text-sm text-slate-600">Загружаем результаты ML…</p>
              </div>
            ) : !mlImport ? (
              <div className="bg-white rounded-lg border border-[#E2E8F0] px-4 py-10 text-center">
                <p className="text-sm text-slate-400">Для этого проекта ML-импорт пока не найден</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-x-auto">
                  <table className="w-full min-w-[1900px] border-collapse">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-slate-50/60">
                        {["Исходный товар", "Кол-во", "Статус ML", "Совпавший товар", "Поставщик", "Себестоимость", "Цена", "Сумма", "Маржа", "Доступно", "Комментарий", "Статус"].map((heading) => (
                          <th key={heading} className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left whitespace-nowrap">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {mlImport.items.length === 0 ? (
                        <tr><td colSpan={12} className="px-4 py-10 text-center text-sm text-slate-400">В ML-импорте нет товаров</td></tr>
                      ) : (
                        mlImport.items.map((item) => {
                          const isUpdating = updatingItemId === item.id;
                          const priceCost = Number(item.price_cost ?? 0);
                          const price = Number(item.price ?? 0);
                          const totalAmount = Number(item.total_amount ?? 0);
                          const margin = Number(item.margin ?? 0);
                          const marginPercent = margin * 100;
                          const normalizedStatus = normalizeMlStatus(item.ml_status);
                          const statusStyle = ML_STATUS_STYLES[normalizedStatus];

                          return (
                              <tr key={item.id} className={`transition-colors ${statusStyle.row}`}>
                                <td className="px-4 py-3"><p
                                    className="text-sm font-medium text-slate-800">{item.input_product}</p></td>
                                <td className="px-4 py-3 text-sm font-mono text-slate-700">{item.input_quantity}</td>
                                <td className="px-4 py-3">
                                  <span
                                      className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap ${statusStyle.badge}`}>
                                    {normalizedStatus}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <p className="text-sm text-slate-700">{item.matched_product ?? "—"}</p>
                                  {item.matched_external_id &&
                                      <p className="text-xs text-slate-400 mt-1">ML ID: {item.matched_external_id}</p>}
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                      key={`${item.id}-supplier-${item.supplier_name ?? ""}`}
                                      type="text"
                                      maxLength={255}
                                      disabled={mlImport.status !== "draft" || isUpdating || item.is_confirmed}
                                      defaultValue={item.supplier_name ?? ""}
                                      placeholder="Укажите поставщика"
                                      onBlur={(event) => {
                                        const supplierName = event.target.value.trim() || null;
                                        if (supplierName !== item.supplier_name) {
                                          handleMlItemUpdate(item.id, {supplier_name: supplierName});
                                        }
                                      }}
                                      className={`w-44 px-2 py-1.5 text-sm border rounded-md bg-white focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/20 disabled:bg-slate-100 ${
                                        item.supplier_name?.trim()
                                          ? "border-[#E2E8F0]"
                                          : "border-red-300"
                                      }`}
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                      key={`${item.id}-cost-${item.price_cost}`}
                                      type="number" min={0} step="1"
                                      disabled={mlImport.status !== "draft" || isUpdating || item.is_confirmed} defaultValue={priceCost}
                                      onBlur={(event) => {
                                        const newPriceCost = Number(event.target.value);
                                        if (!Number.isFinite(newPriceCost) || newPriceCost < 0) {
                                          setMlImportError("Себестоимость должна быть числом больше или равным нулю");
                                          return;
                                        }
                                        if (newPriceCost !== priceCost) handleMlItemUpdate(item.id, {price_cost: newPriceCost});
                                      }}
                                      className="w-32 px-2 py-1.5 text-sm font-mono border border-[#E2E8F0] rounded-md bg-white focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/20 disabled:bg-slate-100"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                      key={`${item.id}-price-${item.price}`}
                                      type="number" min={0} step="1"
                                      disabled={mlImport.status !== "draft" || isUpdating || item.is_confirmed}
                                      defaultValue={price}
                                      onBlur={(event) => {
                                        const newPrice = Number(event.target.value);
                                        if (!Number.isFinite(newPrice) || newPrice < 0) {
                                          setMlImportError("Цена должна быть числом больше или равным нулю");
                                          return;
                                        }
                                        if (newPrice !== price) handleMlItemUpdate(item.id, {price: newPrice});
                                      }}
                                      className="w-32 px-2 py-1.5 text-sm font-mono border border-[#E2E8F0] rounded-md bg-white focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/20 disabled:bg-slate-100"
                                  />
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap"><span
                                    className="text-sm font-semibold font-mono text-slate-800">{formatMoney(totalAmount)}</span>
                                </td>
                                <td className="px-4 py-3">
                                <span
                                    className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded whitespace-nowrap ${marginPercent >= 20 ? "bg-green-50 text-green-700 ring-1 ring-green-200" : marginPercent > 0 ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200" : marginPercent < 0 ? "bg-red-50 text-red-700 ring-1 ring-red-200" : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"}`}>
                                  {marginPercent.toFixed(1)}%
                                </span>
                                </td>
                                <td className="px-4 py-3 text-sm font-mono text-slate-700">{item.available_quantity}</td>
                                <td className="px-4 py-3">
                                  <input
                                      key={`${item.id}-comment-${item.user_comment ?? ""}`}
                                      type="text" maxLength={1000} disabled={mlImport.status !== "draft" || isUpdating || item.is_confirmed}
                                      defaultValue={item.user_comment ?? ""} placeholder="Комментарий"
                                      onBlur={(event) => {
                                        const comment = event.target.value.trim() || null;
                                        if (comment !== item.user_comment) {
                                          handleMlItemUpdate(item.id, {user_comment: comment});
                                        }
                                      }}
                                      className="w-44 px-2 py-1.5 text-sm border border-[#E2E8F0] rounded-md bg-white focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/20 disabled:bg-slate-100"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  {isUpdating ? (
                                      <Loader2
                                          size={16}
                                          className="animate-spin text-[#2563EB]"
                                      />
                                  ) : item.is_confirmed ? (
                                      <span
                                          className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
      <CheckCircle2 size={14}/>
      Добавлен
    </span>
                                  ) : normalizedStatus === "Нет в системе" ? (
                                      <button
                                          type="button"
                                          onClick={() => openProductModal(item)}
                                          disabled={mlImport.status !== "draft"}
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                                      >
                                        Добавить товар
                                      </button>
                                  ) : normalizedStatus === "На складе" ? (
                                      <span
                                          className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
      <CheckCircle2 size={14}/>
      На складе
    </span>
                                  ) : Number(item.price ?? 0) > 0 &&
                                  Number(item.margin ?? 0) >= 0 &&
                                  Number(
                                      item.final_quantity ??
                                      item.input_quantity ??
                                      0
                                  ) > 0 ? (
                                      <span
                                          className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
      <CheckCircle2 size={14}/>
      Будет куплено
    </span>
                                  ) : (
                                      <span className="text-xs font-medium text-red-700">
      Требуется указать цену
    </span>
                                  )}
                                </td>
                              </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between gap-4 mt-4">
                  <p className="text-xs text-slate-400">
                    Для строк «Нет в системе» сначала создайте товар через кнопку в строке.
                    У остальных строк должны быть указаны поставщик, цена и количество.
                  </p>
                  <button
                      type="button"
                      onClick={handleConfirmMlImport}
                      disabled={!canConfirmMlImport || confirmingImport}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:bg-[#2563EB] disabled:text-white disabled:hover:bg-[#2563EB] disabled:cursor-not-allowed"
                  >
                    {confirmingImport ? (
                        <>
                          <Loader2 size={15} className="animate-spin"/>
                          Подтверждение…
                        </>
                    ) : mlImport.status === "confirmed" ? (
                        <>
                          <CheckCircle2 size={15}/>
                          Импорт подтверждён
                        </>
                    ) : (
                        <>
                          <Check size={15}/>
                          Подтвердить импорт
                        </>
                    )}
                  </button>
                </div>
              </>
            )}
        </div>

        {productModalItem && (
          <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-product-title"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeProductModal();
              }}
          >
            <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
                <div>
                  <h2 id="create-product-title" className="text-lg font-semibold text-slate-900">
                    Добавить товар в систему
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Строка останется со статусом «Нет в системе», но будет готова к подтверждению.
                  </p>
                </div>
                <button
                    type="button"
                    onClick={closeProductModal}
                    disabled={savingProduct}
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed"
                    aria-label="Закрыть"
                >
                  <XCircle size={20}/>
                </button>
              </div>

              <form onSubmit={handleCreateProduct} className="space-y-4 px-6 py-5">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Название товара
                  </span>
                  <input
                      type="text"
                      required
                      maxLength={255}
                      value={productModalForm.product_name}
                      onChange={(event) => setProductModalForm((current) => ({
                        ...current,
                        product_name: event.target.value,
                      }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Поставщик
                  </span>
                  <input
                      type="text"
                      required
                      maxLength={255}
                      value={productModalForm.supplier_name}
                      onChange={(event) => setProductModalForm((current) => ({
                        ...current,
                        supplier_name: event.target.value,
                      }))}
                      placeholder="Введите имя поставщика"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Единица измерения
                  </span>
                  <input
                      type="text"
                      required
                      maxLength={50}
                      list="ml-product-unit-options"
                      value={productModalForm.unit}
                      onChange={(event) => setProductModalForm((current) => ({
                        ...current,
                        unit: event.target.value,
                      }))}
                      placeholder="Выберите или введите"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                  />
                  <datalist id="ml-product-unit-options">
                    {["шт", "компл.", "упак.", "кг", "м", "л"].map((unit) => (
                      <option key={unit} value={unit}/>
                    ))}
                  </datalist>
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Себестоимость
                    </span>
                    <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        value={productModalForm.price_cost}
                        onChange={(event) => setProductModalForm((current) => ({
                          ...current,
                          price_cost: event.target.value,
                        }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Цена продажи
                    </span>
                    <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        value={productModalForm.price}
                        onChange={(event) => setProductModalForm((current) => ({
                          ...current,
                          price: event.target.value,
                        }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                    />
                  </label>
                </div>

                {productModalError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {productModalError}
                  </div>
                )}

                <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                  <button
                      type="button"
                      onClick={closeProductModal}
                      disabled={savingProduct}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Отмена
                  </button>
                  <button
                      type="submit"
                      disabled={savingProduct}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {savingProduct && <Loader2 size={15} className="animate-spin"/>}
                    {savingProduct ? "Сохранение…" : "Создать товар"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
    </PageWrap>
  );
}

export function ProjectPageDirector({projectState, onKpApproved, projectId}: {
  projectState: ProjectState; onKpApproved: () => void; projectId: number;
}) {
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showEstimate, setShowEstimate] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const resolvedProjectId = Number(projectId);
  const hasValidProjectId = Number.isInteger(resolvedProjectId) && resolvedProjectId > 0;
  const [projectItems, setProjectItems] =
  useState<ProjectItemResponse[]>([]);

const [projectItemsLoading, setProjectItemsLoading] =
  useState(false);

const [projectItemsError, setProjectItemsError] =
  useState<string | null>(null);

  const estimateRows: EstimateRow[] = projectItems.map((item) => {
    const parsedPrice = item.estimated_price == null
      ? null
      : Number(item.estimated_price);

    return {
      id: item.id,
      name: item.product?.name ?? "—",
      code: item.matched_external_id ?? item.product?.external_id ?? null,
      quantity: Number(item.required_quantity ?? 0),
      estimatedPrice: parsedPrice != null && Number.isFinite(parsedPrice)
        ? parsedPrice
        : null,
    };
  });
  useEffect(() => {
    if (!hasValidProjectId) {
      setProject(null);
      setProjectError(`Некорректный ID проекта: ${String(projectId)}`);
      return;
    }
    let cancelled = false;
    setProjectError(null);
    fetchProjectDetails(resolvedProjectId)
      .then((data) => { if (!cancelled) { setProject(data); setProjectError(null); } })
      .catch((error) => { if (!cancelled) { setProject(null); setProjectError(error instanceof Error ? error.message : "Не удалось загрузить проект"); } });
    return () => { cancelled = true; };
  }, [resolvedProjectId, hasValidProjectId]);

  useEffect(() => {
  if (!hasValidProjectId) {
    setProjectItems([]);
    setProjectItemsError(
      `Некорректный ID проекта: ${String(projectId)}`,
    );
    return;
  }

  let cancelled = false;

  setProjectItemsLoading(true);
  setProjectItemsError(null);

  fetchProjectItems(resolvedProjectId)
    .then((data) => {
      if (cancelled) return;

      setProjectItems(data);
      setProjectItemsError(null);
    })
    .catch((error) => {
      if (cancelled) return;

      setProjectItems([]);

      setProjectItemsError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить позиции проекта",
      );
    })
    .finally(() => {
      if (!cancelled) {
        setProjectItemsLoading(false);
      }
    });

  return () => {
    cancelled = true;
  };
}, [
  resolvedProjectId,
  hasValidProjectId,
  projectId,
]);
  const currentStatus = project?.status?.status_name || "На согласовании у Комдира";

  const PENDING_DIRECTOR_STATUS = "На согласовании у Комдира";
  const REJECTED_STATUS = "Отклонено Комдиром";

  const decision: null | boolean =
    currentStatus === REJECTED_STATUS ? false :
    currentStatus === PENDING_DIRECTOR_STATUS ? null :
    true;

  const decide = async (approve: boolean) => {
    if (!project) return;

    if (!approve && !showRejectForm) {
      // Первый клик по "Отклонить КП" просто открывает форму с комментарием.
      setShowRejectForm(true);
      return;
    }

    setDeciding(true);
    try {
      if (approve) {
        await approveProjectDirector(project.id);
        setProject(await fetchProjectDetails(project.id));
        onKpApproved();
      } else {
        await rejectProjectDirector(project.id, rejectReason.trim() || undefined);
        setProject(await fetchProjectDetails(project.id));
        setShowRejectForm(false);
        setRejectReason("");
      }
    } catch (error) {
      console.error("Ошибка при принятии решения:", error);
      alert("Не удалось сохранить решение.");
    } finally {
      setDeciding(false);
    }
  };

  const handleExportExcel = async () => {
    if (!project) return;
    try {
      setIsExporting(true);
      await downloadProjectExcel(project.id);
    } catch (error) {
      console.error("Ошибка при скачивании:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const title = project?.name ?? "Офисный комплекс «Башня»";
  const subtitle = project
      ? `${project.client?.client_name ?? "—"} · Проверка КП`
      : "ООО «СтройТех» · Проверка КП";
  const sidebarDetails: [string, string][] = [
  [
    "Сумма КП",
    project?.invoice?.amount != null
      ? fmt(Number(project.invoice.amount))
      : "—",
  ],
  [
    "Маржа",
    project?.planned_margin != null
      ? `${project.planned_margin}%`
      : "—",
  ],
  [
    "Клиент",
    project?.client?.client_name ?? "—",
  ],
  [
    "PM",
    project?.pm?.name ?? "—",
  ],
  [
    "Дедлайн",
    project?.deadline
      ? new Date(project.deadline).toLocaleDateString("ru-RU")
      : "—",
  ],
  [
    "Договор",
    project?.contract_number ?? "—",
  ],
];

  return (
    <PageWrap
      title={title}
      subtitle={subtitle}
      actions={
        <div className="flex items-center gap-2">
          <Chip status={currentStatus} />
          <Chip status="kp" />
          <button
            type="button"
            onClick={() => setShowEstimate((current) => !current)}
            disabled={projectItemsLoading || projectItems.length === 0}
            aria-expanded={showEstimate}
            className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              showEstimate
                ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                : "border-[#E2E8F0] bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Calculator size={14}/>
            Смета
          </button>
          <button
            onClick={handleExportExcel}
            disabled={isExporting || !project}
            className="flex items-center gap-1.5 ml-2 px-3 py-1.5 bg-white border border-[#E2E8F0] text-slate-600 text-xs font-medium rounded hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={14} className="animate-spin"/> : <Download size={14} />}
            {isExporting ? "Скачивание..." : "Скачать Excel"}
          </button>
        </div>
      }
    >
      {projectError && (
        <div className="mb-6 flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700">Не удалось загрузить проект</p>
            <p className="text-xs text-red-600 mt-1">{projectError}</p>
          </div>
        </div>
      )}
      {showEstimate && <EstimateTable rows={estimateRows}/>} 
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
              <tr className="border-b border-[#E2E8F0] bg-slate-50/60">
                {["Наименование", "Поставщик", "Кол-во", "Ед.", "Себестоимость", "Цена", "Сумма", "Маржа"].map(h => (
                    <th key={h}
                        className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {projectItemsLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                      <Loader2 size={16} className="inline-block animate-spin text-[#2563EB] mr-2" />
                      Загружаем позиции проекта…
                    </td>
                  </tr>
                ) : projectItemsError ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-red-500">
                      {projectItemsError}
                    </td>
                  </tr>
                ) : projectItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                      В проекте нет позиций
                    </td>
                  </tr>
                ) : (
                  projectItems.map(item => {
                    const qty = Number(item.required_quantity ?? 0);
                    const price = Number(item.sale_price ?? 0);
                    const priceCost = Number(item.cost_price ?? 0);
                    const total = item.total_sum != null ? Number(item.total_sum) : qty * price;
                    const margin = price > 0 ? ((price - priceCost) / price) * 100 : 0;

                    return (
                        <tr key={item.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-sm text-slate-700">{item.product?.name ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {item.supplier_raw_name ?? item.supplier?.supplier_name ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono">{qty.toLocaleString("ru-RU")}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{item.product?.unit ?? "шт"}</td>
                          <td className="px-4 py-3 text-sm font-mono">{priceCost.toLocaleString("ru-RU", {minimumFractionDigits: 0, maximumFractionDigits: 2,})}</td>
                          <td className="px-4 py-3 text-sm font-mono">{price.toLocaleString("ru-RU")}</td>
                          <td className="px-4 py-3 text-sm font-mono font-semibold">{total.toLocaleString("ru-RU")}</td>
                          <td className="px-4 py-3">
                          <span
                              className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded whitespace-nowrap ${margin >= 20 ? "bg-green-50 text-green-700 ring-1 ring-green-200" : margin > 0 ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200" : "bg-red-50 text-red-700 ring-1 ring-red-200"}`}>
                            {margin.toFixed(1)}%
                          </span>
                          </td>
                        </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Решение по КП</h3>
            {deciding ? (
                <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15}
                                                                                         className="animate-spin text-[#2563EB]"/>Сохранение
                  решения…</div>
            ) : decision === null ? (
                showRejectForm ? (
                  <div className="space-y-3">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Причина отклонения (необязательно)"
                      rows={3}
                      className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-200"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => decide(false)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                      >
                        <XCircle size={15}/> Отклонить
                      </button>
                      <button
                        onClick={() => { setShowRejectForm(false); setRejectReason(""); }}
                        className="px-5 py-2.5 bg-white text-slate-600 text-sm font-medium rounded-lg border border-[#E2E8F0] hover:bg-slate-50 transition-colors whitespace-nowrap"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button onClick={() => decide(true)} disabled={!project}
                            className="flex items-center gap-2 px-5 py-2.5 bg-[#16A34A] text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                      <CheckCircle2 size={15}/> Подтверждаю
                    </button>
                    <button onClick={() => decide(false)} disabled={!project}
                            className="flex items-center gap-2 px-5 py-2.5 bg-white text-red-600 text-sm font-medium rounded-lg border border-[#E2E8F0] hover:bg-red-50 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                      <XCircle size={15}/> Отклонить КП
                    </button>
                  </div>
                )
            ) : decision ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle2 size={16} className="text-green-600"/><span
                    className="text-sm font-medium text-green-700">КП подтверждено</span></div>
            ) : (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 rounded-lg border border-red-200"><XCircle
                    size={16} className="text-red-600"/><span
                    className="text-sm font-medium text-red-700">КП отклонено</span></div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Детали</h3>
            {projectError ? (
                <div className="flex items-start gap-2.5 text-red-600">
                  <AlertTriangle
                      size={15}
                      className="mt-0.5 flex-shrink-0"
                  />

                  <div>
                    <p className="text-sm font-medium">
                      Не удалось загрузить детали проекта
                    </p>

                    <p className="mt-1 text-xs text-red-500">
                      {projectError}
                    </p>
                  </div>
                </div>
            ) : (
                <dl className="space-y-2.5">
                  {sidebarDetails.map(([label, value]) => (
                      <div
                          key={label}
                          className="flex items-start justify-between gap-3"
                      >
                        <dt className="text-xs text-slate-400">
                          {label}
                        </dt>

                        <dd className="text-right text-xs font-medium text-slate-700">
                          {value}
                        </dd>
                      </div>
                  ))}
                </dl>
            )}
          </div>
        </div>
      </div>
    </PageWrap>
  );
}

export function ProjectPageAccountant({projectId}: { projectId: number }) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      await downloadProjectExcel(projectId);
    } catch (error) {
      console.error("Ошибка при скачивании:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <PageWrap
      title="Офисный комплекс «Башня»"
      subtitle="ООО «СтройТех» · Счета и оплата"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-1.5 ml-2 px-3 py-1.5 bg-white border border-[#E2E8F0] text-slate-600 text-xs font-medium rounded hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={14} className="animate-spin"/> : <Download size={14} />}
            {isExporting ? "Скачивание..." : "Скачать Excel"}
          </button>
        </div>
      }
    >
      <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-[#E2E8F0] bg-slate-50/60">
            {["Счёт","Поставщик","Сумма","Статус",""].map(h => <th key={h} className="px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide text-left">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {INVOICES_INIT.slice(0,3).map(inv => (
              <tr key={inv.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 text-xs font-mono text-slate-600">{inv.id}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{inv.supplier}</td>
                <td className="px-4 py-3 text-sm font-mono text-slate-900">{fmt(inv.amount)}</td>
                <td className="px-4 py-3"><Chip status={inv.status} /></td>
                <td className="px-4 py-3">{inv.status === "approved" && <button className="text-xs px-2.5 py-1 bg-[#16A34A] text-white rounded font-medium hover:bg-green-700 transition-colors whitespace-nowrap">Оплатить</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageWrap>
  );
}

export function ProjectPageWarehouse() {
  return (
    <PageWrap title="Офисный комплекс «Башня»" subtitle="ООО «СтройТех» · Резерв и отгрузка">
      <div className="bg-white rounded-lg border border-[#E2E8F0] p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Резерв под проект</h3>
        <div className="space-y-2">
          {STOCK_INIT.slice(0,4).map(item => (
            <div key={item.id} className="flex items-center justify-between py-2 border-b border-[#E2E8F0] last:border-0">
              <span className="text-sm text-slate-700">{item.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-violet-600 font-medium">{item.reserved} {item.unit} зарезервировано</span>
                <span className="text-xs text-green-600 font-medium">{item.available} доступно</span>
              </div>
            </div>
          ))}
        </div>
        <button className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white text-sm font-medium rounded-lg hover:bg-[#1d4ed8] transition-colors whitespace-nowrap"><Truck size={14} /> Оформить отгрузку</button>
      </div>
    </PageWrap>
  );
}
export function ProjectPage({
  role,
  onNavigate,
  projectState,
  onKpSent,
  onKpApproved,
  receipts,
  projectItems,
  projectId,
  onOpenProject,
}: {
  role: Role | string;
  onNavigate: (p: Page) => void;
  projectState: ProjectState;
  onKpSent: () => void;
  onKpApproved: () => void;
  receipts: Receipt[];
  projectItems: ProjectItem[];
  projectId: number;
  onOpenProject?: (projectId: number) => Promise<void>;
}) {
  if (role === "pm") {
    return (
      <ProjectPagePM
        onNavigate={onNavigate}
        projectState={projectState}
        onKpSent={onKpSent}
        receipts={receipts}
        projectItems={projectItems}
        projectId={projectId}
      />
    );
  }

  if (role === "commercial_director" || role === "director") {
    return (
      <ProjectPageDirector
        projectState={projectState}
        onKpApproved={onKpApproved}
        projectId={projectId}
      />
    );
  }

  if (role === "accountant") {
    return <ProjectPageAccountant projectId={projectId} />;
  }

  return <ProjectPageWarehouse />;
}
