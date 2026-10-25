import { test } from "node:test";
import assert from "node:assert/strict";
import { EmailParser } from "../js/parser.js";

const byId = (lots) => Object.fromEntries(lots.map((l) => [l.lot_id, l]));
const taskNames = (lot) => lot.tasks.map((t) => t.name).sort();

test("placeholder email from the UI parses into two lots with their own routes", () => {
  const text =
    "請協助將批號 F93868.00 push 到 GETHA4 蝕刻機台再 push 到 GCOAT01 coat 光阻\n" +
    "另外實驗控片 EMG08827.00 急件需量 CD-SEM (120nm) 與看 Macro 外觀與 OM 顯微";
  const lots = byId(EmailParser.parse(text));

  assert.deepEqual(Object.keys(lots).sort(), ["EMG08827.00", "F93868.00"]);
  assert.equal(lots["F93868.00"].category, "RD_PRODUCT");
  assert.equal(lots["F93868.00"].current_station, "GETHA4");
  assert.deepEqual(lots["F93868.00"].target_route, ["GETHA4", "GCOAT01"]);
  assert.equal(lots["EMG08827.00"].category, "MONITOR_WAFER");
  assert.equal(lots["EMG08827.00"].current_station, "CD-SEM");
});

test("inspection tasks stay with the lot whose line mentions them", () => {
  const text =
    "F93868.00 push GETHA4\n" +
    "EMG08827.00 量 CD-SEM 與 Macro";
  const lots = byId(EmailParser.parse(text));

  assert.deepEqual(taskNames(lots["F93868.00"]), ["Push GETHA4"]);
  assert.deepEqual(taskNames(lots["EMG08827.00"]), ["CD-SEM", "Macro"]);
});

test("priority keywords apply only to the lot on the same line", () => {
  const text =
    "F93868.00 push GETHA4，一般排程即可\n" +
    "F94102.00 急件，請先 push GCOAT01";
  const lots = byId(EmailParser.parse(text));

  assert.equal(lots["F93868.00"].priority, "NORMAL");
  assert.equal(lots["F94102.00"].priority, "HOT");
});

test("the word Photo does not mark a lot as HOT", () => {
  const [lot] = EmailParser.parse("F93868.00 進 Photo 區 GCOAT01 上光阻");
  assert.equal(lot.priority, "NORMAL");
});

test("a lowercase lot id still picks up its own line as the instruction", () => {
  const text = "大家好\nf93868.00 push GCOAT01 上光阻\n謝謝";
  const [lot] = EmailParser.parse(text);

  assert.equal(lot.lot_id, "F93868.00");
  assert.equal(lot.current_station, "GCOAT01");
  assert.equal(lot.engineer_instructions, "f93868.00 push GCOAT01 上光阻");
});

test("ordinary Chinese words are not mistaken for an engineer name", () => {
  const [lot] = EmailParser.parse("F93868.00 請於下班時間前 push GETHA4");
  assert.equal(lot.engineer, "郵件工程師");
});

test("an explicit sender line sets the engineer", () => {
  const [lot] = EmailParser.parse("寄件者: 王小明\nF93868.00 push GETHA4");
  assert.equal(lot.engineer, "王小明");
});

test("a machine that is not a board station routes to UNASSIGNED", () => {
  const known = ["GETHA4", "GCOAT01", "CD-SEM", "MACRO_OM", "HOLD", "COMPLETED"];
  const [lot] = EmailParser.parse("F93868.00 push GDEV02 顯影", { stationIds: known });
  assert.equal(lot.current_station, "UNASSIGNED");
});
