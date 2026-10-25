import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATUS,
  UNASSIGNED,
  COMPLETED_COLUMN,
  normalizeLot,
  normalizeDb,
  moveToColumn,
  mergeParsedLot,
  columnOf,
  escapeHtml
} from "../js/lots.js";

test("normalizeLot migrates legacy station HOLD to HELD status on machine", () => {
  const stationIds = ["GETHA4", "GCOAT01", "CD-SEM"];
  const legacy = {
    lot_id: "F94102.00",
    current_station: "HOLD",
    target_route: ["GETHA4", "HOLD"],
    status: "HELD",
    hold_reason: "Recipe review",
    tasks: []
  };
  const normalized = normalizeLot(legacy, stationIds);
  assert.equal(normalized.current_station, "GETHA4");
  assert.equal(normalized.status, STATUS.HELD);
  assert.equal(normalized.hold_reason, "Recipe review");
  assert.equal(columnOf(normalized), "GETHA4");
});

test("normalizeLot puts unknown machine into UNASSIGNED", () => {
  const stationIds = ["GETHA4", "GCOAT01"];
  const lot = {
    lot_id: "F95555.00",
    current_station: "GDEV02",
    target_route: ["GDEV02"],
    status: "IN_PROGRESS"
  };
  const normalized = normalizeLot(lot, stationIds);
  assert.equal(normalized.current_station, UNASSIGNED);
  assert.equal(columnOf(normalized), UNASSIGNED);
});

test("moveToColumn to COMPLETED updates status and track_out_time", () => {
  const lot = {
    lot_id: "F93868.00",
    current_station: "GETHA4",
    status: STATUS.IN_PROGRESS
  };
  const now = "2026-10-24T16:00:00Z";
  const moved = moveToColumn(lot, COMPLETED_COLUMN, now);
  assert.equal(moved.status, STATUS.COMPLETED);
  assert.equal(moved.track_out_time, now);
  assert.equal(columnOf(moved), COMPLETED_COLUMN);
});

test("mergeParsedLot adds new tasks and upgrades priority if parsed is higher", () => {
  const existing = {
    lot_id: "F93868.00",
    priority: "NORMAL",
    current_station: "GETHA4",
    target_route: ["GETHA4"],
    tasks: [{ name: "Push GETHA4", completed: true }],
    engineer_instructions: "Line 1",
    status: STATUS.IN_PROGRESS
  };
  const parsed = {
    lot_id: "F93868.00",
    priority: "HOT",
    target_route: ["GETHA4", "CD-SEM"],
    tasks: [
      { name: "Push GETHA4", completed: false },
      { name: "CD-SEM", completed: false }
    ],
    engineer_instructions: "Line 2"
  };
  const merged = mergeParsedLot(existing, parsed, "2026-10-24T16:10:00Z");
  assert.equal(merged.priority, "HOT");
  assert.deepEqual(merged.target_route, ["GETHA4", "CD-SEM"]);
  assert.equal(merged.tasks.length, 2);
  assert.equal(merged.tasks[0].completed, true);
  assert.equal(merged.tasks[1].name, "CD-SEM");
  assert.equal(merged.engineer_instructions, "Line 1\nLine 2");
});

test("escapeHtml escapes quotes and tags preventing HTML injection", () => {
  assert.equal(escapeHtml('6" wafer <test> & \'check\''), '6&quot; wafer &lt;test&gt; &amp; &#039;check&#039;');
});
