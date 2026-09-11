import { useState, useEffect, useMemo, useCallback } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  LineChart, Briefcase, ClipboardList, History, Landmark,
  Plus, Trash2, RotateCcw, Loader2, AlertTriangle, Settings, X,
  Cloud, CloudOff, Minus,
} from "lucide-react";

/* ---------------------------------------------------------------------- */
/*  Tokens                                                                 */
/* ---------------------------------------------------------------------- */
const COLORS = {
  bg: "#090C12",
  panel: "#11151F",
  panelAlt: "#0C1018",
  border: "#1F2534",
  borderSoft: "#181D29",
  text: "#E7E9EE",
  textDim: "#8B93A7",
  textFaint: "#565E70",
  brand: "#22C55E",
  brandSoft: "rgba(34,197,94,0.12)",
  profit: "#22C55E",
  loss: "#F0475C",
  blue: "#3B82F6",
  orange: "#F59E0B",
};
const PIE_PALETTE = [COLORS.brand, COLORS.blue, COLORS.orange, "#C15FD6", "#4BC9C9", "#E97C7C"];
const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');";
const DEFAULT_SETTINGS = { buyFeePct: 0.15, sellFeePct: 0.25 };

/* ---------------------------------------------------------------------- */
/*  Universal key-value storage                                           */
/*  Uses Claude Artifacts' window.storage when available (inside Claude), */
/*  otherwise falls back to the browser's built-in localStorage so the    */
/*  app also works when deployed standalone (Netlify, Vercel, dll).       */
/* ---------------------------------------------------------------------- */
const hasArtifactStorage = () =>
  typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";

async function storageGet(key) {
  if (hasArtifactStorage()) {
    try { return await window.storage.get(key, false); } catch (e) { return null; }
  }
  try {
    const v = window.localStorage.getItem(key);
    return v !== null ? { key, value: v } : null;
  } catch (e) { return null; }
}
async function storageSet(key, value) {
  if (hasArtifactStorage()) {
    try { return await window.storage.set(key, value, false); } catch (e) { return null; }
  }
  try { window.localStorage.setItem(key, value); return { key, value }; } catch (e) { return null; }
}
async function storageDelete(key) {
  if (hasArtifactStorage()) {
    try { return await window.storage.delete(key, false); } catch (e) { return null; }
  }
  try { window.localStorage.removeItem(key); return { key, deleted: true }; } catch (e) { return null; }
}

/* ---------------------------------------------------------------------- */
/*  Shared helpers                                                         */
/* ---------------------------------------------------------------------- */
const rp = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "Rp 0";
  const neg = n < 0;
  return (neg ? "-Rp " : "Rp ") + Math.round(Math.abs(n)).toLocaleString("id-ID");
};
const pct = (n) => (n === null || n === undefined || Number.isNaN(n) || !Number.isFinite(n)) ? "0,00%" : `${n.toFixed(2).replace(".", ",")}%`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-";
const fmtDateShort = (d) => d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) : "-";
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const mapTxn = (r) => ({ id: r.id, date: r.date, type: r.type, code: r.code, price: Number(r.price), lot: Number(r.lot), feePct: Number(r.fee_pct), note: r.note });
const mapCf = (r) => ({ id: r.id, date: r.date, type: r.type, amount: Number(r.amount), note: r.note });
const mapDv = (r) => ({ id: r.id, code: r.code, cumDate: r.cum_date, payDate: r.pay_date, perShare: Number(r.per_share), lot: Number(r.lot), note: r.note });

/* ---------------------------------------------------------------------- */
/*  LOCAL BACKEND — SQLite via sql.js, running fully in the browser        */
/* ---------------------------------------------------------------------- */
const SQLJS_JS = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/sql-wasm.js";
const SQLJS_WASM = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/sql-wasm.wasm";
const LOCAL_DB_KEY = "stx_sqlite_db_v1";

