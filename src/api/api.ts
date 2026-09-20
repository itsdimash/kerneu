import axios from "axios";

export const api = axios.create({
    baseURL: "/api/v1",
    withCredentials: true, // очень важно для Cookie
});

export interface ProjectItem extends ProjectItemKitFields {
  id: number;
  project_id: number;
  product_id: number;
  supplier_id?: number | null;
  supplier_raw_name?: string | null;
  required_quantity: number;

  cost_price: number | string;
  sale_price: number | string;
  total_sum: number | string;
  estimated_price?: number | string | null;
  estimated_total?: number | string | null;
  matched_external_id?: string | null;

  product?: {
    id: number;
    name: string;
    unit?: string | null;
    cost_price?: number | string;
    external_id?: string | null;
  } | null;

  supplier?: {
    id: number;
    supplier_name: string;
  } | null;
}

export const getProjectItems = async (projectId: number | string) => {
  const { data } = await api.get<ProjectItem[]>(
    `/project-items/${projectId}`
  );

  return data;
};

export interface DashboardStats {
  active_projects: number;
  deadline_projects: number;
  new_projects_month: number;
  pending_kp: number;
  planned_revenue: number;
  revenue_growth: number; // например, 18 (%)
}

export const fetchDashboardStats = async (): Promise<DashboardStats> => {
  const response = await fetch("/api/v1/dashboard/stats", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Ошибка при загрузке статистики дашборда");
  }
  return await response.json();
};

export interface ProjectResponse {
  id: number;
  name?: string;
  client?: { id: number; client_name: string };
  pm?: { id: number; name: string };
  status?: { id: number; status_name: string };
  invoice?: { amount: number };
  planned_margin?: number;
  deadline?: string;
  contract_number?: string;
  created_at?: string;
  /**
   * Экспресс-проект, созданный кнопкой «Загрузить договор» на дашборде:
   * договор уже подписан, согласовывать не с кем. По этому флагу ProjectPage
   * прячет блоки КП и согласования и показывает короткий степпер.
   */
  is_express?: boolean;
  /**
   * «Заявка на склад», созданная одноимённой кнопкой на дашборде: внутренний
   * запрос по наличию, а не коммерческое предложение клиенту. По этому флагу
   * ProjectPage/ProjectPageDirector скрывают цену/себестоимость/поставщика
   * и укорачивают степпер (клиент и подписание договора не нужны).
   */
  is_warehouse_request?: boolean;
}

const API_BASE = "/api/v1";

export async function fetchProjectDetails(projectId: number): Promise<ProjectResponse> {
  const url = `${API_BASE}/projects/${projectId}`;
  console.log("Запрос к:", url);
  const res = await fetch(url, {
    credentials: "include",
  });
  console.log("Статус ответа:", res.status);
  const text = await res.text();
  console.log("Тело ответа:", text);
  if (!res.ok) throw new Error(`Ошибка загрузки проекта: ${res.status}`);
  return JSON.parse(text);
}

export interface MlImportCreateResponse {
  id: number;
  project_id: number;
  source_file_name: string;
  status: string;
}

export interface MlSimilarVariant {
  product_id?: number;
  id?: number;
  matched_id?: number | string;

  product_name?: string;
  name?: string;

  similarity?: number;
  similarity_percent?: number;
  supplier_name?: string | null;

  [key: string]: unknown;
}

// Статус наличия одного компонента комплекта — тот же набор значений,
// что и MlStatus в src/lib/stockStatus.ts, но backend всегда отдаёт для
// компонента ровно одно из этих двух ("Нет в системе" и т.п. компонентам
// не присваиваются: если товара-компонента вообще нет в системе, это
// ошибка подбора состава, а не статус наличия).
export interface KitComponentStatus {
  component_product_id: number;
  product_name: string;
  unit: string | null;
  quantity_per_kit: number;
  required_quantity: number;
  available_quantity: number;
  shortfall_quantity: number;
  ml_status: "На складе" | "Есть в системе (недостаточно)";
}

export interface MlImportItemResponse {
  id: number;

  input_product: string;
  input_quantity: number;

  ml_status: string;

  matched_product: string | null;
  matched_external_id: string | null;
  estimated_price: number | string | null;

  price_cost: number | string;
  price: number | string;
  total_amount: number | string;
  margin: number | string;

  available_quantity: number;

  unit: string | null;
  category: string | null;
  supplier_name: string | null;

  similarity_percent: number | string;

  similar_variants: MlSimilarVariant[];

  selected_product_id: number | null;
  final_quantity: number | null;

  user_comment: string | null;
  is_confirmed: boolean;

  created_at: string;
  updated_at: string | null;

  // Опциональные — старый backend их ещё не отдаёт. Отсутствие трактуется
  // на фронте как is_kit=false / kit_components=[] (см. ProjectPage.tsx),
  // чтобы UI не падал на более старом контракте.
  is_kit?: boolean;
  kit_components?: KitComponentStatus[];
  // Себестоимость комплекта, посчитанная backend'ом из компонентов —
  // подсказка ПМ рядом с полем "Себестоимость", когда он ставит 0
  // (0 = "считается из состава"). null, если backend не смог посчитать.
  kit_derived_unit_cost?: number | string | null;
}

