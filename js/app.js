/* VisEra Shift Handover System - Main Application Orchestrator */

import { StorageEngine } from "./storage.js";
import { EmailParser } from "./parser.js";
import { KanbanView } from "./kanban.js";
import { TableView } from "./table.js";
import { HandoverModule } from "./handover.js";
import { escapeHtml, PRIORITY_LABEL, CATEGORY_LABEL, STATUS } from "./lots.js";

class App {
  constructor() {
    this.storage = new StorageEngine();
    this.handover = new HandoverModule(this.storage, (msg, type) => this.showToast(msg, type));
    this.currentView = "kanban";
    this.activeLot = null;
    this.parsedCandidates = [];
  }

  async init() {
    await this.storage.init();

    this.kanbanView = new KanbanView("kanban-container", this.storage, (lot) => this.openLotModal(lot));
    this.tableView = new TableView("table-container", this.storage, (lot) => this.openLotModal(lot));

    this.initEventListeners();
    this.updateMetrics();
    this.renderActiveView();

    // Re-render when storage notifies update
    this.storage.subscribe(() => {
      this.updateMetrics();
      this.renderActiveView();
    });
  }

  renderActiveView() {
    if (this.currentView === "kanban") {
      document.getElementById("kanban-container").style.display = "block";
      document.getElementById("table-container").style.display = "none";
      this.kanbanView.render();
    } else {
      document.getElementById("kanban-container").style.display = "none";
      document.getElementById("table-container").style.display = "block";
      this.tableView.render();
    }
  }

  updateMetrics() {
    const metrics = this.handover.getMetrics();
    const activeEl = document.getElementById("metric-active-val");
    const hotEl = document.getElementById("metric-hot-val");
    const holdEl = document.getElementById("metric-hold-val");
    const doneEl = document.getElementById("metric-done-val");

    if (activeEl) activeEl.textContent = metrics.totalActive;
    if (hotEl) hotEl.textContent = metrics.hotLots;
    if (holdEl) holdEl.textContent = metrics.heldLots;
    if (doneEl) doneEl.textContent = metrics.completedLots;
  }

