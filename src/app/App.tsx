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
import { getMe, logout } from "../api/user";
// ─── Root ──────────────────────────────────────────────────
type UserData = {
    id: number;
    name: string;
    email: string;
    role: string;
    created_at: string;
};

// Ключ и хелпер для сохранения состояния приложения в localStorage,
// чтобы F5 не сбрасывал пользователя на главный экран
const LS_KEY = "kerneu:app-state";

function loadPersistedState() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        console.error("Не удалось прочитать сохранённое состояние:", err);
        return null;
    }
}

const persisted = loadPersistedState();

export default function App() {
    const [loggedIn, setLoggedIn] = useState(persisted?.loggedIn ?? false);
    const [role, setRole] = useState<Role>(persisted?.role ?? "pm");
    const [page, setPage] = useState<Page>(persisted?.page ?? "dashboard");
    const [projectState, setProjectState] = useState<ProjectState>(persisted?.projectState ?? {
        kpSent: false,
        kpApproved: false,
        contractGenerated: false,
        contractSigned: false,
    });
    const [selectedProjectId, setSelectedProjectId] = useState<number | string | null>(persisted?.selectedProjectId ?? null);

    const [receipts, setReceipts] = useState<ReceiptType[]>([]);

    const [user, setUser] = useState<UserData | null>(null);

    // Сохраняем ключевое состояние при каждом изменении —
    // именно это восстанавливает экран после F5
    useEffect(() => {
        localStorage.setItem(LS_KEY, JSON.stringify({
            loggedIn,
            role,
            page,
            projectState,
            selectedProjectId,
        }));
    }, [loggedIn, role, page, projectState, selectedProjectId]);

    useEffect(() => {
        const loadUser = async () => {
            try {
                const me = await getMe();
                setUser(me);
            } catch (err) {
                console.error(err);
                // Сессия невалидна/истекла на сервере — выкидываем на логин,
                // а не оставляем "залогиненное" состояние без данных пользователя
                setLoggedIn(false);
            }
        };

        if (loggedIn) {
            loadUser();
        }
    }, [loggedIn]);

    const handleLogout = async () => {
        try {
            await logout();

            setUser(null);
            setLoggedIn(false);
            setPage("dashboard");
            localStorage.removeItem(LS_KEY);
        } catch (err) {
            console.error(err);
        }
    };

    if (!loggedIn) {
        return (
            <LoginPage
                onLogin={(r) => {
                    setRole(r);
                    setLoggedIn(true);
                    
                    // Route users to their allowed default page
                    if (r === "warehouse") {
                        setPage("warehouse");
                    } else if (r === "accountant") {
                        setPage("contract");
                    } else {
                        setPage("dashboard"); // For pm and commercial_director
                    }
                }}
            />
        );
    }

    return (
        <AppShell
            role={role}
            page={page}
            onPage={setPage}
            user={user}
            onLogout={handleLogout}
            projectState={projectState}
            selectedProjectId={selectedProjectId}
            setSelectedProjectId={setSelectedProjectId}
            setProjectState={setProjectState}
            receipts={receipts}
            setReceipts={setReceipts}
        />
    );
}