// Поля комплекта на позиции проекта (ProjectItem/ProjectItemResponse) —
// backend проставляет их всем компонентам одного комплекта после confirm
// ML-импорта (см. explode комплекта на backend). Для обычных позиций и
// старых проектов все поля — null.
export interface ProjectItemKitFields {
  kit_group_key?: string | null;
  kit_product_id?: number | null;
  kit_name?: string | null;
  kit_quantity?: number | string | null;
  quantity_per_kit?: number | string | null;
  kit_unit_sale_price?: number | string | null;
  kit_unit_cost_price?: number | string | null;
}

export interface MlImportDetailResponse {
  id: number;
  project_id: number;

  source_file_name: string;
  status: string;

  created_by: number | null;
  created_at: string;

  confirmed_by: number | null;
  confirmed_at: string | null;

  items: MlImportItemResponse[];
}

export interface MlImportItemUpdate {
  selected_product_id?: number | null;
  final_quantity?: number | null;

  price?: number | null;
  price_cost?: number | null;
  estimated_price?: number | null;
  supplier_name?: string | null;

  user_comment?: string | null;
}

export interface MlImportItemCreateProduct {
  product_name: string;
  supplier_name: string;
  unit: string;
  price_cost: number;
  price: number;
  // Товар-комплект: состоит из набора других товаров каталога, которые ПМ
  // подбирает отдельно в кит-пикере после создания (см. getKitComponents /
  // confirmMlImport ниже). Опционально — по умолчанию backend должен
  // трактовать отсутствие поля как false.
  is_kit?: boolean;
}

// Отдельный от ML-импорта эндпоинт: создаёт товар сам по себе, не трогая
// никакую строку импорта (в отличие от createProductForMlImportItem,
// который привязан к конкретному item и переписывает его
// selected_product_id). Нужен, чтобы кит-пикер мог создать товар-компонент
// "на лету", не имея под рукой ml_import_item. Единственное обязательное
// поле — имя; остальное (поставщик/единица/себестоимость/цена) backend
// проставляет дефолтами.
export interface ProductCreate {
  product_name: string;
}

export interface ProductOut {
  id: number;
  name: string;
  description?: string | null;
  is_kit: boolean;
}

export async function createProduct(
  payload: ProductCreate,
): Promise<ProductOut> {
  try {
    const { data } = await api.post<ProductOut>("/products/", payload);
    return data;
  } catch (error) {
    throwWithDetail(error, "Не удалось создать товар");
  }
}

// Отмечая чекбоксами несколько товаров сразу в дропдауне «Совпавший
// товар», ПМ фактически говорит "эта строка — комплект из этих товаров".
// /products/resolve-kit по сырому названию строки (name) сам решает,
// переиспользовать ли уже существующий товар-комплект с таким именем
// (reused: true) или создать новый — при коллизии имени backend
// уникализирует его и возвращает reused: false с итоговым name, которое
// может отличаться от переданного.
export interface ResolveKitProductRequest {
  name: string;
}

export interface ResolveKitProductResponse {
  id: number;
  name: string;
  is_kit: boolean;
  reused: boolean;
}

export async function resolveKitProduct(
  payload: ResolveKitProductRequest,
): Promise<ResolveKitProductResponse> {
  try {
    const { data } = await api.post<ResolveKitProductResponse>(
      "/products/resolve-kit",
      payload,
    );
    return data;
  } catch (error) {
    throwWithDetail(error, "Не удалось создать комплект");
  }
}

// Состав комплекта, "запомненный" за товаром-комплектом с прошлого раза —
// backend отдаёт его, чтобы кит-пикер мог предзаполнить выбор, а ПМ мог его
// скорректировать перед подтверждением строки ML-импорта.
//
// ПРЕДПОЛОЖЕНИЕ (backend реализуется отдельно): GET /products/{id}/kit-components
// возвращает массив { component_product_id, default_quantity }. Если реальная
// форма ответа отличается, сузить типизацию и разбор в getKitComponents.
export interface KitComponentResponse {
  component_product_id: number;
  default_quantity: number;
}

export async function getKitComponents(
  productId: number,
): Promise<KitComponentResponse[]> {
  try {
    const { data } = await api.get<KitComponentResponse[]>(
      `/products/${productId}/kit-components`,
    );
    return data;
  } catch (error) {
    throwWithDetail(error, "Не удалось загрузить состав комплекта");
  }
}

// ПРЕДПОЛОЖЕНИЕ: PATCH /products/{id}/kit-flag принимает { is_kit } и
// возвращает обновлённый товар (используем только то, что реально нужно
// фронту — id и is_kit).
export async function updateProductKitFlag(
  productId: number,
  isKit: boolean,
): Promise<{ id: number; is_kit: boolean }> {
  try {
    const { data } = await api.patch<{ id: number; is_kit: boolean }>(
      `/products/${productId}/kit-flag`,
      { is_kit: isKit },
    );
    return data;
  } catch (error) {
    throwWithDetail(error, "Не удалось изменить признак комплекта");
  }
}

// Ручное добавление строки в черновик импорта. Обязательны только
// наименование и количество — остальное дозаполняется инлайн-полями
// таблицы, как у распарсенных строк.
export interface MlImportItemCreate {
  input_product: string;
  input_quantity: number;

  selected_product_id?: number | null;
  unit?: string | null;
  supplier_name?: string | null;
  price_cost?: number | null;
  price?: number | null;
  user_comment?: string | null;
}