const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY, date TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('BUY','SELL')),
  code TEXT NOT NULL, price REAL NOT NULL, lot REAL NOT NULL, fee_pct REAL NOT NULL DEFAULT 0, note TEXT
);
CREATE INDEX IF NOT EXISTS idx_txn_code ON transactions(code);
CREATE TABLE IF NOT EXISTS cashflows (
  id TEXT PRIMARY KEY, date TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('DEPOSIT','WITHDRAW')),
  amount REAL NOT NULL, note TEXT
);
CREATE TABLE IF NOT EXISTS dividends (
  id TEXT PRIMARY KEY, code TEXT NOT NULL, cum_date TEXT, pay_date TEXT NOT NULL,
  per_share REAL NOT NULL, lot REAL NOT NULL, note TEXT
);
CREATE TABLE IF NOT EXISTS stock_prices (code TEXT PRIMARY KEY, current_price REAL NOT NULL, updated_at TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`;

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (window.initSqlJs) return resolve();
    if (document.querySelector(`script[data-src="${src}"]`)) {
      const iv = setInterval(() => { if (window.initSqlJs) { clearInterval(iv); resolve(); } }, 50);
      return;
    }
    const s = document.createElement("script");
    s.src = src; s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Gagal memuat sql.js dari CDN"));
    document.head.appendChild(s);
  });
}
function uint8ToBase64(bytes) {
  let binary = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(binary);
}
function base64ToUint8(b64) {
  const binary = atob(b64); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function qAll(db, sql) {
  const rows = []; const stmt = db.prepare(sql);
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function createLocalBackend() {
  await loadScriptOnce(SQLJS_JS);
  const SQL = await window.initSqlJs({ locateFile: () => SQLJS_WASM });
  let bytes = null;
  try {
    const r = await storageGet(LOCAL_DB_KEY);
    if (r && r.value) bytes = base64ToUint8(r.value);
  } catch (e) { /* fresh db */ }
  const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  db.run(SCHEMA_SQLITE);
  if (qAll(db, "SELECT * FROM settings").length === 0) {
    db.run("INSERT INTO settings (key,value) VALUES ('buyFeePct','0.15'),('sellFeePct','0.25')");
  }
  const persist = async () => {
    try { await storageSet(LOCAL_DB_KEY, uint8ToBase64(db.export())); } catch (e) { /* ignore */ }
  };
  return {
    type: "local",
    async listAll() {
      return {
        transactions: qAll(db, "SELECT * FROM transactions").map(mapTxn),
        cashflows: qAll(db, "SELECT * FROM cashflows").map(mapCf),
        dividends: qAll(db, "SELECT * FROM dividends").map(mapDv),
        prices: Object.fromEntries(qAll(db, "SELECT * FROM stock_prices").map((r) => [r.code, r.current_price])),
        settings: Object.fromEntries(qAll(db, "SELECT * FROM settings").map((r) => [r.key, Number(r.value)])),
      };
    },
    async addTransaction(t) { db.run("INSERT INTO transactions (id,date,type,code,price,lot,fee_pct,note) VALUES (?,?,?,?,?,?,?,?)", [uid(), t.date, t.type, t.code, t.price, t.lot, t.feePct, t.note || ""]); await persist(); },
    async deleteTransaction(id) { db.run("DELETE FROM transactions WHERE id=?", [id]); await persist(); },
    async addCashflow(c) { db.run("INSERT INTO cashflows (id,date,type,amount,note) VALUES (?,?,?,?,?)", [uid(), c.date, c.type, c.amount, c.note || ""]); await persist(); },
    async deleteCashflow(id) { db.run("DELETE FROM cashflows WHERE id=?", [id]); await persist(); },
    async addDividend(d) { db.run("INSERT INTO dividends (id,code,cum_date,pay_date,per_share,lot,note) VALUES (?,?,?,?,?,?,?)", [uid(), d.code, d.cumDate, d.payDate, d.perShare, d.lot, d.note || ""]); await persist(); },
    async deleteDividend(id) { db.run("DELETE FROM dividends WHERE id=?", [id]); await persist(); },
    async setPrice(code, price) { db.run("INSERT INTO stock_prices (code,current_price,updated_at) VALUES (?,?,?) ON CONFLICT(code) DO UPDATE SET current_price=excluded.current_price, updated_at=excluded.updated_at", [code, price, new Date().toISOString()]); await persist(); },
    async setSetting(key, value) { db.run("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [key, String(value)]); await persist(); },
    async resetAll() { ["transactions", "cashflows", "dividends", "stock_prices"].forEach((t) => db.run(`DELETE FROM ${t}`)); await persist(); },
  };
}

/* ---------------------------------------------------------------------- */
/*  CLOUD BACKEND — Supabase (Postgres) over REST, works from any device   */
/* ---------------------------------------------------------------------- */
const CLOUD_CONFIG_KEY = "stx_cloud_config";

function sbHeaders(cfg, extra = {}) {
  return { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json", ...extra };
}
async function sbGet(cfg, path) {
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, { headers: sbHeaders(cfg) });
  if (!res.ok) throw new Error(`Gagal memuat data (${res.status}). Periksa URL & API Key.`);
  return res.json();
}
async function sbInsert(cfg, table, row) {
  const res = await fetch(`${cfg.url}/rest/v1/${table}`, { method: "POST", headers: sbHeaders(cfg, { Prefer: "return=minimal" }), body: JSON.stringify(row) });
  if (!res.ok) throw new Error(`Gagal menyimpan ke ${table} (${res.status})`);
}
async function sbUpsert(cfg, table, row, onConflict) {
  const res = await fetch(`${cfg.url}/rest/v1/${table}?on_conflict=${onConflict}`, { method: "POST", headers: sbHeaders(cfg, { Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(row) });
  if (!res.ok) throw new Error(`Gagal upsert ke ${table} (${res.status})`);
}
async function sbDelete(cfg, table, id) {
  const res = await fetch(`${cfg.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: sbHeaders(cfg) });
  if (!res.ok) throw new Error(`Gagal menghapus dari ${table} (${res.status})`);
}

async function createCloudBackend(cfg) {
  await sbGet(cfg, "settings?select=key");
  return {
    type: "cloud",
    async listAll() {
      const [transactions, cashflows, dividends, priceRows, settingRows] = await Promise.all([
        sbGet(cfg, "transactions?select=*"), sbGet(cfg, "cashflows?select=*"), sbGet(cfg, "dividends?select=*"),
        sbGet(cfg, "stock_prices?select=*"), sbGet(cfg, "settings?select=*"),
      ]);
      return {
        transactions: transactions.map(mapTxn), cashflows: cashflows.map(mapCf), dividends: dividends.map(mapDv),
        prices: Object.fromEntries(priceRows.map((r) => [r.code, Number(r.current_price)])),
        settings: Object.fromEntries(settingRows.map((r) => [r.key, Number(r.value)])),
      };
    },
    async addTransaction(t) { await sbInsert(cfg, "transactions", { id: uid(), date: t.date, type: t.type, code: t.code, price: t.price, lot: t.lot, fee_pct: t.feePct, note: t.note || "" }); },
    async deleteTransaction(id) { await sbDelete(cfg, "transactions", id); },
    async addCashflow(c) { await sbInsert(cfg, "cashflows", { id: uid(), date: c.date, type: c.type, amount: c.amount, note: c.note || "" }); },
    async deleteCashflow(id) { await sbDelete(cfg, "cashflows", id); },
    async addDividend(d) { await sbInsert(cfg, "dividends", { id: uid(), code: d.code, cum_date: d.cumDate, pay_date: d.payDate, per_share: d.perShare, lot: d.lot, note: d.note || "" }); },
    async deleteDividend(id) { await sbDelete(cfg, "dividends", id); },
    async setPrice(code, price) { await sbUpsert(cfg, "stock_prices", { code, current_price: price, updated_at: new Date().toISOString() }, "code"); },
    async setSetting(key, value) { await sbUpsert(cfg, "settings", { key, value: String(value) }, "key"); },
    async resetAll() {
      await Promise.all(["transactions", "cashflows", "dividends", "stock_prices"].map((t) =>
        fetch(`${cfg.url}/rest/v1/${t}?id=neq.__none__`, { method: "DELETE", headers: sbHeaders(cfg) })
      ));
    },
  };
}

/* ---------------------------------------------------------------------- */
/*  Core computation: FIFO matching, holdings, closed trades               */
/* ---------------------------------------------------------------------- */
function computeAll(transactions, prices) {
  const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date) || String(a.id).localeCompare(String(b.id)));
  const queues = {}; const closed = [];
  for (const t of sorted) {
    const shares = Number(t.lot) * 100;
    if (!queues[t.code]) queues[t.code] = [];
    if (t.type === "BUY") {
      const totalCost = Number(t.price) * shares * (1 + Number(t.feePct) / 100);
      queues[t.code].push({ shares, effPrice: totalCost / shares, date: t.date });
    } else {
      let toSell = shares;
      const netSellPrice = Number(t.price) * (1 - Number(t.feePct) / 100);
      while (toSell > 0.0001 && queues[t.code] && queues[t.code].length > 0) {
        const lot0 = queues[t.code][0];
        const matched = Math.min(lot0.shares, toSell);
        const netProfit = (netSellPrice - lot0.effPrice) * matched;
        const netProfitPct = ((netSellPrice - lot0.effPrice) / lot0.effPrice) * 100;
        const holdingDays = Math.max(0, Math.round((new Date(t.date) - new Date(lot0.date)) / 86400000));
        closed.push({ id: `${t.id}-${closed.length}`, code: t.code, buyDate: lot0.date, sellDate: t.date, buyPrice: lot0.effPrice, sellPrice: netSellPrice, shares: matched, lot: matched / 100, netProfit, netProfitPct, holdingDays });
        lot0.shares -= matched; toSell -= matched;
        if (lot0.shares <= 0.0001) queues[t.code].shift();
      }
    }
  }
  const holdings = Object.entries(queues)
    .filter(([, q]) => q.reduce((s, l) => s + l.shares, 0) > 0.0001)
    .map(([code, q]) => {
      const shares = q.reduce((s, l) => s + l.shares, 0);
      const cost = q.reduce((s, l) => s + l.shares * l.effPrice, 0);
      const avgPrice = cost / shares;
      const currentPrice = prices[code] !== undefined && prices[code] !== "" ? Number(prices[code]) : avgPrice;
      const marketValue = shares * currentPrice;
      const unrealized = marketValue - cost;
      const unrealizedPct = cost ? (unrealized / cost) * 100 : 0;
      return { code, shares, lot: shares / 100, avgPrice, cost, currentPrice, marketValue, unrealized, unrealizedPct };
    }).sort((a, b) => b.marketValue - a.marketValue);
  return { holdings, closed };
}

