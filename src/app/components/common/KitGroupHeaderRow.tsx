import { useState } from "react";
import { AlertTriangle, ChevronDown, Loader2, Package, Pencil } from "lucide-react";
import { patchKitGroupPrices } from "../../../api/api";

const formatQty = (value: number) => value.toLocaleString("ru-RU");

interface KitGroupHeaderRowProps {
  projectId: number;
  groupKey: string;
  kitName: string;
  kitQuantity: number;
  itemCount: number;
  colSpan: number;
  expanded: boolean;
  onToggleExpand: () => void;
  // «Заявка на склад» не несёт цен — там показываем только состав и
  // количество, без единого денежного поля и без редактора цены.
  showPrices: boolean;
  kitUnitSalePrice: number;
  kitUnitCostPrice: number;
  itemsTotalSum: number;
  // Тот же canEditItems (decision === null), что уже гейтит правку цены/
  // себестоимости обычных позиций у Комдира — редактор цены комплекта
  // подчиняется ровно тому же правилу.
  canEdit: boolean;
  onPricesSaved: () => void;
}

export function KitGroupHeaderRow({
  projectId,
  groupKey,
  kitName,
  kitQuantity,
  itemCount,
  colSpan,
  expanded,
  onToggleExpand,
  showPrices,
  kitUnitSalePrice,
  kitUnitCostPrice,
  itemsTotalSum,
  canEdit,
  onPricesSaved,
}: KitGroupHeaderRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saleInput, setSaleInput] = useState("");
  const [costInput, setCostInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setSaleInput(String(kitUnitSalePrice));
    setCostInput(String(kitUnitCostPrice));
    setError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    const newSale = Number(saleInput);
    const newCost = Number(costInput);

    if (!Number.isFinite(newSale) || newSale < 0) {
      setError("Цена комплекта должна быть числом больше или равным нулю");
      return;
    }
    if (!Number.isFinite(newCost) || newCost < 0) {
      setError("Себестоимость комплекта должна быть числом больше или равным нулю");
      return;
    }

    const payload: { sale_price?: number; cost_price?: number } = {};
    if (newSale !== kitUnitSalePrice) payload.sale_price = newSale;
    if (newCost !== kitUnitCostPrice) payload.cost_price = newCost;

    if (Object.keys(payload).length === 0) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await patchKitGroupPrices(projectId, groupKey, payload);
      setIsEditing(false);
      onPricesSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить цену комплекта");
    } finally {
      setSaving(false);
    }
  };

  const kitTotalExpected = kitUnitSalePrice * kitQuantity;
  const sumMismatch =
    showPrices && Math.abs(itemsTotalSum - kitTotalExpected) > 0.01;

  return (
    <tr className="bg-blue-50/40 dark:bg-blue-400/10">
      <td colSpan={colSpan} className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={expanded}
              aria-label={expanded ? "Свернуть комплект" : "Развернуть комплект"}
              className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
          >
            <ChevronDown
                size={16}
                className={`transition-transform ${expanded ? "" : "-rotate-90"}`}
            />
          </button>

          <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 dark:bg-blue-400/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            <Package size={11} />
            Комплект
          </span>

          <span className="text-sm font-medium text-foreground">{kitName}</span>
          <span className="text-xs text-muted-foreground">× {formatQty(kitQuantity)}</span>

          {showPrices && (
            <>
              <span className="text-xs text-muted-foreground">
                Цена комплекта: <span className="font-mono text-foreground">{formatQty(kitUnitSalePrice)}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                Себестоимость: <span className="font-mono text-foreground">{formatQty(kitUnitCostPrice)}</span>
              </span>
            </>
          )}

          <span className="text-xs text-muted-foreground">{itemCount} позиций</span>

          {showPrices && (
            <span className="text-xs font-semibold text-foreground">
              Сумма: {formatQty(itemsTotalSum)}
            </span>
          )}

          {sumMismatch && (
            <span className="inline-flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400">
              <AlertTriangle size={11} />
              сумма позиций ≠ цена комплекта
            </span>
          )}

          {showPrices && canEdit && !isEditing && (
            <button
                type="button"
                onClick={startEditing}
                className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Pencil size={11} />
              Изменить цену комплекта
            </button>
          )}
        </div>

        {showPrices && isEditing && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Цена:
              <input
                  type="number"
                  min={0}
                  step="1"
                  disabled={saving}
                  value={saleInput}
                  onChange={(event) => setSaleInput(event.target.value)}
                  className="w-28 px-2 py-1 text-sm font-mono border border-border rounded-md bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:bg-muted"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Себестоимость:
              <input
                  type="number"
                  min={0}
                  step="1"
                  disabled={saving}
                  value={costInput}
                  onChange={(event) => setCostInput(event.target.value)}
                  className="w-28 px-2 py-1 text-sm font-mono border border-border rounded-md bg-card focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:bg-muted"
              />
            </label>
            <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              Сохранить
            </button>
            <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-md hover:bg-background transition-colors disabled:opacity-50"
            >
              Отмена
            </button>
            {error && (
              <span className="w-full text-xs text-red-700 dark:text-red-300">{error}</span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