export async function createMlImport(
  projectId: number,
  file: File,
): Promise<MlImportCreateResponse> {
  const formData = new FormData();

  formData.append("project_id", String(projectId));
  formData.append("file", file);

  const { data } = await api.post<MlImportCreateResponse>(
    "/ml-imports",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return data;
}

// Пустой черновик импорта для проекта, созданного вручную (кнопка
// «Пустой проект» на дашборде): файла не было, парсер не отрабатывал,
// поэтому ML-импорта не существует. Создаётся лениво — в момент, когда ПМ
// впервые жмёт «Добавить позицию» на странице проекта.
//
// Эндпоинт идемпотентный: если у проекта уже есть черновик импорта,
// backend возвращает его, а не создаёт второй (иначе открытие проекта в
// другом браузере, где localStorage пуст, плодило бы дубликаты).
export async function createEmptyMlImport(
  projectId: number,
): Promise<MlImportCreateResponse> {
  try {
    const { data } = await api.post<MlImportCreateResponse>(
      "/ml-imports/empty",
      { project_id: projectId },
    );

    return data;
  } catch (error) {
    throwWithDetail(error, "Не удалось создать черновик импорта");
  }
}

export async function getMlImport(
  importId: number,
): Promise<MlImportDetailResponse> {
  const { data } = await api.get<MlImportDetailResponse>(
    `/ml-imports/${importId}`,
  );

  return data;
}

export async function updateMlImportItem(
  importId: number,
  itemId: number,
  payload: MlImportItemUpdate,
): Promise<MlImportItemResponse> {
  const { data } = await api.patch<MlImportItemResponse>(
    `/ml-imports/${importId}/items/${itemId}`,
    payload,
  );

  return data;
}

// Заменяет весь черновой состав комплекта для конкретной строки ML-импорта
// (пустой массив — очищает состав). В ответе backend сразу пересчитывает
// available_quantity/ml_status/kit_components строки по актуальным
// остаткам, поэтому дальше просто заменяем строку в mlImport.items тем,
// что вернул этот запрос — отдельно ничего пересчитывать не нужно.
export async function saveMlImportKitComponents(
  importId: number,
  itemId: number,
  components: { component_product_id: number; quantity: number }[],
): Promise<MlImportItemResponse> {
  try {
    const { data } = await api.put<MlImportItemResponse>(
      `/ml-imports/${importId}/items/${itemId}/kit-components`,
      { components },
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      const detail = error.response?.data?.detail;
      throw new Error(
        typeof detail === "string" && detail.trim()
          ? detail
          : "Импорт больше нельзя редактировать — он уже подтверждён",
      );
    }
    throwWithDetail(error, "Не удалось сохранить состав комплекта");
  }
}

export interface ProductAvailability {
  product_id: number;
  available_quantity: number;
}

// Живые остатки по товарам (без разбивки по складам, в отличие от
// fetchWarehouseStocks) — используется кит-пикером, чтобы показать
// реальный статус наличия компонента вместо ml_status из каталога
// товаров, которого там фактически нет. Id, отсутствующие в ответе,
// трактуются на фронте как остаток 0 (см. контракт эндпоинта).
export async function fetchProductsAvailability(
  productIds: number[],
): Promise<ProductAvailability[]> {
  if (productIds.length === 0) return [];
  try {
    const { data } = await api.post<{ items: ProductAvailability[] }>(
      "/products/availability",
      { product_ids: productIds },
    );
    return data.items ?? [];
  } catch (error) {
    throwWithDetail(error, "Не удалось получить остатки по товарам");
  }
}

// Backend отдаёт понятную человеку причину в detail (строкой). Без этой
// распаковки пользователь видел бы "Request failed with status code 409".
function throwWithDetail(error: unknown, fallback: string): never {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) {
      throw new Error(detail);
    }
  }

  if (error instanceof Error) throw error;

  throw new Error(fallback);
}

export async function createProductForMlImportItem(
  importId: number,
  itemId: number,
  payload: MlImportItemCreateProduct,
): Promise<MlImportItemResponse> {
  try {
    const { data } = await api.post<MlImportItemResponse>(
      `/ml-imports/${importId}/items/${itemId}/create-product`,
      payload,
    );

    return data;
  } catch (error) {
    throwWithDetail(error, "Не удалось создать товар");
  }
}

export async function createMlImportItem(
  importId: number,
  payload: MlImportItemCreate,
): Promise<MlImportItemResponse> {
  try {
    const { data } = await api.post<MlImportItemResponse>(
      `/ml-imports/${importId}/items`,
      payload,
    );

    return data;
  } catch (error) {
    throwWithDetail(error, "Не удалось добавить позицию");
  }
}

export async function deleteMlImportItem(
  importId: number,
  itemId: number,
): Promise<void> {
  try {
    await api.delete(`/ml-imports/${importId}/items/${itemId}`);
  } catch (error) {
    throwWithDetail(error, "Не удалось удалить позицию");
  }
}

// Состав комплекта, выбранный ПМ для конкретной строки ML-импорта (строка
// привязана к товару-комплекту через selected_product_id, а этот массив —
// то, из чего комплект фактически собран в этом заказе).
//
// ПОДТВЕРЖДЕНО backend'ом: ключ строки — item_id (не ml_import_item_id, как
// предполагалось изначально).
export interface ConfirmMlImportKitSelection {
  item_id: number;
  components: { component_product_id: number; quantity: number }[];
}