/* ---------------------------------------------------------------------- */
/*  Small UI primitives                                                    */
/* ---------------------------------------------------------------------- */
function Panel({ children, className = "" }) { return <div className={`rounded-xl border ${className}`} style={{ background: COLORS.panel, borderColor: COLORS.border }}>{children}</div>; }
function Field({ label, children }) { return <label className="flex flex-col gap-1.5 text-sm"><span style={{ color: COLORS.textDim }}>{label}</span>{children}</label>; }
const inputCls = "px-3 py-2 rounded-md text-sm outline-none transition-colors border focus:border-current";
function inputStyle() { return { background: COLORS.panelAlt, borderColor: COLORS.border, color: COLORS.text, caretColor: COLORS.brand }; }
function Btn({ children, onClick, type = "button", variant = "primary", className = "", disabled, ...rest }) {
  const base = "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50";
  const styles = variant === "primary" ? { background: COLORS.brand, color: "#04170A" } :
    variant === "ghost" ? { background: "transparent", color: COLORS.textDim, border: `1px solid ${COLORS.border}` } :
    { background: "transparent", color: COLORS.loss, border: `1px solid ${COLORS.border}` };
  return <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${className}`} style={styles} {...rest}>{children}</button>;
}
function Badge({ label, value, tone }) {
  const color = tone === "up" ? COLORS.profit : tone === "down" ? COLORS.loss : COLORS.text;
  return (
    <div className="hidden md:flex flex-col px-3 py-1.5 rounded-lg border" style={{ borderColor: COLORS.border, background: COLORS.panelAlt }}>
      <span className="text-[10px]" style={{ color: COLORS.textFaint }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</span>
    </div>
  );
}
function KpiCard({ label, icon: Icon, value, sub, tone }) {
  const color = tone === "up" ? COLORS.profit : tone === "down" ? COLORS.loss : COLORS.text;
  return (
    <Panel className="p-4 flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[11px] tracking-wide font-medium" style={{ color: COLORS.textFaint }}>{label}</span>
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color: COLORS.textFaint }} />}
      </div>
      <span className="text-xl font-semibold truncate" style={{ color, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</span>
      {sub && <span className="text-xs" style={{ color: COLORS.textDim }}>{sub}</span>}
    </Panel>
  );
}
function Th({ children, align = "left" }) { return <th className={`px-3 py-2 text-[11px] font-medium whitespace-nowrap text-${align} uppercase`} style={{ color: COLORS.textFaint, borderBottom: `1px solid ${COLORS.border}` }}>{children}</th>; }
function Td({ children, align = "left", mono = false, className = "" }) { return <td className={`px-3 py-2 text-sm whitespace-nowrap text-${align} ${className}`} style={{ color: COLORS.text, fontFamily: mono ? "'IBM Plex Mono', monospace" : undefined }}>{children}</td>; }
function EmptyState({ text }) { return <div className="h-[200px] flex items-center justify-center text-sm text-center px-6" style={{ color: COLORS.textFaint }}>{text}</div>; }

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LineChart },
  { id: "portfolio", label: "Portofolio Aktif", icon: Briefcase },
  { id: "journal", label: "Jurnal Transaksi", icon: ClipboardList },
  { id: "closed", label: "Closed Trades", icon: History },
  { id: "cash", label: "Cash & Dividen", icon: Landmark },
];

/* ---------------------------------------------------------------------- */
/*  Main App                                                               */
/* ---------------------------------------------------------------------- */
export default function App() {
  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [backend, setBackend] = useState(null);
  const [backendType, setBackendType] = useState("local");
  const [cloudConfig, setCloudConfig] = useState(null);

  const [transactions, setTransactions] = useState([]);
  const [cashflows, setCashflows] = useState([]);
  const [dividends, setDividends] = useState([]);
  const [prices, setPrices] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [actionError, setActionError] = useState("");
  const [quickAddType, setQuickAddType] = useState(null); // null | 'BUY' | 'SELL'

  const applyData = useCallback((data) => {
    setTransactions(data.transactions || []);
    setCashflows(data.cashflows || []);
    setDividends(data.dividends || []);
    setPrices(data.prices || {});
    setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) });
  }, []);

  const refresh = useCallback(async (b) => {
    const backendRef = b || backend;
    if (!backendRef) return;
    const data = await backendRef.listAll();
    applyData(data);
  }, [backend, applyData]);

  useEffect(() => {
    (async () => {
      try {
        let cfg = null;
        try {
          const r = await storageGet(CLOUD_CONFIG_KEY);
          if (r && r.value) cfg = JSON.parse(r.value);
        } catch (e) { /* no cloud config saved */ }
        if (cfg && cfg.url && cfg.key) {
          try {
            const cloud = await createCloudBackend(cfg);
            setBackend(cloud); setBackendType("cloud"); setCloudConfig(cfg);
            await refresh(cloud);
            setStatus("ready");
            return;
          } catch (e) { /* fall back to local below */ }
        }
        const local = await createLocalBackend();
        setBackend(local); setBackendType("local");
        await refresh(local);
        setStatus("ready");
      } catch (e) {
        setErrorMsg(e && e.message ? e.message : "Gagal memuat database.");
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doMutate = useCallback(async (fn) => {
    try { await fn(); await refresh(); setActionError(""); }
    catch (e) { setActionError(e && e.message ? e.message : "Terjadi kesalahan saat menyimpan data."); }
  }, [refresh]);

  const addTransaction = (t) => doMutate(() => backend.addTransaction(t));
  const deleteTransaction = (id) => doMutate(() => backend.deleteTransaction(id));
  const addCashflow = (c) => doMutate(() => backend.addCashflow(c));
  const deleteCashflow = (id) => doMutate(() => backend.deleteCashflow(id));
  const addDividend = (d) => doMutate(() => backend.addDividend(d));
  const deleteDividend = (id) => doMutate(() => backend.deleteDividend(id));
  const setPrice = (code, price) => doMutate(() => backend.setPrice(code, price));
  const setFeeSetting = (key, value) => doMutate(() => backend.setSetting(key, value));
  const resetAll = () => doMutate(() => backend.resetAll());

  const connectCloud = async (url, key) => {
    const cfg = { url: url.replace(/\/$/, ""), key };
    const cloud = await createCloudBackend(cfg);
    const data = await cloud.listAll();
    if (Object.keys(data.settings || {}).length === 0) {
      await cloud.setSetting("buyFeePct", DEFAULT_SETTINGS.buyFeePct);
      await cloud.setSetting("sellFeePct", DEFAULT_SETTINGS.sellFeePct);
    }
    await storageSet(CLOUD_CONFIG_KEY, JSON.stringify(cfg));
    setBackend(cloud); setBackendType("cloud"); setCloudConfig(cfg);
    await refresh(cloud);
  };
  const disconnectCloud = async () => {
    try { await storageDelete(CLOUD_CONFIG_KEY); } catch (e) { /* ignore */ }
    setCloudConfig(null);
    const local = await createLocalBackend();
    setBackend(local); setBackendType("local");
    await refresh(local);
  };

  const { holdings, closed } = useMemo(() => computeAll(transactions, prices), [transactions, prices]);

  const totals = useMemo(() => {
    const totalDeposit = cashflows.filter((c) => c.type === "DEPOSIT").reduce((s, c) => s + c.amount, 0);
    const totalWithdraw = cashflows.filter((c) => c.type === "WITHDRAW").reduce((s, c) => s + c.amount, 0);
    const totalBuyCost = transactions.filter((t) => t.type === "BUY").reduce((s, t) => s + t.price * t.lot * 100 * (1 + t.feePct / 100), 0);
    const totalSellProceeds = transactions.filter((t) => t.type === "SELL").reduce((s, t) => s + t.price * t.lot * 100 * (1 - t.feePct / 100), 0);
    const totalDividend = dividends.reduce((s, d) => s + d.perShare * d.lot * 100, 0);
    const cashBalance = totalDeposit - totalWithdraw - totalBuyCost + totalSellProceeds + totalDividend;
    const marketValue = holdings.reduce((s, h) => s + h.marketValue, 0);
    const totalEquity = cashBalance + marketValue;
    const netCapital = totalDeposit - totalWithdraw;
    const realizedPL = closed.reduce((s, c) => s + c.netProfit, 0);
    const unrealizedPL = holdings.reduce((s, h) => s + h.unrealized, 0);
    const unrealizedPctOfCapital = netCapital ? (unrealizedPL / netCapital) * 100 : 0;
    const wins = closed.filter((c) => c.netProfit > 0).length;
    const winRate = closed.length ? (wins / closed.length) * 100 : 0;
    return { cashBalance, marketValue, totalEquity, netCapital, realizedPL, unrealizedPL, unrealizedPctOfCapital, winRate, totalDividend };
  }, [cashflows, transactions, dividends, holdings, closed]);

  const tradePL = useMemo(() => (
    [...closed].sort((a, b) => new Date(a.sellDate) - new Date(b.sellDate)).slice(-8)
      .map((c) => ({ label: `${c.code} (${fmtDateShort(c.sellDate)})`, value: Math.round(c.netProfit) }))
  ), [closed]);

  if (status === "loading") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center gap-2" style={{ background: COLORS.bg, color: COLORS.textDim }}>
        <style>{FONT_IMPORT}</style>
        <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Menyiapkan database…</span>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-6" style={{ background: COLORS.bg, color: COLORS.textDim }}>
        <style>{FONT_IMPORT}</style>
        <div className="max-w-sm text-center flex flex-col items-center gap-2">
          <AlertTriangle className="w-5 h-5" style={{ color: COLORS.loss }} />
          <p className="text-sm">Gagal memuat database: {errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full" style={{ background: COLORS.bg, color: COLORS.text, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{FONT_IMPORT}</style>

      <div className="border-b sticky top-0 z-10" style={{ borderColor: COLORS.border, background: "rgba(9,12,18,0.94)", backdropFilter: "blur(6px)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: COLORS.brandSoft }}>
              <LineChart className="w-4.5 h-4.5" style={{ color: COLORS.brand }} />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-semibold leading-tight">StockTrack</h1>
              <p className="text-[11px]" style={{ color: COLORS.textFaint }}>Rekapitulasi Jual Beli Saham & Portofolio Tracker</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge label="TOTAL EKUITAS" value={rp(totals.totalEquity)} />
            <Badge label="REALIZED P/L" value={rp(totals.realizedPL)} tone={totals.realizedPL >= 0 ? "up" : "down"} />
            <Badge label="UNREALIZED P/L" value={rp(totals.unrealizedPL)} tone={totals.unrealizedPL >= 0 ? "up" : "down"} />
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs" style={{ borderColor: COLORS.border, color: backendType === "cloud" ? COLORS.brand : COLORS.textFaint }}>
              {backendType === "cloud" ? <Cloud className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
              {backendType === "cloud" ? "Online" : "Lokal"}
            </div>
            <button onClick={() => setShowSettings((v) => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium" style={{ borderColor: COLORS.border, color: showSettings ? COLORS.brand : COLORS.textDim }}>
              <Settings className="w-3.5 h-3.5" /> Setting Fee & Database
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-4 flex flex-col gap-3">
            <FeeSettingsPanel settings={settings} onSave={setFeeSetting} onClose={() => setShowSettings(false)} />
            <CloudSettingsPanel backendType={backendType} cloudConfig={cloudConfig} onConnect={connectCloud} onDisconnect={disconnectCloud} />
            {actionError && <div className="text-xs px-3 py-2 rounded-md" style={{ color: COLORS.loss, background: "rgba(240,71,92,0.1)" }}>{actionError}</div>}
          </div>
        )}

        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto pb-2 -mb-px">
          {TABS.map((t) => {
            const Icon = t.icon; const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors border-b-2"
                style={{ color: active ? COLORS.brand : COLORS.textDim, borderColor: active ? COLORS.brand : "transparent" }}>
                <Icon className="w-3.5 h-3.5" />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {tab === "dashboard" && <DashboardTab totals={totals} holdings={holdings} tradePL={tradePL} settings={settings} onSetPrice={setPrice} onGoPortfolio={() => setTab("portfolio")} />}
        {tab === "portfolio" && <PortfolioTab holdings={holdings} prices={prices} onSetPrice={setPrice} />}
        {tab === "journal" && <JournalTab transactions={transactions} onAdd={addTransaction} onDelete={deleteTransaction} settings={settings} onOpenSettings={() => setShowSettings(true)} />}
        {tab === "closed" && <ClosedTab closed={closed} />}
        {tab === "cash" && <CashDividendTab cashflows={cashflows} onAddCashflow={addCashflow} onDeleteCashflow={deleteCashflow} dividends={dividends} onAddDividend={addDividend} onDeleteDividend={deleteDividend} />}

        <div className="mt-10 flex justify-center">
          {!showReset ? (
            <button onClick={() => setShowReset(true)} className="text-xs flex items-center gap-1" style={{ color: COLORS.textFaint }}><RotateCcw className="w-3 h-3" /> Reset seluruh data</button>
          ) : (
            <div className="flex items-center gap-3 text-xs" style={{ color: COLORS.textDim }}>
              <span>Hapus semua data secara permanen?</span>
              <Btn variant="danger" onClick={() => { resetAll(); setShowReset(false); }}>Ya, hapus</Btn>
              <Btn variant="ghost" onClick={() => setShowReset(false)}>Batal</Btn>
            </div>
          )}
        </div>
      </div>

      {/* Floating quick-add buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-20">
        <button
          onClick={() => setQuickAddType("SELL")}
          title="Tambah transaksi jual"
          className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: COLORS.loss, color: "#2A0007" }}
        >
          <Minus className="w-5 h-5" strokeWidth={3} />
        </button>
        <button
          onClick={() => setQuickAddType("BUY")}
          title="Tambah transaksi beli"
          className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: COLORS.brand, color: "#04170A" }}
        >
          <Plus className="w-5 h-5" strokeWidth={3} />
        </button>
      </div>

      {quickAddType && (
        <QuickAddModal
          type={quickAddType}
          settings={settings}
          onClose={() => setQuickAddType(null)}
          onSubmit={(t) => { addTransaction(t); setQuickAddType(null); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Quick-add transaction modal (floating + / -)                           */
/* ---------------------------------------------------------------------- */
function QuickAddModal({ type, settings, onClose, onSubmit }) {
  const isBuy = type === "BUY";
  const accent = isBuy ? COLORS.brand : COLORS.loss;
  const accentSoft = isBuy ? "rgba(34,197,94,0.10)" : "rgba(240,71,92,0.10)";
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ date: today, code: "", price: "", lot: "", note: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const feePct = isBuy ? settings.buyFeePct : settings.sellFeePct;
  const gross = (Number(form.price) || 0) * (Number(form.lot) || 0) * 100;
  const total = isBuy ? gross * (1 + feePct / 100) : gross * (1 - feePct / 100);

  const submit = (e) => {
    e.preventDefault();
    if (!form.code || !form.price || !form.lot) return;
    onSubmit({ date: form.date, type, code: form.code.toUpperCase().trim(), price: Number(form.price), lot: Number(form.lot), feePct: Number(feePct), note: form.note });
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border overflow-hidden"
        style={{ background: COLORS.panel, borderColor: accent }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: accentSoft, borderBottom: `1px solid ${COLORS.border}` }}>
          <h3 className="text-sm font-semibold" style={{ color: accent }}>
            {isBuy ? "Tambah Transaksi Beli" : "Tambah Transaksi Jual"}
          </h3>
          <button onClick={onClose} style={{ color: COLORS.textFaint }}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-5 flex flex-col gap-3">
          <Field label="Tanggal"><input type="date" className={inputCls} style={inputStyle()} value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kode Saham"><input className={inputCls} style={inputStyle()} placeholder="BBCA" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} autoFocus /></Field>
            <Field label="Jumlah Lot"><input type="number" className={inputCls} style={inputStyle()} placeholder="10" value={form.lot} onChange={(e) => set("lot", e.target.value)} /></Field>
          </div>
          <Field label="Harga / Lembar"><input type="number" className={inputCls} style={inputStyle()} placeholder="9500" value={form.price} onChange={(e) => set("price", e.target.value)} /></Field>
          <Field label="Catatan / Strategi (opsional)"><input className={inputCls} style={inputStyle()} placeholder="Breakout buy, cut loss…" value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>
          <div className="flex items-center justify-between text-xs pt-1" style={{ color: COLORS.textDim }}>
            <span>Fee {isBuy ? "beli" : "jual"}: {feePct}%</span>
            <span>Total {isBuy ? "dibayar" : "diterima"}: <span style={{ color: COLORS.text, fontFamily: "'IBM Plex Mono', monospace" }}>{rp(total)}</span></span>
          </div>
          <div className="flex gap-2 pt-2">
            <Btn type="button" variant="ghost" className="flex-1" onClick={onClose}>Batal</Btn>
            <button type="submit" className="flex-1 rounded-md text-sm font-medium py-2" style={{ background: accent, color: isBuy ? "#04170A" : "#2A0007" }}>
              {isBuy ? "Simpan Beli" : "Simpan Jual"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Settings panels                                                        */
/* ---------------------------------------------------------------------- */
function FeeSettingsPanel({ settings, onSave, onClose }) {
  const [buyFee, setBuyFee] = useState(settings.buyFeePct);
  const [sellFee, setSellFee] = useState(settings.sellFeePct);
  const save = () => { onSave("buyFeePct", Number(buyFee)); onSave("sellFeePct", Number(sellFee)); };
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium" style={{ color: COLORS.textDim }}>Setting Fee Broker</h3>
        <button onClick={onClose} style={{ color: COLORS.textFaint }}><X className="w-4 h-4" /></button>
      </div>
      <p className="text-xs mb-3" style={{ color: COLORS.textFaint }}>Diinput sekali di sini, otomatis diterapkan ke setiap transaksi baru.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
        <Field label="Fee Beli (%)"><input type="number" step="0.01" className={inputCls} style={inputStyle()} value={buyFee} onChange={(e) => setBuyFee(e.target.value)} /></Field>
        <Field label="Fee Jual (%)"><input type="number" step="0.01" className={inputCls} style={inputStyle()} value={sellFee} onChange={(e) => setSellFee(e.target.value)} /></Field>
        <Btn onClick={save}>Simpan</Btn>
      </div>
    </Panel>
  );
}

function CloudSettingsPanel({ backendType, cloudConfig, onConnect, onDisconnect }) {
  const [url, setUrl] = useState(cloudConfig?.url || "");
  const [key, setKey] = useState(cloudConfig?.key || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const connect = async () => {
    if (!url || !key) { setError("URL dan API Key wajib diisi."); return; }
    setBusy(true); setError("");
    try { await onConnect(url.trim(), key.trim()); }
    catch (e) { setError(e && e.message ? e.message : "Gagal terhubung. Periksa URL & API Key, atau jalankan schema.sql di Supabase terlebih dahulu."); }
    finally { setBusy(false); }
  };

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium flex items-center gap-1.5" style={{ color: COLORS.textDim }}>
          {backendType === "cloud" ? <Cloud className="w-4 h-4" style={{ color: COLORS.brand }} /> : <CloudOff className="w-4 h-4" />} Database Online (Supabase)
        </h3>
      </div>
      {backendType === "cloud" ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs" style={{ color: COLORS.textDim }}>Terhubung ke: <span style={{ color: COLORS.text, fontFamily: "'IBM Plex Mono', monospace" }}>{cloudConfig?.url}</span></p>
          <p className="text-xs" style={{ color: COLORS.textFaint }}>Data tersimpan online — bisa diakses dari perangkat lain dengan URL & API Key yang sama.</p>
          <div><Btn variant="ghost" onClick={onDisconnect}>Putuskan koneksi (pakai database lokal)</Btn></div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs" style={{ color: COLORS.textFaint }}>
            Saat ini data disimpan lokal di browser ini. Hubungkan ke proyek Supabase (gratis) agar data tersimpan online dan bisa diakses dari HP/laptop lain.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Supabase Project URL"><input className={inputCls} style={inputStyle()} placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
            <Field label="Supabase Anon API Key"><input className={inputCls} style={inputStyle()} placeholder="eyJhbGciOi..." value={key} onChange={(e) => setKey(e.target.value)} /></Field>
          </div>
          {error && <p className="text-xs" style={{ color: COLORS.loss }}>{error}</p>}
          <div><Btn onClick={connect} disabled={busy}>{busy ? "Menghubungkan…" : "Hubungkan"}</Btn></div>
        </div>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------------- */
/*  Dashboard                                                              */
/* ---------------------------------------------------------------------- */
function DashboardTab({ totals, holdings, tradePL, settings, onGoPortfolio }) {
  const pieData = holdings.map((h) => ({ name: h.code, value: Math.round(h.marketValue) }));
  const topHoldings = holdings.slice(0, 5);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="TOTAL MODAL RDN" value={rp(totals.netCapital)} sub={`Cash: ${rp(totals.cashBalance)}`} />
        <KpiCard label="NILAI SAHAM SAAT INI" value={rp(totals.marketValue)} sub={`${holdings.length} Saham Dipegang`} />
        <KpiCard label="REALIZED P/L" value={rp(totals.realizedPL)} sub="Dari Saham Tertutup" tone={totals.realizedPL >= 0 ? "up" : "down"} />
        <KpiCard label="UNREALIZED P/L" value={rp(totals.unrealizedPL)} sub={`${totals.unrealizedPctOfCapital >= 0 ? "+" : ""}${pct(totals.unrealizedPctOfCapital)} vs Modal`} tone={totals.unrealizedPL >= 0 ? "up" : "down"} />
        <KpiCard label="WIN RATE & DIVIDEN" value={pct(totals.winRate)} sub={`Dividen: ${rp(totals.totalDividend)}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium" style={{ color: COLORS.textDim }}>Alokasi Portofolio Saham</h3>
            <span className="text-[11px]" style={{ color: COLORS.textFaint }}>Sektor / Kode</span>
          </div>
          {pieData.length === 0 ? <EmptyState text="Belum ada posisi saham aktif." /> : (
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} stroke={COLORS.panel} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }} formatter={(v) => rp(v)} />
                  <Legend wrapperStyle={{ fontSize: 12, color: COLORS.textDim }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium" style={{ color: COLORS.textDim }}>Performa Keuntungan per Transaksi (P/L)</h3>
            <span className="text-[11px] flex items-center gap-2" style={{ color: COLORS.textFaint }}>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: COLORS.profit }} />Profit</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: COLORS.loss }} />Rugi</span>
            </span>
          </div>
          {tradePL.length === 0 ? <EmptyState text="Belum ada transaksi jual yang tercatat." /> : (
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tradePL}>
                  <CartesianGrid stroke={COLORS.borderSoft} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: COLORS.textFaint, fontSize: 10 }} axisLine={{ stroke: COLORS.border }} tickLine={false} interval={0} angle={-10} textAnchor="end" height={40} />
                  <YAxis tick={{ fill: COLORS.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} width={70} tickFormatter={(v) => rp(v)} />
                  <Tooltip contentStyle={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }} formatter={(v) => rp(v)} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {tradePL.map((d, i) => <Cell key={i} fill={d.value >= 0 ? COLORS.profit : COLORS.loss} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <Panel className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium" style={{ color: COLORS.textDim }}>Top Posisi Aktif Saat Ini</h3>
          <button onClick={onGoPortfolio} className="text-xs font-medium" style={{ color: COLORS.brand }}>Lihat Semua</button>
        </div>
        {topHoldings.length === 0 ? <EmptyState text="Belum ada posisi saham." /> : (
          <table className="w-full border-collapse">
            <thead><tr><Th>Kode</Th><Th align="right">Lot</Th><Th align="right">Avg Price</Th><Th align="right">Harga Skrg</Th><Th align="right">Modal (Rp)</Th><Th align="right">Unrealized P/L</Th></tr></thead>
            <tbody>
              {topHoldings.map((h) => (
                <tr key={h.code} style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                  <Td className="font-semibold">{h.code}</Td>
                  <Td align="right" mono>{h.lot}</Td>
                  <Td align="right" mono>{rp(h.avgPrice)}</Td>
                  <Td align="right" mono>{rp(h.currentPrice)}</Td>
                  <Td align="right" mono>{rp(h.cost)}</Td>
                  <Td align="right" mono><span style={{ color: h.unrealized >= 0 ? COLORS.profit : COLORS.loss }}>{rp(h.unrealized)}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Portfolio                                                              */
/* ---------------------------------------------------------------------- */
function PortfolioTab({ holdings, prices, onSetPrice }) {
  const [edit, setEdit] = useState({});
  const commit = (code) => { const val = edit[code]; if (val === undefined || val === "") return; onSetPrice(code, Number(val)); };
  if (holdings.length === 0) return <Panel className="p-8"><EmptyState text="Belum ada saham yang dipegang. Tambahkan transaksi beli di tab Jurnal Transaksi." /></Panel>;
  return (
    <Panel className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[820px]">
        <thead><tr><Th>Kode</Th><Th align="right">Lot</Th><Th align="right">Lembar</Th><Th align="right">Avg Price</Th><Th align="right">Modal</Th><Th align="right">Harga Saat Ini</Th><Th align="right">Nilai Pasar</Th><Th align="right">Unrealized P/L</Th><Th align="right">Unrealized %</Th></tr></thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.code} style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
              <Td className="font-semibold">{h.code}</Td>
              <Td align="right" mono>{h.lot.toLocaleString("id-ID")}</Td>
              <Td align="right" mono>{h.shares.toLocaleString("id-ID")}</Td>
              <Td align="right" mono>{rp(h.avgPrice)}</Td>
              <Td align="right" mono>{rp(h.cost)}</Td>
              <Td align="right"><input className={`${inputCls} w-28 text-right`} style={{ ...inputStyle(), fontFamily: "'IBM Plex Mono', monospace" }} type="number" placeholder={String(Math.round(h.avgPrice))} value={edit[h.code] ?? (prices[h.code] ?? "")} onChange={(e) => setEdit({ ...edit, [h.code]: e.target.value })} onBlur={() => commit(h.code)} /></Td>
              <Td align="right" mono>{rp(h.marketValue)}</Td>
              <Td align="right" mono><span style={{ color: h.unrealized >= 0 ? COLORS.profit : COLORS.loss }}>{rp(h.unrealized)}</span></Td>
              <Td align="right" mono><span style={{ color: h.unrealizedPct >= 0 ? COLORS.profit : COLORS.loss }}>{pct(h.unrealizedPct)}</span></Td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs px-3 py-2" style={{ color: COLORS.textFaint }}>Masukkan harga terkini secara manual untuk memperbarui nilai pasar dan Unrealized P/L.</p>
    </Panel>
  );
}

/* ---------------------------------------------------------------------- */
/*  Journal (Trade Log)                                                    */
/* ---------------------------------------------------------------------- */
function JournalTab({ transactions, onAdd, onDelete, settings, onOpenSettings }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ date: today, type: "BUY", code: "", price: "", lot: "", note: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const activeFeePct = form.type === "BUY" ? settings.buyFeePct : settings.sellFeePct;
  const total = useMemo(() => {
    const p = Number(form.price) || 0, l = Number(form.lot) || 0;
    const gross = p * l * 100;
    return form.type === "BUY" ? gross * (1 + activeFeePct / 100) : gross * (1 - activeFeePct / 100);
  }, [form, activeFeePct]);

  const submit = (e) => {
    e.preventDefault();
    if (!form.code || !form.price || !form.lot) return;
    onAdd({ date: form.date, type: form.type, code: form.code.toUpperCase().trim(), price: Number(form.price), lot: Number(form.lot), feePct: Number(activeFeePct), note: form.note });
    setForm({ date: form.date, type: form.type, code: "", price: "", lot: "", note: "" });
  };

  const sortedList = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="flex flex-col gap-5">
      <Panel className="p-4">
        <h3 className="text-sm font-medium mb-3" style={{ color: COLORS.textDim }}>Tambah Transaksi</h3>
        <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          <Field label="Tanggal"><input type="date" className={inputCls} style={inputStyle()} value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
          <Field label="Tipe"><select className={inputCls} style={inputStyle()} value={form.type} onChange={(e) => set("type", e.target.value)}><option value="BUY">Beli (Buy)</option><option value="SELL">Jual (Sell)</option></select></Field>
          <Field label="Kode Saham"><input className={inputCls} style={inputStyle()} placeholder="BBCA" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
          <Field label="Harga / Lembar"><input type="number" className={inputCls} style={inputStyle()} placeholder="9500" value={form.price} onChange={(e) => set("price", e.target.value)} /></Field>
          <Field label="Jumlah Lot"><input type="number" className={inputCls} style={inputStyle()} placeholder="10" value={form.lot} onChange={(e) => set("lot", e.target.value)} /></Field>
          <Btn type="submit" className="h-[38px]"><Plus className="w-4 h-4" /> Tambah</Btn>
          <div className="col-span-2 sm:col-span-3 lg:col-span-4">
            <Field label="Catatan / Strategi"><input className={inputCls} style={inputStyle()} placeholder="Breakout buy, dividend play, cut loss…" value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>
          </div>
          <div className="text-sm self-end pb-2 col-span-2" style={{ color: COLORS.textDim }}>
            Fee {form.type === "BUY" ? "beli" : "jual"}: <span style={{ color: COLORS.text }}>{activeFeePct}%</span>{" "}
            <button type="button" onClick={onOpenSettings} className="underline" style={{ color: COLORS.brand }}>ubah</button>
            <div>Total: <span style={{ color: COLORS.text, fontFamily: "'IBM Plex Mono', monospace" }}>{rp(total)}</span></div>
          </div>
        </form>
      </Panel>
      <Panel className="overflow-x-auto">
        {sortedList.length === 0 ? <EmptyState text="Belum ada transaksi. Tambahkan transaksi pertama Anda di atas." /> : (
          <table className="w-full border-collapse min-w-[820px]">
            <thead><tr><Th>Tanggal</Th><Th>Tipe</Th><Th>Kode</Th><Th align="right">Harga</Th><Th align="right">Lot</Th><Th align="right">Fee %</Th><Th align="right">Total</Th><Th>Catatan</Th><Th align="right"></Th></tr></thead>
            <tbody>
              {sortedList.map((t) => {
                const gross = t.price * t.lot * 100;
                const tot = t.type === "BUY" ? gross * (1 + t.feePct / 100) : gross * (1 - t.feePct / 100);
                return (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                    <Td mono>{fmtDate(t.date)}</Td>
                    <Td><span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: t.type === "BUY" ? "rgba(34,197,94,0.12)" : "rgba(240,71,92,0.12)", color: t.type === "BUY" ? COLORS.profit : COLORS.loss }}>{t.type === "BUY" ? "BELI" : "JUAL"}</span></Td>
                    <Td className="font-semibold">{t.code}</Td>
                    <Td align="right" mono>{rp(t.price)}</Td>
                    <Td align="right" mono>{t.lot}</Td>
                    <Td align="right" mono>{t.feePct}%</Td>
                    <Td align="right" mono>{rp(tot)}</Td>
                    <Td className="max-w-[180px] truncate" style={{ color: COLORS.textDim }}>{t.note || "-"}</Td>
                    <Td align="right"><button onClick={() => onDelete(t.id)} style={{ color: COLORS.textFaint }}><Trash2 className="w-4 h-4" /></button></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Closed Trades                                                          */
/* ---------------------------------------------------------------------- */
function ClosedTab({ closed }) {
  const sorted = [...closed].sort((a, b) => new Date(b.sellDate) - new Date(a.sellDate));
  if (sorted.length === 0) return <Panel className="p-8"><EmptyState text="Belum ada saham yang terjual. Riwayat realized P/L akan muncul di sini." /></Panel>;
  return (
    <Panel className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[860px]">
        <thead><tr><Th>Kode</Th><Th>Tgl Beli</Th><Th>Tgl Jual</Th><Th align="right">Lot</Th><Th align="right">Harga Beli</Th><Th align="right">Harga Jual</Th><Th align="right">Net P/L</Th><Th align="right">Net P/L %</Th><Th align="right">Holding (hari)</Th></tr></thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
              <Td className="font-semibold">{c.code}</Td>
              <Td mono>{fmtDate(c.buyDate)}</Td>
              <Td mono>{fmtDate(c.sellDate)}</Td>
              <Td align="right" mono>{c.lot.toLocaleString("id-ID")}</Td>
              <Td align="right" mono>{rp(c.buyPrice)}</Td>
              <Td align="right" mono>{rp(c.sellPrice)}</Td>
              <Td align="right" mono><span style={{ color: c.netProfit >= 0 ? COLORS.profit : COLORS.loss }}>{rp(c.netProfit)}</span></Td>
              <Td align="right" mono><span style={{ color: c.netProfitPct >= 0 ? COLORS.profit : COLORS.loss }}>{pct(c.netProfitPct)}</span></Td>
              <Td align="right" mono>{c.holdingDays}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/* ---------------------------------------------------------------------- */
/*  Cash & Dividend                                                        */
/* ---------------------------------------------------------------------- */
function CashDividendTab({ cashflows, onAddCashflow, onDeleteCashflow, dividends, onAddDividend, onDeleteDividend }) {
  const today = new Date().toISOString().slice(0, 10);
  const [cf, setCf] = useState({ date: today, type: "DEPOSIT", amount: "", note: "" });
  const [dv, setDv] = useState({ code: "", cumDate: today, payDate: today, perShare: "", lot: "", note: "" });
  const submitCf = (e) => { e.preventDefault(); if (!cf.amount) return; onAddCashflow({ ...cf, amount: Number(cf.amount) }); setCf({ ...cf, amount: "", note: "" }); };
  const submitDv = (e) => { e.preventDefault(); if (!dv.code || !dv.perShare || !dv.lot) return; onAddDividend({ ...dv, code: dv.code.toUpperCase(), perShare: Number(dv.perShare), lot: Number(dv.lot) }); setDv({ ...dv, code: "", perShare: "", lot: "", note: "" }); };
  const cfSorted = [...cashflows].sort((a, b) => new Date(b.date) - new Date(a.date));
  const dvSorted = [...dividends].sort((a, b) => new Date(b.payDate) - new Date(a.payDate));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="text-sm font-medium mb-3" style={{ color: COLORS.textDim }}>Arus Kas RDN</h3>
        <Panel className="p-4 mb-3">
          <form onSubmit={submitCf} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <Field label="Tanggal"><input type="date" className={inputCls} style={inputStyle()} value={cf.date} onChange={(e) => setCf({ ...cf, date: e.target.value })} /></Field>
            <Field label="Tipe"><select className={inputCls} style={inputStyle()} value={cf.type} onChange={(e) => setCf({ ...cf, type: e.target.value })}><option value="DEPOSIT">Deposit</option><option value="WITHDRAW">Withdrawal</option></select></Field>
            <Field label="Jumlah (Rp)"><input type="number" className={inputCls} style={inputStyle()} placeholder="5000000" value={cf.amount} onChange={(e) => setCf({ ...cf, amount: e.target.value })} /></Field>
            <Btn type="submit"><Plus className="w-4 h-4" /> Tambah</Btn>
            <div className="col-span-2 sm:col-span-4"><Field label="Catatan"><input className={inputCls} style={inputStyle()} value={cf.note} onChange={(e) => setCf({ ...cf, note: e.target.value })} /></Field></div>
          </form>
        </Panel>
        <Panel className="overflow-x-auto">
          {cfSorted.length === 0 ? <EmptyState text="Belum ada catatan deposit / withdrawal." /> : (
            <table className="w-full border-collapse min-w-[560px]">
              <thead><tr><Th>Tanggal</Th><Th>Tipe</Th><Th align="right">Jumlah</Th><Th>Catatan</Th><Th align="right"></Th></tr></thead>
              <tbody>
                {cfSorted.map((c) => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                    <Td mono>{fmtDate(c.date)}</Td>
                    <Td><span style={{ color: c.type === "DEPOSIT" ? COLORS.profit : COLORS.loss }}>{c.type === "DEPOSIT" ? "Deposit" : "Withdrawal"}</span></Td>
                    <Td align="right" mono>{rp(c.amount)}</Td>
                    <Td style={{ color: COLORS.textDim }}>{c.note || "-"}</Td>
                    <Td align="right"><button onClick={() => onDeleteCashflow(c.id)} style={{ color: COLORS.textFaint }}><Trash2 className="w-4 h-4" /></button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3" style={{ color: COLORS.textDim }}>Dividen</h3>
        <Panel className="p-4 mb-3">
          <form onSubmit={submitDv} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <Field label="Kode Saham"><input className={inputCls} style={inputStyle()} placeholder="BBRI" value={dv.code} onChange={(e) => setDv({ ...dv, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Tgl Cum Date"><input type="date" className={inputCls} style={inputStyle()} value={dv.cumDate} onChange={(e) => setDv({ ...dv, cumDate: e.target.value })} /></Field>
            <Field label="Tgl Pembayaran"><input type="date" className={inputCls} style={inputStyle()} value={dv.payDate} onChange={(e) => setDv({ ...dv, payDate: e.target.value })} /></Field>
            <Field label="Dividen / Lembar"><input type="number" className={inputCls} style={inputStyle()} placeholder="150" value={dv.perShare} onChange={(e) => setDv({ ...dv, perShare: e.target.value })} /></Field>
            <Field label="Jumlah Lot"><input type="number" className={inputCls} style={inputStyle()} placeholder="10" value={dv.lot} onChange={(e) => setDv({ ...dv, lot: e.target.value })} /></Field>
            <Btn type="submit"><Plus className="w-4 h-4" /> Tambah</Btn>
          </form>
        </Panel>
        <Panel className="overflow-x-auto">
          {dvSorted.length === 0 ? <EmptyState text="Belum ada catatan dividen." /> : (
            <table className="w-full border-collapse min-w-[720px]">
              <thead><tr><Th>Kode</Th><Th>Cum Date</Th><Th>Tgl Bayar</Th><Th align="right">/Lembar</Th><Th align="right">Lot</Th><Th align="right">Total Bersih</Th><Th align="right"></Th></tr></thead>
              <tbody>
                {dvSorted.map((d) => (
                  <tr key={d.id} style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                    <Td className="font-semibold">{d.code}</Td>
                    <Td mono>{fmtDate(d.cumDate)}</Td>
                    <Td mono>{fmtDate(d.payDate)}</Td>
                    <Td align="right" mono>{rp(d.perShare)}</Td>
                    <Td align="right" mono>{d.lot}</Td>
                    <Td align="right" mono style={{ color: COLORS.profit }}>{rp(d.perShare * d.lot * 100)}</Td>
                    <Td align="right"><button onClick={() => onDeleteDividend(d.id)} style={{ color: COLORS.textFaint }}><Trash2 className="w-4 h-4" /></button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}
