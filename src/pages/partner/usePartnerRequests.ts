import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPartnerRequests, parsePartnerError, type PartnerRequest } from "../../api/partner";

const PAGE = 20;
// Верхняя граница, чтобы не гонять бесконечный цикл запросов: 10 × 20 = 200 заявок.
const MAX_PAGES = 10;

export type PartnerRequestsState = {
  items: PartnerRequest[];
  total: number;
  /** true, если заявок больше, чем мы загрузили (MAX_PAGES) */
  truncated: boolean;
  loading: boolean;
  error: string | null;
  reload: (silent?: boolean) => Promise<void>;
};

// У GET /partner/requests нет фильтра по статусу, поэтому все заявки партнёра
// подгружаются страницами по 20 и фильтруются/листаются на клиенте. Один и тот
// же набор данных кормит и полосу статистики в шапке, и вкладку «Мои заявки».
export function usePartnerRequests(onNoCompany: () => void): PartnerRequestsState {
  const [items, setItems] = useState<PartnerRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const onNoCompanyRef = useRef(onNoCompany);
  onNoCompanyRef.current = onNoCompany;

  const reload = useCallback(async (silent = false) => {
    const current = ++seq.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const collected: PartnerRequest[] = [];
      let totalCount = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await fetchPartnerRequests({ limit: PAGE, offset: page * PAGE });
        if (current !== seq.current) return;
        collected.push(...res.items);
        totalCount = res.total;
        // Первая страница показывается сразу, остальные дозагружаются.
        setItems([...collected]);
        setTotal(totalCount);
        if (page === 0) setLoading(false);
        if (res.items.length < PAGE || collected.length >= totalCount) break;
      }
    } catch (err) {
      if (current !== seq.current) return;
      const parsed = parsePartnerError(err);
      if (parsed.body.code === "no_company") {
        onNoCompanyRef.current();
        return;
      }
      setError(parsed.message);
    } finally {
      if (current === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(false);
  }, [reload]);

  return { items, total, truncated: items.length < total, loading, error, reload };
}
