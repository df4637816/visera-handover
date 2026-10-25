/* VisEra Shift Handover System - Handover Sign-off & Report Generator */

export class HandoverModule {
  constructor(storage, showToast) {
    this.storage = storage;
    this.showToast = showToast;
  }

  getMetrics() {
    const data = this.storage.getData();
    if (!data || !data.lots) {
      return { totalActive: 0, hotLots: 0, heldLots: 0, completedLots: 0 };
    }

    const activeLots = data.lots.filter((l) => l.status !== "COMPLETED");
    const hotLots = activeLots.filter((l) => l.priority === "HOT" || l.priority === "SUPER_HOT");
    const heldLots = activeLots.filter((l) => l.status === "HELD");
    const completedLots = data.lots.filter((l) => l.status === "COMPLETED");

    return {
      totalActive: activeLots.length,
      hotLots: hotLots.length,
      heldLots: heldLots.length,
      completedLots: completedLots.length,
      activeList: activeLots,
      hotList: hotLots,
      heldList: heldLots,
      completedList: completedLots
    };
  }

  generateReportText(outgoingOp, incomingOp, shiftType, notes) {
    const metrics = this.getMetrics();
    const nowStr = new Date().toLocaleString("zh-TW", { hour12: false });
    const shiftLabel = shiftType === "DAY_TO_NIGHT" ? "早班 轉 大夜班" : "大夜班 轉 早班";

    let text = `【采鈺科技 VisEra 晶圓製程交接日報】\n`;
    text += `交接時間：${nowStr}\n`;
    text += `班別交接：${shiftLabel}\n`;
    text += `交班人員工號：${outgoingOp} | 接班人員工號：${incomingOp}\n`;
    text += `--------------------------------------------------\n`;
    text += `【生產指標統整】\n`;
    text += `* 當前在線流轉批數：${metrics.totalActive} 批\n`;
    text += `* 急件列管（Hot / Super Hot）：${metrics.hotLots} 批\n`;
    text += `* 異常卡關（Hold）：${metrics.heldLots} 批\n`;
    text += `* 當班完成出站：${metrics.completedLots} 批\n\n`;

    if (metrics.hotList.length > 0) {
      text += `【重點列管急件（Hot Lots）】\n`;
      metrics.hotList.forEach((lot) => {
        text += `- 批號: ${lot.lot_id} [${lot.priority}] | 當前機台: ${lot.current_station} | 負責: ${lot.engineer}\n`;
        if (lot.engineer_instructions) {
          text += `  指示: ${lot.engineer_instructions}\n`;
        }
      });
      text += `\n`;
    }

    if (metrics.heldList.length > 0) {
      text += `【異常卡關批號（Held Lots）】\n`;
      metrics.heldList.forEach((lot) => {
        text += `- 批號: ${lot.lot_id} | 滯留站點: ${lot.current_station} | 卡關原因: ${lot.hold_reason || "待工程師確認"}\n`;
      });
      text += `\n`;
    }

    text += `【機台站點在線分佈】\n`;
    const data = this.storage.getData();
    data.stations.forEach((station) => {
      if (station.id === "COMPLETED") return;
      const lotsAtStation = metrics.activeList.filter((l) => l.current_station === station.id);
      if (lotsAtStation.length > 0) {
        const lotIds = lotsAtStation.map((l) => l.lot_id).join(", ");
        text += `* ${station.name} (${lotsAtStation.length} 批): ${lotIds}\n`;
      }
    });

    if (notes && notes.trim()) {
      text += `\n【交班特別備註】\n${notes.trim()}\n`;
    }

    text += `--------------------------------------------------\n`;
    text += `本紀錄已同步存檔於內部共用槽資料庫。\n`;

    return text;
  }

  async copyReportToClipboard(outgoingOp, incomingOp, shiftType, notes) {
    const reportText = this.generateReportText(outgoingOp, incomingOp, shiftType, notes);
    try {
      await navigator.clipboard.writeText(reportText);
      this.showToast("交接日報已複製至剪貼簿，可直接貼入 Email 或通訊軟體", "success");
      return true;
    } catch (err) {
      console.error("Clipboard copy failed", err);
      this.showToast("剪貼簿複製失敗，請手動複製", "error");
      return false;
    }
  }

  signOffHandover(outgoingOp, incomingOp, shiftType, notes) {
    const metrics = this.getMetrics();
    const log = this.storage.addHandoverLog({
      shift_date: new Date().toISOString().slice(0, 10),
      shift_type: shiftType,
      outgoing_operator: outgoingOp.trim(),
      incoming_operator: incomingOp.trim(),
      total_active_lots: metrics.totalActive,
      hot_lots_count: metrics.hotLots,
      held_lots_count: metrics.heldLots,
      completed_lots_count: metrics.completedLots,
      archived_completed_lot_ids: metrics.completedList.map((l) => l.lot_id),
      summary_notes: (notes || "").trim()
    });

    // Archive completed lots from active board (User decision A4)
    if (metrics.completedList.length > 0) {
      this.storage.archiveCompletedLots(metrics.completedList);
    }

    this.showToast(`班別交接雙簽紀錄已完成儲存！已封存 ${metrics.completedLots} 筆完成批號。`, "success");
    return log;
  }
}

