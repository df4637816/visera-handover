import { test } from "node:test";
import assert from "node:assert/strict";
import { StorageEngine } from "../js/storage.js";
import { STATUS, UNASSIGNED, COMPLETED_COLUMN } from "../js/lots.js";

// Mock localStorage and fetch for Node environment
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(k) { return this.store[k] || null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
  clear() { this.store = {}; }
}
globalThis.localStorage = new MockLocalStorage();
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({
    version: 1,
    stations: [
      { id: "GETHA4", name: "GETHA4 蝕刻機台", order: 1 },
      { id: "GCOAT01", name: "GCOAT01 光阻塗布", order: 2 },
      { id: "HOLD", name: "Hold", order: 5 },
      { id: "COMPLETED", name: "Completed", order: 6 }
    ],
    lots: [
      {
        id: "lot-1",
        lot_id: "F94102.00",
        current_station: "HOLD",
        target_route: ["GETHA4", "HOLD"],
        status: "HELD",
        hold_reason: "Recipe review",
        tasks: []
      },
      {
        id: "lot-2",
        lot_id: "F93868.00",
        current_station: "GETHA4",
        target_route: ["GETHA4"],
        status: "IN_PROGRESS",
        tasks: []
      }
    ],
    handover_logs: []
  })
});

test("StorageEngine normalizes v1 seed data by purging HOLD/COMPLETED stations", async () => {
  localStorage.clear();
  const storage = new StorageEngine();
  await storage.init();
  const data = storage.getData();

  assert.equal(data.version, 2);
  const stationIds = data.stations.map((s) => s.id);
  assert.ok(!stationIds.includes("HOLD"), "HOLD station should be removed");
  assert.ok(!stationIds.includes("COMPLETED"), "COMPLETED station should be removed");

  const f94102 = data.lots.find((l) => l.lot_id === "F94102.00");
  assert.equal(f94102.current_station, "GETHA4", "Lot previously at HOLD station should revert to physical machine");
  assert.equal(f94102.status, STATUS.HELD);
});

test("StorageEngine addOrMergeParsedLot merges existing lots and creates new ones", async () => {
  const storage = new StorageEngine();
  await storage.init();

  // Merge existing lot
  const mergeResult = storage.addOrMergeParsedLot({
    lot_id: "F93868.00",
    priority: "HOT",
    target_route: ["GETHA4", "GCOAT01"],
    tasks: [{ name: "New Inspection Task", required: true, completed: false }],
    engineer_instructions: "Urgent check"
  });
  assert.equal(mergeResult.isMerged, true);
  const merged = storage.getData().lots.find((l) => l.lot_id === "F93868.00");
  assert.equal(merged.priority, "HOT");
  assert.ok(merged.tasks.some((t) => t.name === "New Inspection Task"));

  // Create new lot
  const createResult = storage.addOrMergeParsedLot({
    lot_id: "F99999.00",
    priority: "NORMAL",
    current_station: "GETHA4",
    target_route: ["GETHA4"],
    tasks: []
  });
  assert.equal(createResult.isMerged, false);
  const created = storage.getData().lots.find((l) => l.lot_id === "F99999.00");
  assert.ok(created);
});

test("StorageEngine archiveCompletedLots removes completed lots from active lots", async () => {
  const storage = new StorageEngine();
  await storage.init();

  const lot = storage.addLot({
    lot_id: "F88888.00",
    current_station: "GETHA4",
    status: STATUS.COMPLETED
  });
  assert.ok(storage.getData().lots.some((l) => l.lot_id === "F88888.00"));

  storage.archiveCompletedLots([lot]);
  assert.ok(!storage.getData().lots.some((l) => l.lot_id === "F88888.00"));
});