// ПОДТВЕРЖДЕНО backend'ом: confirm_ml_import ожидает kit_selections с ровно
// одной записью на КАЖДУЮ строку черновика, у которой selected_product_id
// указывает на товар с is_kit=true — backend не подставляет состав
// комплекта по умолчанию сам и отвечает 400, если строка-комплект осталась
// без записи. Поэтому ProjectPage.tsx обязан прислать запись для каждой
// такой строки, даже если ПМ не трогал кит-пикер и строка осталась на
// предзаполненном по умолчанию составе (см. buildKitSelectionsPayload).
export interface ConfirmMlImportPayload {
  kit_selections?: ConfirmMlImportKitSelection[];
}

export async function confirmMlImport(
  importId: number,
  payload?: ConfirmMlImportPayload,
): Promise<MlImportCreateResponse> {
  const { data } = await api.post<MlImportCreateResponse>(
    `/ml-imports/${importId}/confirm`,
    payload ?? {},
  );

  return data;
}

// ==========================================
// ПАРСИНГ ЧЕРЕЗ ОЧЕРЕДЬ (RabbitMQ + Celery) — не блокирует UI. Ответ на
// startParseJob приходит мгновенно (job поставлена в очередь), дальнейший
// прогресс отслеживается через getParseJobStatus (polling), чтобы
// пользователь мог закрыть модалку и заниматься другими вещами, пока файл
// обрабатывается в фоне воркером.
// ==========================================

export interface StartParseJobResponse {
  job_id: string;
  status: "pending";
}

export async function startParseJob(
  projectId: number,
  file: File,
): Promise<StartParseJobResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await api.post<StartParseJobResponse>(
    `/parser/projects/${projectId}/parse`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );

  return data;
}

/**
 * Экспресс-поток: загрузка подписанного договора.
 *
 * Отличается от startParseJob не только адресом: договор разбирает отдельный
 * парсер, который достаёт из Приложения №1 зафиксированную цену продажи,
 * поэтому позиции приходят с уже заполненными ценами. Промежуточный Excel не
 * создаётся, так что у такой задачи нет result_path и скачать результат
 * файлом (downloadParseResult) нельзя.
 *
 * Принимаются только .pdf и .docx — .xlsx среди подписанных договоров
 * не встречается.
 */
export async function startContractParseJob(
  projectId: number,
  file: File,
): Promise<StartParseJobResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await api.post<StartParseJobResponse>(
    `/parser/projects/${projectId}/parse-contract`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );

  return data;
}

export type ParseJobStatusValue = "pending" | "processing" | "done" | "failed";

export interface ParseJobStatusResponse {
  job_id: string;
  status: ParseJobStatusValue;
  original_filename: string;
  error_message: string | null;
  ml_import_id: number | null;
  project_id: number;
}

export async function getParseJobStatus(
  jobId: string,
): Promise<ParseJobStatusResponse> {
  const { data } = await api.get<ParseJobStatusResponse>(`/parser/jobs/${jobId}`);
  return data;
}

// ==========================================
// СКЛАДЫ (справочник)
// ==========================================

export interface WarehouseInfo {
  id: number;
  name: string; // "Карабулак", "Абишова"
  code: string; // "Кар", "Аб"
}

export const fetchWarehouseList = async (): Promise<WarehouseInfo[]> => {
  const { data } = await api.get<WarehouseInfo[]>("/warehouse/list");
  return data;
};

// ==========================================
// ОСТАТКИ (с разбивкой по складам)
// ==========================================

export interface WarehouseStockDetail {
  warehouse_id: number;
  warehouse_name: string;
  actual_quantity: number;
  reserved_quantity: number;
  defective_quantity: number;
  available_quantity: number;
}

export interface WarehouseStockResponse {
  id: number;
  product_id: number;
  category: string;
  name: string;
  unit: string;
  supplier_name?: string | null;
  actual_quantity: number;
  reserved_quantity: number;
  defective_quantity: number;
  stocks: WarehouseStockDetail[];
}

export const fetchWarehouseStocks = async (): Promise<WarehouseStockResponse[]> => {
  const { data } = await api.get<WarehouseStockResponse[]>("/warehouse/stocks");
  return data;
};

export interface WarehouseIncomeItem {
  product_id: number;
  quantity: number;
  warehouse_id: number; // обязательно: на какой склад приходуем
  supplier_id?: number;
}

export interface WarehouseIncomeInput {
  items: WarehouseIncomeItem[];
  supplier_id?: number;
}

export const postWarehouseIncome = async (payload: WarehouseIncomeInput) => {
  const { data } = await api.post("/warehouse/income", payload);
  return data;
};

export const reserveProjectItems = async (projectId: number, warehouseId: number = 1) => {
  const { data } = await api.post(
    `/warehouse/projects/${projectId}/reserve?warehouse_id=${warehouseId}`
  );
  return data;
};

export const shipProjectItems = async (projectId: number, warehouseId: number = 1) => {
  const { data } = await api.post(
    `/warehouse/projects/${projectId}/ship?warehouse_id=${warehouseId}`
  );
  return data;
};

// ==========================================
// WORKFLOW (Согласование Комдиром)
// ==========================================

export interface WorkflowResponse {
  message: string;
  project_id: number;
  status: string;
  reason?: string | null;
  document_id?: number;
  document_status?: string;
  archive_status?: "saved";
}

