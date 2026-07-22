import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard, FolderOpen, FileText, ShoppingCart,
  Package, CheckSquare, LogOut, AlertTriangle, Check, X,
  Upload, Download, Search, Plus, TrendingUp, TrendingDown,
  Bell, User, ChevronDown, ArrowRight, Clock, MoreHorizontal,
  Send, Truck, DollarSign, CheckCircle2, XCircle,
  ChevronRight, Edit3, Layers, ClipboardList,
  BarChart2, Inbox, Archive,
  Eye, EyeOff, Loader2, AlertCircle, Lock, Filter, Trash2,
  FileCheck, RefreshCw, Receipt
} from "lucide-react";
import { UploadCenter } from "./components/screens/UploadCenter";


import type { Role, Page, ContractStatus, KPItemStatus, ProjectState, KPItem } from "../types";
import designImg from "../assets/design-illustration.jpg";
import kLogoImg from "../../../assets/k-logo.png";
import { ROLES, ROLE_EMAILS } from "../data/roles";
import { ACTIVE_PROJECT, PROJECTS } from "../data/projects";
import type { ProjectRow } from "../data/projects";
import { INVOICES_INIT } from "../data/invoices";
import type { Invoice } from "../data/invoices";
import { STOCK_INIT, ARRIVALS, SHIPMENTS } from "../data/stock";
import type { StockItem } from "../data/stock";
import { KP_ITEMS_INIT } from "../data/kpItems";
import { UPLOAD_NOTIFICATIONS } from "../data/notifications";
import { fmt, daysFromNow, deadlineBadge, getNavAvail } from "../lib/format";
import { Tooltip } from "recharts";
import { Tooltip as AppTooltip } from "./components/common/Tooltip";
import { InfoBanner } from "./components/common/InfoBanner";
import { Chip } from "./components/common/Chip";
import { StatCard } from "./components/common/StatCard";
import { SectionHeader } from "./components/common/SectionHeader";
import { PageWrap } from "./components/common/PageWrap";
import { KerneuLogo, KerneuFullLogo } from "./components/common/KerneuLogo";
import { ReceiptStatusBadge } from "./components/common/ReceiptStatusBadge";
import type { ReceiptStatus } from "../types";
import { InvoiceDetailModal } from "./components/modals/InvoiceDetailModal";
import { ShipmentModal } from "./components/modals/ShipmentModal";
import { ProjectHeader } from "./components/layout/ProjectHeader";
import { TopBar } from "./components/layout/TopBar";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "../pages/LoginPage";
import type { Receipt as ReceiptType } from "../types";

// ─── LocalStorage keys ─────────────────────────────────────
const LS_LOGGED_IN = "kerneu_loggedIn";
const LS_ROLE = "kerneu_role";
const LS_PAGE = "kerneu_page";

// ─── Root ──────────────────────────────────────────────────
export default function App() {
  const [loggedIn, setLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem(LS_LOGGED_IN) === "true";
  });
  const [role, setRole] = useState<Role>(() => {
    return (localStorage.getItem(LS_ROLE) as Role) || "pm";
  });
  const [page, setPage] = useState<Page>(() => {
    return (localStorage.getItem(LS_PAGE) as Page) || "dashboard";
  });
  const [projectState, setProjectState] = useState<ProjectState>({
    kpSent: false, kpApproved: false, contractGenerated: false, contractSigned: false,
  });
  const [receipts, setReceipts] = useState<ReceiptType[]>([]);

  // Сохраняем состояние логина при каждом изменении
  useEffect(() => {
    localStorage.setItem(LS_LOGGED_IN, String(loggedIn));
  }, [loggedIn]);

  // Сохраняем роль при каждом изменении
  useEffect(() => {
    localStorage.setItem(LS_ROLE, role);
  }, [role]);

  // Сохраняем текущую страницу при каждом изменении
  useEffect(() => {
    localStorage.setItem(LS_PAGE, page);
  }, [page]);

  if (!loggedIn) {
    return <LoginPage onLogin={r => { setRole(r); setLoggedIn(true); }} />;
  }

  return (
    <AppShell role={role} page={page} onPage={setPage}
      onLogout={() => {
        setLoggedIn(false);
        setPage("dashboard");
        localStorage.removeItem(LS_LOGGED_IN);
        localStorage.removeItem(LS_PAGE);
      }}
      projectState={projectState} setProjectState={setProjectState}
      receipts={receipts} setReceipts={setReceipts} />
  );
}