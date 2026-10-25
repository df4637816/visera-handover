/* VisEra Shift Handover System - Storage & Persistence Engine */

import { normalizeDb, normalizeLot, moveToColumn, mergeParsedLot, STATUS } from "./lots.js";

const STORAGE_KEY = "VISERA_HANDOVER_DATA";
const DEFAULT_FALLBACK_FILE = "data/handover_db.json";

export class StorageEngine {
  constructor() {
    this.data = null;
    this.fileHandle = null;
    this.lastUpdatedAt = null;
    this.listeners = [];
    this.pollInterval = null;
  }

  async init() {
    // 1. Try to load from localStorage first
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const raw = JSON.parse(cached);
        this.data = normalizeDb(raw);
        this.lastUpdatedAt = this.data.last_updated_at;
      } catch (err) {
        console.error("Failed to parse cached localStorage data", err);
      }
    }

    // 2. If no cache, fetch initial default JSON
    if (!this.data) {
      try {
        const res = await fetch(DEFAULT_FALLBACK_FILE);
        if (res.ok) {
          const raw = await res.json();
          this.data = normalizeDb(raw);
          this.lastUpdatedAt = this.data.last_updated_at;
          this.saveToLocalCache();
        }
      } catch (err) {
        console.warn("Could not fetch default data/handover_db.json, creating skeleton state", err);
        this.data = this.createSkeletonState();
      }
    }

    // 3. Start auto-poll check every 60s
    this.startPolling();
    return this.data;
  }

  createSkeletonState() {
    return {
      version: 2,
      last_updated_at: new Date().toISOString(),
      stations: [
        { id: "GETHA4", name: "GETHA4 蝕刻機台", area: "Etch", order: 1 },
        { id: "GCOAT01", name: "GCOAT01 光阻塗布", area: "Photo", order: 2 },
        { id: "CD-SEM", name: "CD-SEM 尺寸量測", area: "Metrology", order: 3 },
        { id: "MACRO_OM", name: "Macro / OM 顯微檢驗", area: "Inspection", order: 4 }
      ],
      lots: [],
      handover_logs: []
    };
  }

  getData() {
    return this.data;
  }

  getStationIds() {
    return (this.data?.stations || []).map((s) => s.id);
  }

  subscribe(listener) {
    this.listeners.push(listener);
  }

  notify() {
    this.listeners.forEach((fn) => fn(this.data));
  }

  saveToLocalCache() {
    if (this.data) {
      this.data.last_updated_at = new Date().toISOString();
      this.lastUpdatedAt = this.data.last_updated_at;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    }
  }

  async save() {
    this.saveToLocalCache();

    // If File System Access API is connected, save directly to physical file
    if (this.fileHandle) {
      try {
        const writable = await this.fileHandle.createWritable();
        await writable.write(JSON.stringify(this.data, null, 2));
        await writable.close();
      } catch (err) {
        console.error("Failed to write to fileHandle", err);
        throw err;
      }
    }

    this.notify();
  }

  // Connect to shared folder JSON via File System Access API
  async connectSharedFile() {
    if ("showOpenFilePicker" in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [
            {
              description: "JSON Database File",
              accept: { "application/json": [".json"] }
            }
          ]
        });
        this.fileHandle = handle;
        const file = await handle.getFile();
        const text = await file.text();
        const raw = JSON.parse(text);
        this.data = normalizeDb(raw);
        this.lastUpdatedAt = this.data.last_updated_at;
        this.saveToLocalCache();
        this.notify();
        return { success: true, filename: handle.name };
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("File selection error", err);
        }
        return { success: false, error: err.message };
      }
    } else {
      return { success: false, error: "Browser does not support File System Access API" };
    }
  }

  // Export database as JSON file for manual backup
  exportDatabase() {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(this.data, null, 2))}`;
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonString);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadAnchor.setAttribute("download", `visera_handover_db_${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  // Import database from user-selected JSON file
  importDatabase(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (parsed && parsed.lots) {
            this.data = normalizeDb(parsed);
            this.save();
            resolve(true);
          } else {
            reject(new Error("Invalid database schema"));
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(async () => {
      if (this.fileHandle) {
        try {
          const file = await this.fileHandle.getFile();
          const text = await file.text();
          const diskData = JSON.parse(text);
          if (diskData.last_updated_at !== this.lastUpdatedAt) {
            console.log("Shared file updated by another station. Refreshing...");
            this.data = normalizeDb(diskData);
            this.lastUpdatedAt = diskData.last_updated_at;
            this.saveToLocalCache();
            this.notify();
          }
        } catch (err) {
          console.warn("Background poll error", err);
        }
      }
    }, 60000);
  }

  // Lot operations
  addLot(lotData) {
    const now = new Date().toISOString();
    const rawLot = {
      id: `lot-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      lot_id: lotData.lot_id,
      category: lotData.category || "RD_PRODUCT",
      priority: lotData.priority || "NORMAL",
      current_station: lotData.current_station || "GETHA4",
      target_route: lotData.target_route || [lotData.current_station || "GETHA4"],
      status: lotData.status || "IN_PROGRESS",
      hold_reason: lotData.hold_reason || "",
      engineer: lotData.engineer || "未指定工程師",
      engineer_instructions: lotData.engineer_instructions || "",
      tasks: lotData.tasks || [],
      operator_id: lotData.operator_id || "V_SYSTEM",
      track_in_time: lotData.track_in_time || now,
      track_out_time: lotData.track_out_time || null,
      shift: lotData.shift || "DAY",
      created_at: now,
      updated_at: now
    };
    const newLot = normalizeLot(rawLot, this.getStationIds());
    this.data.lots.push(newLot);
    this.save();
    return newLot;
  }

  // Merge or add parsed lot (User decision A5)
  addOrMergeParsedLot(parsedLot) {
    const existingIndex = this.data.lots.findIndex(
      (l) => l.lot_id.toUpperCase() === parsedLot.lot_id.toUpperCase()
    );
    const now = new Date().toISOString();
    if (existingIndex !== -1) {
      const merged = mergeParsedLot(this.data.lots[existingIndex], parsedLot, now);
      this.data.lots[existingIndex] = normalizeLot(merged, this.getStationIds());
      this.save();
      return { lot: this.data.lots[existingIndex], isMerged: true };
    } else {
      const created = this.addLot(parsedLot);
      return { lot: created, isMerged: false };
    }
  }

  updateLot(lotId, updates) {
    const index = this.data.lots.findIndex((l) => l.id === lotId);
    if (index !== -1) {
      const now = new Date().toISOString();
      const updated = {
        ...this.data.lots[index],
        ...updates,
        updated_at: now
      };
      this.data.lots[index] = normalizeLot(updated, this.getStationIds());
      this.save();
      return this.data.lots[index];
    }
    return null;
  }

  deleteLot(lotId) {
    this.data.lots = this.data.lots.filter((l) => l.id !== lotId);
    this.save();
  }

  updateLotStation(lotId, newColumn) {
    const lot = this.data.lots.find((l) => l.id === lotId);
    if (lot) {
      const moved = moveToColumn(lot, newColumn, new Date().toISOString());
      Object.assign(lot, moved);
      this.save();
    }
  }

  // Archive completed lots after sign-off (User decision A4)
  archiveCompletedLots(completedLots) {
    const completedIds = new Set(completedLots.map((l) => l.id));
    this.data.lots = this.data.lots.filter((l) => !completedIds.has(l.id));
    this.save();
  }

  addHandoverLog(logData) {
    const log = {
      id: `log-${Date.now()}`,
      ...logData,
      sign_off_timestamp: new Date().toISOString()
    };
    this.data.handover_logs.unshift(log);
    this.save();
    return log;
  }
}