export async function sendProjectToDirector(projectId: number): Promise<WorkflowResponse> {
  const { data } = await api.post<WorkflowResponse>(
    `/projects/${projectId}/send-to-director`
  );
  return data;
}

export async function startProjectEditing(projectId: number): Promise<WorkflowResponse> {
  const { data } = await api.post<WorkflowResponse>(
    `/projects/${projectId}/start-editing`
  );
  return data;
}

export async function approveProjectDirector(projectId: number): Promise<WorkflowResponse> {
  const { data } = await api.post<WorkflowResponse>(
    `/projects/${projectId}/approve`
  );
  return data;
}

export async function rejectProjectDirector(projectId: number, reason?: string): Promise<WorkflowResponse> {
  const { data } = await api.post<WorkflowResponse>(
    `/projects/${projectId}/reject`,
    { reason: reason || null }
  );
  return data;
}

// ==========================================
// DOCUMENT REVIEW WORKFLOW (страница "Документы": Бухгалтер -> Директор)
// ==========================================

export type DocReviewStage =
  | "none"
  | "pending_director"
  | "approved"
  | "rejected";

export type DocRejector = "accountant" | "commercial_director";

export interface DocumentReviewResponse {
  message?: string;
  project_id: number;
  stage: DocReviewStage;
  rejected_by: DocRejector | null;
  reject_reason: string | null;
  submitted_by: number | null;
  submitted_at: string | null;
  accountant_decided_by: number | null;
  accountant_decided_at: string | null;
  director_decided_by: number | null;
  director_decided_at: string | null;
  updated_at: string | null;
}

// PM: отправить / заново отправить документы на проверку.
export async function submitDocumentsForReview(
  projectId: number | string,
): Promise<DocumentReviewResponse> {
  const { data } = await api.post<DocumentReviewResponse>(
    `/projects/${projectId}/documents/submit-for-review`,
  );
  return data;
}

// Директор: принять (финальное согласование).
export async function directorApproveDocuments(
  projectId: number | string,
): Promise<DocumentReviewResponse> {
  const { data } = await api.post<DocumentReviewResponse>(
    `/projects/${projectId}/documents/director-approve`,
  );
  return data;
}

// Директор: отклонить (с необязательным комментарием).
export async function directorRejectDocuments(
  projectId: number | string,
  reason?: string,
): Promise<DocumentReviewResponse> {
  const { data } = await api.post<DocumentReviewResponse>(
    `/projects/${projectId}/documents/director-reject`,
    { reason: reason || null },
  );
  return data;
}

// Текущий статус согласования (для опроса вместо локальной симуляции).
export async function fetchDocumentsReviewStatus(
  projectId: number | string,
): Promise<DocumentReviewResponse> {
  const { data } = await api.get<DocumentReviewResponse>(
    `/projects/${projectId}/documents/review-status`,
  );
  return data;
}

// ==========================================
// CLIENT DECISION (Одобрение КП / Правки от клиента)
// ==========================================

export async function approveProjectClient(projectId: number): Promise<WorkflowResponse> {
  const { data } = await api.post<WorkflowResponse>(
    `/projects/${projectId}/client-approve`
  );
  return data;
}

export async function rejectProjectClient(projectId: number): Promise<WorkflowResponse> {
  const { data } = await api.post<WorkflowResponse>(
    `/projects/${projectId}/client-reject`
  );
  return data;
}

// ==========================================
// PROJECT DOCUMENTS ARCHIVE
// ==========================================

export interface ProjectDocumentResponse {
  id: number;
  project_id: number;
  name: string;
  category: string;
  status: string;
  file_name: string;
  mime_type: string;
  created_at: string;
  download_url: string;
}