  initEventListeners() {
    // View Switcher
    const kanbanBtn = document.getElementById("btn-view-kanban");
    const tableBtn = document.getElementById("btn-view-table");

    if (kanbanBtn && tableBtn) {
      kanbanBtn.addEventListener("click", () => {
        this.currentView = "kanban";
        kanbanBtn.classList.add("active");
        tableBtn.classList.remove("active");
        this.renderActiveView();
      });

      tableBtn.addEventListener("click", () => {
        this.currentView = "table";
        tableBtn.classList.add("active");
        kanbanBtn.classList.remove("active");
        this.renderActiveView();
      });
    }

    // Cleanroom Theme Toggle
    const themeBtn = document.getElementById("btn-theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        document.body.classList.toggle("theme-yellow-room");
        const isYellow = document.body.classList.contains("theme-yellow-room");
        themeBtn.textContent = isYellow ? "黃光區模式 (已啟用)" : "黃光區高對比模式";
        this.showToast(isYellow ? "已切換至黃光微影區高對比明亮模式" : "已切換回標準科技模式", "info");
      });
    }

    // Connect to Shared Drive File
    const connectBtn = document.getElementById("btn-connect-shared");
    if (connectBtn) {
      connectBtn.addEventListener("click", async () => {
        const res = await this.storage.connectSharedFile();
        if (res.success) {
          this.showToast(`已成功掛載共享磁碟檔案：${res.filename}`, "success");
        } else if (res.error) {
          this.showToast(`掛載提示：${res.error}`, "warning");
        }
      });
    }

    // Search and Filters
    const searchInput = document.getElementById("search-input");
    const categorySelect = document.getElementById("filter-category");
    const prioritySelect = document.getElementById("filter-priority");

    const onFilterChange = () => {
      const filters = {
        query: searchInput ? searchInput.value : "",
        category: categorySelect ? categorySelect.value : "ALL",
        priority: prioritySelect ? prioritySelect.value : "ALL"
      };
      this.kanbanView.setFilters(filters);
      this.tableView.setFilters(filters);
    };

    if (searchInput) searchInput.addEventListener("input", onFilterChange);
    if (categorySelect) categorySelect.addEventListener("change", onFilterChange);
    if (prioritySelect) prioritySelect.addEventListener("change", onFilterChange);

    // Escape key & Outside click handler for ALL modals
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open"));
      }
    });

    document.querySelectorAll(".modal-overlay").forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.remove("open");
        }
      });
    });

    // Smart Parser Modal Triggers
    const parserBtn = document.getElementById("btn-open-parser");
    const parserModal = document.getElementById("modal-parser");
    const parserClose = document.getElementById("btn-close-parser");
    const parserCancel = document.getElementById("btn-cancel-parser");

    if (parserBtn && parserModal) {
      parserBtn.addEventListener("click", () => {
        document.getElementById("parser-input").value = "";
        document.getElementById("parser-preview-container").innerHTML = "";
        this.parsedCandidates = [];
        parserModal.classList.add("open");
      });
    }

    const closeParser = () => parserModal && parserModal.classList.remove("open");
    if (parserClose) parserClose.addEventListener("click", closeParser);
    if (parserCancel) parserCancel.addEventListener("click", closeParser);

    // Smart Parser Execute Parse
    const parseExecBtn = document.getElementById("btn-exec-parse");
    if (parseExecBtn) {
      parseExecBtn.addEventListener("click", () => {
        const text = document.getElementById("parser-input").value;
        this.parsedCandidates = EmailParser.parse(text, {
          stationIds: this.storage.getStationIds()
        });
        this.renderParserPreview();
      });
    }

    // Smart Parser Commit Batch (Merging existing lots per decision A5)
    const parseCommitBtn = document.getElementById("btn-commit-parsed");
    if (parseCommitBtn) {
      parseCommitBtn.addEventListener("click", () => {
        if (this.parsedCandidates.length === 0) {
          this.showToast("尚無解析完成的批號資料", "warning");
          return;
        }
        let mergedCount = 0;
        let createdCount = 0;
        this.parsedCandidates.forEach((lot) => {
          const res = this.storage.addOrMergeParsedLot(lot);
          if (res.isMerged) mergedCount++;
          else createdCount++;
        });
        closeParser();
        this.showToast(`已建立 ${createdCount} 筆新批號，合併更新 ${mergedCount} 筆既有批號！`, "success");
      });
    }

    // Shift Handover Modal Triggers
    const handoverBtn = document.getElementById("btn-open-handover");
    const handoverModal = document.getElementById("modal-handover");
    const handoverClose = document.getElementById("btn-close-handover");
    const handoverCancel = document.getElementById("btn-cancel-handover");

    if (handoverBtn && handoverModal) {
      handoverBtn.addEventListener("click", () => {
        this.populateHandoverModal();
        handoverModal.classList.add("open");
      });
    }

    const closeHandover = () => handoverModal && handoverModal.classList.remove("open");
    if (handoverClose) handoverClose.addEventListener("click", closeHandover);
    if (handoverCancel) handoverCancel.addEventListener("click", closeHandover);

    // Handover Copy Email Button
    const copyReportBtn = document.getElementById("btn-copy-report");
    if (copyReportBtn) {
      copyReportBtn.addEventListener("click", () => {
        const outOp = document.getElementById("handover-outgoing-op").value || "V_SYSTEM";
        const inOp = document.getElementById("handover-incoming-op").value || "V_PENDING";
        const sType = document.getElementById("handover-shift-type").value;
        const notes = document.getElementById("handover-notes").value;
        this.handover.copyReportToClipboard(outOp, inOp, sType, notes);
      });
    }

    // Handover Sign Off Submit
    const signOffBtn = document.getElementById("btn-submit-signoff");
    if (signOffBtn) {
      signOffBtn.addEventListener("click", () => {
        const outOp = document.getElementById("handover-outgoing-op").value;
        const inOp = document.getElementById("handover-incoming-op").value;
        const sType = document.getElementById("handover-shift-type").value;
        const notes = document.getElementById("handover-notes").value;

        if (!outOp || !inOp) {
          this.showToast("交班人員與接班人員工號均為必填項目", "error");
          return;
        }

        this.handover.signOffHandover(outOp, inOp, sType, notes);
        closeHandover();
      });
    }

    // Lot Detail Traceability Modal Bindings
    const lotModal = document.getElementById("modal-lot-detail");
    const lotClose = document.getElementById("btn-close-lot");
    const lotCancel = document.getElementById("btn-cancel-lot");

    const closeLotModal = () => lotModal && lotModal.classList.remove("open");
    if (lotClose) lotClose.addEventListener("click", closeLotModal);
    if (lotCancel) lotCancel.addEventListener("click", closeLotModal);

    // Lot Save
    const lotSaveBtn = document.getElementById("btn-save-lot");
    if (lotSaveBtn) {
      lotSaveBtn.addEventListener("click", () => {
        const saved = this.saveLotFromModal();
        if (saved) {
          closeLotModal();
        }
      });
    }

    // Lot Delete
    const lotDeleteBtn = document.getElementById("btn-delete-lot");
    if (lotDeleteBtn) {
      lotDeleteBtn.addEventListener("click", () => {
        if (!this.activeLot) return;
        if (confirm(`確定刪除批號 ${this.activeLot.lot_id} 嗎？此操作不可復原。`)) {
          this.storage.deleteLot(this.activeLot.id);
          closeLotModal();
          this.showToast(`批號 ${this.activeLot.lot_id} 已刪除`, "info");
        }
      });
    }

    // Add Task Item in Lot Modal
    const addTaskBtn = document.getElementById("btn-add-task-item");
    if (addTaskBtn) {
      addTaskBtn.addEventListener("click", () => {
        this.appendTaskRow({ name: "新量測/工序項目", required: true, completed: false, result_value: "", file_path: "" });
      });
    }

    // Manual New Lot Button
    const newLotBtn = document.getElementById("btn-new-lot");
    if (newLotBtn) {
      newLotBtn.addEventListener("click", () => {
        const defaultLot = {
          id: null,
          lot_id: "F" + Math.floor(10000 + Math.random() * 90000) + ".00",
          category: "RD_PRODUCT",
          priority: "NORMAL",
          current_station: "GETHA4",
          target_route: ["GETHA4"],
          status: "IN_PROGRESS",
          hold_reason: "",
          engineer: "製程工程師",
          engineer_instructions: "",
          tasks: [
            { name: "Push GETHA4", required: true, completed: false, result_value: "", file_path: "" }
          ],
          operator_id: "V10492"
        };
        this.openLotModal(defaultLot);
      });
    }
  }

  renderParserPreview() {
    const container = document.getElementById("parser-preview-container");
    if (!container) return;

    if (this.parsedCandidates.length === 0) {
      container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 12px; text-align: center;">未能從輸入文字中偵測出符合規格的批號格式</div>`;
      return;
    }

    const existingLots = this.storage.getData()?.lots || [];
    const existingMap = new Map(existingLots.map((l) => [l.lot_id.toUpperCase(), l]));

    let html = `
      <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 8px; color: var(--text-primary);">
        解析完成：成功擷取 ${this.parsedCandidates.length} 筆批號任務
      </div>
      <table class="data-table" style="font-size: 0.8rem;">
        <thead>
          <tr>
            <th>批號</th>
            <th>動作狀態</th>
            <th>類別</th>
            <th>優先級</th>
            <th>初始站點</th>
            <th>檢驗項目</th>
            <th>負責人</th>
          </tr>
        </thead>
        <tbody>
    `;

    this.parsedCandidates.forEach((lot) => {
      const isExisting = existingMap.has(lot.lot_id.toUpperCase());
      const taskNames = (lot.tasks || []).map((t) => t.name).join(", ") || "無";
      const actionBadge = isExisting
        ? `<span class="badge-merge">即將合併既有卡片</span>`
        : `<span class="badge-create">新建卡片</span>`;

      html += `
        <tr>
          <td style="font-family: var(--font-mono); font-weight:700;">${escapeHtml(lot.lot_id)}</td>
          <td>${actionBadge}</td>
          <td>${escapeHtml(CATEGORY_LABEL[lot.category] || lot.category)}</td>
          <td><span class="priority-tag ${lot.priority.toLowerCase().replace("_", "-")}">${escapeHtml(PRIORITY_LABEL[lot.priority] || lot.priority)}</span></td>
          <td>${escapeHtml(lot.current_station)}</td>
          <td>${escapeHtml(taskNames)}</td>
          <td>${escapeHtml(lot.engineer)}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  populateHandoverModal() {
    const metrics = this.handover.getMetrics();
    document.getElementById("handover-summary-badge").textContent =
      `當前在線: ${metrics.totalActive} 批 | 急件: ${metrics.hotLots} 批 | Hold: ${metrics.heldLots} 批 | 本班完成: ${metrics.completedLots} 批`;
  }

  openLotModal(lot) {
    this.activeLot = lot;
    const modal = document.getElementById("modal-lot-detail");
    if (!modal) return;

    document.getElementById("lot-edit-id").value = lot.lot_id || "";
    document.getElementById("lot-edit-category").value = lot.category || "RD_PRODUCT";
    document.getElementById("lot-edit-priority").value = lot.priority || "NORMAL";
    document.getElementById("lot-edit-station").value = lot.current_station || "GETHA4";
    document.getElementById("lot-edit-status").value = lot.status || "IN_PROGRESS";
    document.getElementById("lot-edit-hold-reason").value = lot.hold_reason || "";
    document.getElementById("lot-edit-engineer").value = lot.engineer || "";
    document.getElementById("lot-edit-instructions").value = lot.engineer_instructions || "";
    document.getElementById("lot-edit-operator").value = lot.operator_id || "";

    // Render Tasks Checklist in modal
    const taskListContainer = document.getElementById("lot-task-items-container");
    taskListContainer.innerHTML = "";
    if (lot.tasks && lot.tasks.length > 0) {
      lot.tasks.forEach((task) => this.appendTaskRow(task));
    }

    modal.classList.add("open");
  }

  appendTaskRow(task) {
    const container = document.getElementById("lot-task-items-container");
    const row = document.createElement("div");
    row.className = "task-edit-row";
    row.style = "display: flex; gap: 8px; align-items: center; margin-bottom: 8px;";
    
    // Safely create inputs to prevent quote truncation
    const checkEl = document.createElement("input");
    checkEl.type = "checkbox";
    checkEl.className = "task-row-completed";
    checkEl.checked = !!task.completed;
    checkEl.style.cursor = "pointer";

    const nameEl = document.createElement("input");
    nameEl.type = "text";
    nameEl.className = "form-input task-row-name";
    nameEl.value = task.name || "";
    nameEl.placeholder = "工序/量測項目名稱";
    nameEl.style.cssText = "flex: 2; padding: 6px 10px; font-size: 0.85rem;";

    const valEl = document.createElement("input");
    valEl.type = "text";
    valEl.className = "form-input task-row-val";
    valEl.value = task.result_value || "";
    valEl.placeholder = "實測數值 (例: 120.4nm)";
    valEl.style.cssText = "flex: 2; padding: 6px 10px; font-size: 0.85rem;";

    const fileEl = document.createElement("input");
    fileEl.type = "text";
    fileEl.className = "form-input task-row-file";
    fileEl.value = task.file_path || "";
    fileEl.placeholder = "檔案路徑連結";
    fileEl.style.cssText = "flex: 2; padding: 6px 10px; font-size: 0.85rem;";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-secondary task-row-remove";
    removeBtn.style.cssText = "padding: 4px 8px; font-size: 0.75rem; color: var(--danger);";
    removeBtn.innerHTML = "&times;";
    removeBtn.addEventListener("click", () => row.remove());

    row.appendChild(checkEl);
    row.appendChild(nameEl);
    row.appendChild(valEl);
    row.appendChild(fileEl);
    row.appendChild(removeBtn);

    container.appendChild(row);
  }

  saveLotFromModal() {
    const lotIdVal = document.getElementById("lot-edit-id").value.trim().toUpperCase();
    if (!lotIdVal) {
      this.showToast("批號不可為空白", "error");
      return false;
    }

    // Collect tasks from DOM rows using DOM properties directly
    const tasks = [];
    document.querySelectorAll("#lot-task-items-container .task-edit-row").forEach((row) => {
      const name = row.querySelector(".task-row-name").value.trim();
      if (name) {
        tasks.push({
          name,
          required: true,
          completed: row.querySelector(".task-row-completed").checked,
          result_value: row.querySelector(".task-row-val").value.trim(),
          file_path: row.querySelector(".task-row-file").value.trim()
        });
      }
    });

    const lotPayload = {
      lot_id: lotIdVal,
      category: document.getElementById("lot-edit-category").value,
      priority: document.getElementById("lot-edit-priority").value,
      current_station: document.getElementById("lot-edit-station").value,
      status: document.getElementById("lot-edit-status").value,
      hold_reason: document.getElementById("lot-edit-hold-reason").value.trim(),
      engineer: document.getElementById("lot-edit-engineer").value.trim(),
      engineer_instructions: document.getElementById("lot-edit-instructions").value.trim(),
      operator_id: document.getElementById("lot-edit-operator").value.trim(),
      tasks
    };

    if (this.activeLot && this.activeLot.id) {
      this.storage.updateLot(this.activeLot.id, lotPayload);
      this.showToast(`批號 ${lotIdVal} 履歷與設定已儲存`, "success");
    } else {
      this.storage.addLot(lotPayload);
      this.showToast(`批號 ${lotIdVal} 已成功建立`, "success");
    }
    return true;
  }

  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }
}

// Bootstrap application on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.init();
});
