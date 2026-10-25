export const STATUS = Object.freeze({
  IN_PROGRESS: "IN_PROGRESS",
  HELD: "HELD",
  COMPLETED: "COMPLETED"
});

export const UNASSIGNED = "UNASSIGNED";
export const COMPLETED_COLUMN = "COMPLETED";

export const PRIORITY_RANK = Object.freeze({ NORMAL: 1, HOT: 2, SUPER_HOT: 3 });
export const PRIORITY_LABEL = Object.freeze({ NORMAL: "Normal", HOT: "Hot", SUPER_HOT: "Super Hot" });
export const CATEGORY_LABEL = Object.freeze({ RD_PRODUCT: "RD 產品", MONITOR_WAFER: "實驗控片" });
export const STATUS_LABEL = Object.freeze({ IN_PROGRESS: "進行中", HELD: "HOLD", COMPLETED: "已完成" });

const LEGACY_STATION_IDS = new Set(["HOLD", "COMPLETED"]);

export function higherPriority(a, b) {
  return (PRIORITY_RANK[a] || 0) >= (PRIORITY_RANK[b] || 0) ? a : b;
}

export function columnOf(lot) {
  return lot.status === STATUS.COMPLETED ? COMPLETED_COLUMN : lot.current_station;
}

export function stationName(stations, id) {
  if (id === UNASSIGNED) return "未分配站點";
  if (id === COMPLETED_COLUMN) return "本班已完成";
  return stations.find((s) => s.id === id)?.name || id;
}

// v1 data stored HOLD and COMPLETED as stations. A lot parked there has lost its
// machine, so recover the last real machine from its route.
function lastKnownStation(route, stationIds) {
  for (let i = route.length - 1; i >= 0; i--) {
    if (stationIds.includes(route[i])) return route[i];
  }
  return UNASSIGNED;
}

export function normalizeLot(lot, stationIds) {
  const route = Array.isArray(lot.target_route) ? lot.target_route : [];
  let status = Object.values(STATUS).includes(lot.status) ? lot.status : STATUS.IN_PROGRESS;
  let station = lot.current_station;

  if (station === "COMPLETED") {
    status = STATUS.COMPLETED;
    station = lastKnownStation(route, stationIds);
  } else if (station === "HOLD") {
    if (status !== STATUS.COMPLETED) status = STATUS.HELD;
    station = lastKnownStation(route, stationIds);
  } else if (!stationIds.includes(station)) {
    station = UNASSIGNED;
  }

  return {
    ...lot,
    lot_id: String(lot.lot_id || "").trim().toUpperCase(),
    category: CATEGORY_LABEL[lot.category] ? lot.category : "RD_PRODUCT",
    priority: PRIORITY_RANK[lot.priority] ? lot.priority : "NORMAL",
    current_station: station,
    target_route: route,
    status,
    hold_reason: status === STATUS.HELD ? lot.hold_reason || "" : "",
    tasks: Array.isArray(lot.tasks) ? lot.tasks : []
  };
}

export function normalizeDb(raw) {
  const stations = (raw?.stations || []).filter((s) => !LEGACY_STATION_IDS.has(s.id));
  const stationIds = stations.map((s) => s.id);
  return {
    ...raw,
    version: 2,
    stations,
    lots: (raw?.lots || []).map((lot) => normalizeLot(lot, stationIds)),
    handover_logs: raw?.handover_logs || []
  };
}

export function moveToColumn(lot, columnId, now) {
  if (columnId === COMPLETED_COLUMN) {
    return { ...lot, status: STATUS.COMPLETED, track_out_time: now, updated_at: now };
  }
  const reopened = lot.status === STATUS.COMPLETED;
  return {
    ...lot,
    current_station: columnId,
    status: reopened ? STATUS.IN_PROGRESS : lot.status,
    track_out_time: reopened ? null : lot.track_out_time,
    updated_at: now
  };
}

export function mergeParsedLot(existing, parsed, now) {
  const knownTasks = new Set(existing.tasks.map((t) => t.name));
  const newTasks = parsed.tasks.filter((t) => !knownTasks.has(t.name));
  const oldText = existing.engineer_instructions || "";
  const newText = parsed.engineer_instructions || "";
  const reopen = newTasks.length > 0 && existing.status === STATUS.COMPLETED;

  return {
    ...existing,
    priority: higherPriority(existing.priority, parsed.priority),
    target_route: [...new Set([...existing.target_route, ...parsed.target_route])],
    tasks: [...existing.tasks, ...newTasks],
    engineer_instructions: !newText || oldText.includes(newText) ? oldText : [oldText, newText].filter(Boolean).join("\n"),
    status: reopen ? STATUS.IN_PROGRESS : existing.status,
    track_out_time: reopen ? null : existing.track_out_time,
    updated_at: now
  };
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