export async function fetchProjectDocuments(
  projectId: number | string,
): Promise<ProjectDocumentResponse[]> {
  const { data } = await api.get<ProjectDocumentResponse[]>(
    `/documents/project/${projectId}`,
  );
  return data;
}
export async function uploadProjectDocument(
  projectId: string | number,
  category: "contract" | "invoice" | "power_of_attorney",
  file: File,
  name?: string,
): Promise<ProjectDocumentResponse> {
  const formData = new FormData();

  formData.append("project_id", String(projectId));
  formData.append("category", category);
  formData.append("file", file);

  if (name) {
    formData.append("name", name);
  }

  const { data } = await api.post<ProjectDocumentResponse>(
    "/documents/upload",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return data;
}

export async function downloadProjectDocument(
  projectDocument: ProjectDocumentResponse,
): Promise<void> {
  const { data } = await api.get<Blob>(
    `/documents/${projectDocument.id}/download`,
    { responseType: "blob" },
  );

  const blob = new Blob([data], {
    type: projectDocument.mime_type || "application/octet-stream",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = projectDocument.file_name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// ==========================================
// EXPORT EXCEL & GENERATE WORD KP
// ==========================================

export const downloadProjectExcel = async (projectId: number): Promise<void> => {
  const response = await api.get(`/projects/${projectId}/export`, {
    responseType: 'blob',
  });

  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const url = window.URL.createObjectURL(blob);

  let filename = `Утверждено_Проект_${projectId}.xlsx`;
  const disposition = response.headers['content-disposition'];
  if (disposition && disposition.includes("filename*=UTF-8''")) {
    filename = decodeURIComponent(disposition.split("filename*=UTF-8''")[1]);
  }

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();

  link.remove();
  window.URL.revokeObjectURL(url);
};

// Функция выгрузки сгенерированного Word КП
export const downloadKpDocument = async (projectId: number): Promise<void> => {
  const response = await api.get(`/projects/${projectId}/generate-kp`, {
    responseType: 'blob',
  });

  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  const url = window.URL.createObjectURL(blob);

  let filename = `KP_Project_${projectId}.docx`;
  const disposition = response.headers['content-disposition'];
  if (disposition && disposition.includes("filename*=UTF-8''")) {
    filename = decodeURIComponent(disposition.split("filename*=UTF-8''")[1]);
  } else if (disposition && disposition.includes("filename=")) {
    const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
    if (matches && matches[1]) {
      filename = matches[1].replace(/['"]/g, "");
    }
  }

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();

  link.remove();
  window.URL.revokeObjectURL(url);
};
export interface ProductInfo {
  id: number;
  name: string;
  unit: string | null;
  cost_price: number | string | null;
  current_stock?: number | string | null;
  external_id?: string | null;
}

export interface StatusInfo {
  id: number;
  status_name: string;
}

export interface SupplierInfo {
  id: number;
  supplier_name: string;
}

export interface ProjectItemResponse extends ProjectItemKitFields {
  id: number;
  required_quantity: number | null;
  cost_price: number | string;
  sale_price: number | string;
  total_sum: number | string;
  estimated_price: number | string | null;
  estimated_total: number | string | null;
  matched_external_id?: string | null;
  supplier_raw_name: string | null;

  product: ProductInfo;
  status: StatusInfo | null;
  supplier: SupplierInfo | null;
}
export async function fetchProjectItems(
  projectId: number,
): Promise<ProjectItemResponse[]> {
  const { data } = await api.get<ProjectItemResponse[]>(
    `/project-items/${projectId}`,
  );

  return data;
}

// ==========================================
// ПОСТАВЩИКИ (справочник + смена поставщика позиции в Закупках)
// ==========================================

export interface SupplierListItem {
  id: number;
  supplier_name: string;
}

export const fetchSuppliers = async (query?: string): Promise<SupplierListItem[]> => {
  const { data } = await api.get<SupplierListItem[]>("/suppliers", {
    params: query ? { query } : undefined,
  });
  return data;
};

export interface UpdateProjectItemSupplierPayload {
  supplier_id?: number | null;
  supplier_name?: string | null;
}

export async function updateProjectItemSupplier(
  projectId: number | string,
  itemId: number,
  payload: UpdateProjectItemSupplierPayload,
): Promise<ProjectItemResponse> {
  try {
    const { data } = await api.patch<ProjectItemResponse>(
      `/project-items/${projectId}/${itemId}/supplier`,
      payload,
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const detail = error.response?.data?.detail;
      if (typeof detail === "string" && detail.trim()) {
        throw new Error(detail);
      }
    }
    throw error;
  }
}

export interface PatchKitGroupPricesPayload {
  sale_price?: number;
  cost_price?: number;
}

// Комдир правит цену/себестоимость комплекта ЦЕЛИКОМ (не по отдельному
// компоненту) — backend сам перераспределяет их по компонентам. Форма
// ответа не гарантирована, поэтому после успеха всегда перечитываем позиции
// проекта заново (см. вызовы fetchProjectItems в ProjectPage.tsx), а не
// полагаемся на тело этого ответа.
export async function patchKitGroupPrices(
  projectId: number | string,
  kitGroupKey: string,
  payload: PatchKitGroupPricesPayload,
): Promise<void> {
  try {
    await api.patch(
      `/projects/${projectId}/kit-groups/${encodeURIComponent(kitGroupKey)}/prices`,
      payload,
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const detail = error.response?.data?.detail;
      if (typeof detail === "string" && detail.trim()) {
        throw new Error(detail);
      }
    }
    throw error;
  }
}

// ==========================================
// DASHBOARD WIDGETS
// ==========================================

export interface UpcomingDeadline {
  project_id: number;
  name: string;
  deadline: string;
  days_left: number;
}

export const fetchUpcomingDeadlines = async (limit: number = 3): Promise<UpcomingDeadline[]> => {
  const { data } = await api.get<UpcomingDeadline[]>(`/dashboard/upcoming-deadlines?limit=${limit}`);
  return data;
};

export interface RecentActivity {
  text: string;
  time: string;
}

export const fetchRecentActivity = async (limit: number = 5): Promise<RecentActivity[]> => {
  const { data } = await api.get<RecentActivity[]>(`/dashboard/recent-activity?limit=${limit}`);
  return data;
};
export const signProjectContract = async (projectId: number) => {
  const { data } = await api.post<WorkflowResponse>(
    `/project-workflow/${projectId}/sign-contract`,
  );

  return data;
};

export interface WarehouseReceiptResponse {
  id: number;
  receipt_number?: string;
  project_id?: number;
  project_name?: string;
  date: string;
  supplier_id: number;
  product_id: number;
  warehouse_id?: number | null;
  quantity: number;
  status: string;
  actual_quantity?: number | null;
  photo_path?: string | null;
  warehouse_comment?: string | null;
  confirmed_at?: string | null;
  defective_quantity?: number;      // добавить, если нет
  defect_resolved?: boolean;        // добавить, если нет
  supplier?: {
    id: number;
    supplier_name: string;
    name?: string;
  };
  product?: {
    id: number;
    name: string;
    unit: string;
  };
  warehouse?: {
    id: number;
    name: string;
    code?: string | null;
  } | null;
}

export async function fetchWarehouseReceipts(): Promise<WarehouseReceiptResponse[]> {
  const { data } = await api.get<WarehouseReceiptResponse[]>("/warehouse/receipts");
  return data;
}

// ==========================================
// ОТМЕНА ПРИХОДА (чекбокс, для роли "warehouse")
// ==========================================

export async function setReceiptCancelled(
  receiptId: number,
  isCancelled: boolean
): Promise<WarehouseReceiptResponse> {
  const { data } = await api.patch<WarehouseReceiptResponse>(
    `/warehouse/receipts/${receiptId}/cancel`,
    { is_cancelled: isCancelled }
  );
  return data;
}

// ==========================================
// ПОДТВЕРЖДЕНИЕ ПРИХОДА (фото + факт. количество + комментарий)
// ==========================================

export interface ConfirmReceiptPayload {
  actual_quantity: number;
  defective_quantity?: number;
  comment?: string;
  photo?: File | null;
}

export async function confirmReceipt(
  receiptId: number,
  payload: ConfirmReceiptPayload
): Promise<WarehouseReceiptResponse> {
  const formData = new FormData();
  formData.append("actual_quantity", String(payload.actual_quantity));

  if (payload.defective_quantity !== undefined) {
    formData.append("defective_quantity", String(payload.defective_quantity));
  } else {
    formData.append("defective_quantity", "0");
  }

  formData.append("comment", payload.comment || "");
  if (payload.photo) formData.append("photo", payload.photo);

  const { data } = await api.post<WarehouseReceiptResponse>(
    `/warehouse/receipts/${receiptId}/confirm`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );
  return data;
}


// ==========================================
// РЕДАКТИРОВАНИЕ ФОТО/КОММЕНТАРИЯ УЖЕ ПОДТВЕРЖДЁННОГО ПРИХОДА
// (количество и остаток на складе этим не трогаются — только эти два поля)
// ==========================================

export interface UpdateReceiptDetailsPayload {
  comment?: string;
  photo?: File | null;
}

export async function updateReceiptDetails(
  receiptId: number,
  payload: UpdateReceiptDetailsPayload
): Promise<WarehouseReceiptResponse> {
  const formData = new FormData();
  if (payload.comment !== undefined) formData.append("comment", payload.comment);
  if (payload.photo) formData.append("photo", payload.photo);

  const { data } = await api.patch<WarehouseReceiptResponse>(
    `/warehouse/receipts/${receiptId}/details`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );
  return data;
}

// ==========================================
// ОТГРУЗКИ (для вкладки "Отгрузка")
// ==========================================

export interface ShipmentResponse {
  id: number;
  project_id: number;
  date: string;
  project_name: string;
  items_count: number;
  status: string;
}

export interface ShipmentPendingWarehouseOption {
  warehouse_id: number;
  warehouse_name: string;
}

export interface ShipmentPendingItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit: string;
  available_warehouses: ShipmentPendingWarehouseOption[];
}

export interface ShipmentPendingProject {
  project_id: number;
  project_name: string;
  items: ShipmentPendingItem[];
}

export const fetchPendingShipments = async (): Promise<ShipmentPendingProject[]> => {
  const { data } = await api.get<ShipmentPendingProject[]>("/warehouse/shipments/pending");
  return data;
};

export interface ShipItemWarehouseChoice {
  item_id: number;
  warehouse_id: number;
}

export const shipProjectItemsPerWarehouse = async (
  projectId: number,
  items: ShipItemWarehouseChoice[],
) => {
  const { data } = await api.post(
    `/warehouse/projects/${projectId}/ship-items`,
    { items },
  );
  return data;
};

export const fetchWarehouseShipments = async (): Promise<ShipmentResponse[]> => {
  const { data } = await api.get<ShipmentResponse[]>("/warehouse/shipments");
  return data;
};

// ==========================================
// ЧЕК-ЛИСТ НА ОТГРУЗКУ (docx-таблица) — печатается ДО фактической
// отгрузки, по позициям проекта, готовым к отгрузке (STATUS_RESERVED).
// ==========================================

export const downloadShipmentChecklist = async (projectId: number): Promise<void> => {
  const response = await api.get(`/warehouse/shipments/${projectId}/document`, {
    responseType: "blob",
  });

  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  let filename = `Список_на_отгрузку_проект_${projectId}.docx`;
  const disposition = response.headers["content-disposition"];
  if (disposition && disposition.includes("filename*=UTF-8''")) {
    filename = decodeURIComponent(disposition.split("filename*=UTF-8''")[1]);
  }

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// ==========================================
// ФОТО ОТГРУЗКИ — прикладывается кладовщиком по КАЖДОЙ отгружаемой позиции
// (частичная отгрузка: фото на позицию, не на весь проект). itemId
// необязателен для обратной совместимости со старыми вызовами
// (фото на весь проект целиком, project_item_id останется NULL).
// ==========================================

export interface ShipmentPhotoResponse {
  id: number;
  project_id: number;
  project_item_id?: number | null;
  photo_path: string;
  comment: string | null;
  created_at: string;
}

export async function uploadShipmentPhoto(
  projectId: number,
  photo: File,
  itemId?: number,
  comment?: string,
): Promise<ShipmentPhotoResponse> {
  const formData = new FormData();
  formData.append("photo", photo);
  if (itemId !== undefined) formData.append("item_id", String(itemId));
  if (comment) formData.append("comment", comment);

  const { data } = await api.post<ShipmentPhotoResponse>(
    `/warehouse/shipments/${projectId}/photo`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

export async function deleteProjectDocument(
  documentId: number
): Promise<void> {
  const { data } = await api.delete(
    `/documents/${documentId}`
  );
  return data;
}

export async function completeProjectOnBackend(projectId: string | number): Promise<void> {
  await api.post(`/projects/${projectId}/complete`);
}


// ==========================================
// ДОГОВОР: ГЕНЕРАЦИЯ (только бухгалтер)
// ==========================================
export interface ContractGenerateRequest {
  project_id: number;
  contract_number: string;
  contract_date?: string;
  contract_valid_until?: string;
  buyer_company_name: string;
  buyer_director_name: string;
  buyer_address: string;
  buyer_bin: string;
  buyer_iik: string;
  buyer_bik: string;
  buyer_kbe?: string;
  specification_number?: string;
  delivery_term_days?: number;
  shipment_method?: "pickup" | "delivery";
  pickup_address?: string;
}

const FIELD_LABELS: Record<string, string> = {
  contract_number: "Номер договора",
  buyer_company_name: "Название компании",
  buyer_director_name: "ФИО директора",
  buyer_address: "Адрес",
  buyer_bin: "БИН",
  buyer_iik: "ИИК",
  buyer_bik: "БИК",
  contract_date: "Дата подписания",
  contract_valid_until: "Действует до",
  project_id: "Проект",
};

function friendlyErrorFromDetail(detail: unknown): string | null {
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const fieldNames = detail
      .map((item) => {
        const loc = item?.loc;
        const fieldKey = Array.isArray(loc) ? loc[loc.length - 1] : undefined;
        return (fieldKey && FIELD_LABELS[fieldKey]) || fieldKey;
      })
      .filter(Boolean);

    return fieldNames.length > 0
      ? `Заполните все обязательные поля: ${[...new Set(fieldNames)].join(", ")}`
      : "Заполните все обязательные поля корректно";
  }

  return null;
}

export const generateContract = async (
  payload: ContractGenerateRequest,
): Promise<void> => {
  let response;

  try {
    response = await api.post("/contracts/generate", payload, {
      responseType: "blob",
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
      const errorBlob = error.response.data;
      let friendly: string | null = null;
      try {
        const text = await errorBlob.text();
        const parsed = JSON.parse(text);
        friendly = friendlyErrorFromDetail(parsed?.detail);
      } catch {
        // wasn't JSON / no detail field
      }
      if (friendly) throw new Error(friendly);
    }
    throw error instanceof Error ? error : new Error("Не удалось сгенерировать договор");
  }

  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  let filename = `Договор_${payload.contract_number}.docx`;
  const disposition = response.headers["content-disposition"];
  if (disposition && disposition.includes("filename*=UTF-8''")) {
    filename = decodeURIComponent(disposition.split("filename*=UTF-8''")[1]);
  }

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const markContractUploaded = async (
  projectId: string | number,
): Promise<void> => {
  await api.post(`/projects/${projectId}/contract-uploaded`);
};

export async function resolveDefectReplacement(
  receiptId: number
): Promise<WarehouseReceiptResponse> {
  const { data } = await api.post<WarehouseReceiptResponse>(
    `/warehouse/receipts/${receiptId}/resolve-defect`
  );
  return data;
}

// ==========================================
// ЗАМЕТКИ — приватные, видны только автору. Прикрепление к проекту/товару
// необязательно: можно просто написать текст, без выбора сущности.
// ==========================================

export type NoteEntityType = "project" | "product";

export interface NoteDTO {
  id: string;
  content: string;
  entity_type: NoteEntityType | null;
  entity_id: number | null;
  created_at: string;
}

// Без параметров -> все заметки пользователя (прикреплённые и нет).
// С обоими параметрами -> заметки только по конкретному проекту/товару.
export async function fetchNotes(
  entityType?: NoteEntityType,
  entityId?: number,
): Promise<NoteDTO[]> {
  const { data } = await api.get<NoteDTO[]>("/notes/", {
    params:
      entityType !== undefined && entityId !== undefined
        ? { entity_type: entityType, entity_id: entityId }
        : undefined,
  });
  return data;
}

export async function createNote(
  content: string,
  entityType?: NoteEntityType,
  entityId?: number,
): Promise<NoteDTO> {
  const { data } = await api.post<NoteDTO>("/notes/", {
    content,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
  });
  return data;
}

export async function deleteNote(noteId: string): Promise<void> {
  await api.delete(`/notes/${noteId}`);
}

// ==========================================
// СПИСОК ТОВАРОВ для прикрепления заметки к товару.
// Реальный роутер (app/api/v1/routers/products.py) отдаёт GET /products/
// весь список целиком, без поиска на бэкенде — фильтруем на фронте, как
// и со списком проектов.
// ==========================================

export async function fetchProducts(): Promise<ProductInfo[]> {
  const { data } = await api.get<ProductInfo[]>("/products/");
  return data;
}