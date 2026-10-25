/* VisEra Shift Handover System - Smart Email Parser */

import { UNASSIGNED } from "./lots.js";

export class EmailParser {
  static parse(text, options = {}) {
    if (!text || typeof text !== "string") return [];

    const stationIds = options.stationIds || [];
    const lines = text.split(/\r?\n/);
    const results = [];

    // Fab Regular Expressions
    const LOT_RD_REGEX = /\b([A-Z]\d{5}\.\d{2})\b/gi;
    const LOT_MONITOR_REGEX = /\b(EMG\d{5}\.\d{2}|CK\d{5}\.\d{2}|MON\d{5}\.\d{2})\b/gi;
    const MACHINE_REGEX = /\b(GETHA\d+|GCOAT\d+|GDEV\d+|EXP\d+|LAM\d+)\b/gi;
    const CDSEM_REGEX = /CD-?SEM|Critical Dimension|尺寸量測/i;
    const MACRO_REGEX = /Macro|巨觀|外觀|外觀檢查/i;
    const OM_REGEX = /\bOM\b|光學顯微|顯微鏡/i;
    const THICKNESS_REGEX = /膜厚|Film Thickness|Ellipsometer/i;

    // Detect Global Engineer from explicit sender header if available
    let detectedEngineer = "郵件工程師";
    const explicitSenderMatch = text.match(/(?:From|寄件者|工程師|PIE|PE)[:：]\s*([^\r\n,，<]+)/i);
    if (explicitSenderMatch && explicitSenderMatch[1]) {
      detectedEngineer = explicitSenderMatch[1].trim();
    }

    // Scan for all unique Lot IDs
    const foundLots = new Map();

    // Check Monitor Wafers first
    let match;
    while ((match = LOT_MONITOR_REGEX.exec(text)) !== null) {
      const lotId = match[1].toUpperCase();
      if (!foundLots.has(lotId)) {
        foundLots.set(lotId, {
          lot_id: lotId,
          category: "MONITOR_WAFER",
          engineer: detectedEngineer
        });
      }
    }

    // Check RD Lots
    while ((match = LOT_RD_REGEX.exec(text)) !== null) {
      const lotId = match[1].toUpperCase();
      if (!foundLots.has(lotId)) {
        foundLots.set(lotId, {
          lot_id: lotId,
          category: "RD_PRODUCT",
          engineer: detectedEngineer
        });
      }
    }

    // For each lot, infer context from the paragraph/line it appears on
    foundLots.forEach((lot) => {
      // Find line containing this lot (case-insensitive)
      const lotLine = lines.find((l) => l.toUpperCase().includes(lot.lot_id)) || text;

      // Determine priority from this specific line; do not let other lines' hot pollute this lot
      let lotPriority = "NORMAL";
      if (/SUPER\s*HOT|特急|極急|大急/i.test(lotLine)) {
        lotPriority = "SUPER_HOT";
      } else if (/\bHOT\b|急件|優先/i.test(lotLine)) {
        lotPriority = "HOT";
      }
      lot.priority = lotPriority;

      // Detect machines mentioned near the lot
      const machines = [];
      let mMatch;
      const localMachineRegex = new RegExp(MACHINE_REGEX.source, "gi");
      while ((mMatch = localMachineRegex.exec(lotLine)) !== null) {
        machines.push(mMatch[1].toUpperCase());
      }

      // Default station
      if (machines.length > 0) {
        const rawStation = machines[0];
        lot.current_station = (stationIds.length === 0 || stationIds.includes(rawStation))
          ? rawStation
          : UNASSIGNED;
        lot.target_route = [...new Set(machines)];
      } else if (CDSEM_REGEX.test(lotLine)) {
        lot.current_station = "CD-SEM";
        lot.target_route = ["CD-SEM"];
      } else if (MACRO_REGEX.test(lotLine) || OM_REGEX.test(lotLine)) {
        lot.current_station = "MACRO_OM";
        lot.target_route = ["MACRO_OM"];
      } else {
        lot.current_station = (stationIds.length === 0 || stationIds.includes("GETHA4"))
          ? "GETHA4"
          : UNASSIGNED;
        lot.target_route = ["GETHA4"];
      }

      // Detect Tasks for THIS lot from its line
      const tasks = [];
      if (machines.length > 0) {
        machines.forEach((m) => {
          tasks.push({
            name: `Push ${m}`,
            required: true,
            completed: false,
            result_value: "",
            file_path: ""
          });
        });
      }
      if (CDSEM_REGEX.test(lotLine)) {
        tasks.push({
          name: "CD-SEM",
          required: true,
          completed: false,
          result_value: "",
          file_path: ""
        });
        if (!lot.target_route.includes("CD-SEM")) lot.target_route.push("CD-SEM");
      }
      if (MACRO_REGEX.test(lotLine)) {
        tasks.push({
          name: "Macro",
          required: true,
          completed: false,
          result_value: "",
          file_path: ""
        });
        if (!lot.target_route.includes("MACRO_OM")) lot.target_route.push("MACRO_OM");
      }
      if (OM_REGEX.test(lotLine)) {
        tasks.push({
          name: "OM",
          required: true,
          completed: false,
          result_value: "",
          file_path: ""
        });
        if (!lot.target_route.includes("MACRO_OM")) lot.target_route.push("MACRO_OM");
      }
      if (THICKNESS_REGEX.test(lotLine)) {
        tasks.push({
          name: "膜厚量測",
          required: true,
          completed: false,
          result_value: "",
          file_path: ""
        });
      }

      lot.tasks = tasks;
      lot.engineer_instructions = lotLine.trim().substring(0, 180);
      results.push(lot);
    });

    return results;
  }
}
