/* VisEra Shift Handover System - High Density Table View Module */

import { escapeHtml, PRIORITY_LABEL, CATEGORY_LABEL, STATUS_LABEL, STATUS } from "./lots.js";

export class TableView {
  constructor(containerId, storage, onRowClick) {
    this.container = document.getElementById(containerId);
    this.storage = storage;
    this.onRowClick = onRowClick;
    this.filterQuery = "";
    this.categoryFilter = "ALL";
    this.priorityFilter = "ALL";
    this.sortKey = "updated_at";
    this.sortAsc = false;
  }

  setFilters({ query, category, priority }) {
    if (query !== undefined) this.filterQuery = query.toLowerCase().trim();
    if (category !== undefined) this.categoryFilter = category;
    if (priority !== undefined) this.priorityFilter = priority;
    this.render();
  }

  setSort(key) {
    if (this.sortKey === key) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortKey = key;
      this.sortAsc = true;
    }
    this.render();
  }

  render() {
    if (!this.container) return;
    const data = this.storage.getData();
    if (!data || !data.lots) return;

    // Filter lots
    let lots = data.lots.filter((lot) => {
      if (this.categoryFilter !== "ALL" && lot.category !== this.categoryFilter) return false;
      if (this.priorityFilter !== "ALL" && lot.priority !== this.priorityFilter) return false;
      if (this.filterQuery) {
        const matchLot = lot.lot_id.toLowerCase().includes(this.filterQuery);
        const matchStation = (lot.current_station || "").toLowerCase().includes(this.filterQuery);
        const matchEng = (lot.engineer || "").toLowerCase().includes(this.filterQuery);
        if (!matchLot && !matchStation && !matchEng) return false;
      }
      return true;
    });

    // Sort lots
    lots.sort((a, b) => {
      let valA = a[this.sortKey] || "";
      let valB = b[this.sortKey] || "";
      if (this.sortKey === "priority") {
        const pOrder = { SUPER_HOT: 3, HOT: 2, NORMAL: 1 };
        valA = pOrder[a.priority] || 0;
        valB = pOrder[b.priority] || 0;
      }
      if (valA < valB) return this.sortAsc ? -1 : 1;
      if (valA > valB) return this.sortAsc ? 1 : -1;
      return 0;
    });

    this.container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th data-sort="lot_id">批號 (Lot ID) ${this.getSortIndicator("lot_id")}</th>
            <th data-sort="category">類別 ${this.getSortIndicator("category")}</th>
            <th data-sort="priority">優先級 ${this.getSortIndicator("priority")}</th>
            <th data-sort="current_station">當前站點 ${this.getSortIndicator("current_station")}</th>
            <th>工序進度</th>
            <th data-sort="engineer">負責工程師 ${this.getSortIndicator("engineer")}</th>
            <th data-sort="status">狀態 ${this.getSortIndicator("status")}</th>
            <th data-sort="operator_id">操作員 ${this.getSortIndicator("operator_id")}</th>
            <th data-sort="updated_at">更新時間 ${this.getSortIndicator("updated_at")}</th>
          </tr>
        </thead>
        <tbody>
          ${lots.map((lot) => this.renderRow(lot)).join("")}
        </tbody>
      </table>
    `;

    // Bind header sorting
    this.container.querySelectorAll("th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        this.setSort(th.dataset.sort);
      });
    });

    // Bind row click
    this.container.querySelectorAll("tbody tr").forEach((tr) => {
      tr.addEventListener("click", () => {
        const lotId = tr.dataset.lotId;
        const lot = data.lots.find((l) => l.id === lotId);
        if (lot && this.onRowClick) {
          this.onRowClick(lot);
        }
      });
    });
  }

  getSortIndicator(key) {
    if (this.sortKey !== key) return "";
    return this.sortAsc ? "▲" : "▼";
  }

  renderRow(lot) {
    const pClass = lot.priority.toLowerCase().replace("_", "-");
    const categoryLabel = CATEGORY_LABEL[lot.category] || lot.category;
    const priorityLabel = PRIORITY_LABEL[lot.priority] || lot.priority;

    const completedTasks = (lot.tasks || []).filter((t) => t.completed).length;
    const totalTasks = (lot.tasks || []).length;
    const taskProgress = totalTasks > 0 ? `${completedTasks}/${totalTasks} 項完成` : "-";

    let statusText = "進行中";
    let statusClass = "status-in-progress";
    if (lot.status === STATUS.HELD) {
      statusText = `HOLD (${lot.hold_reason || "待確認"})`;
      statusClass = "status-held";
    } else if (lot.status === STATUS.COMPLETED) {
      statusText = "已完成";
      statusClass = "status-completed";
    }

    return `
      <tr data-lot-id="${lot.id}" style="cursor: pointer;">
        <td style="font-family: var(--font-mono); font-weight: 700;">${escapeHtml(lot.lot_id)}</td>
        <td><span class="category-tag">${categoryLabel}</span></td>
        <td><span class="priority-tag ${pClass}">${priorityLabel}</span></td>
        <td><span class="route-step-badge">${escapeHtml(lot.current_station)}</span></td>
        <td><span class="task-progress-badge">${taskProgress}</span></td>
        <td>${escapeHtml(lot.engineer || "-")}</td>
        <td>
          <span class="status-cell ${statusClass}">
            ${escapeHtml(statusText)}
          </span>
        </td>
        <td style="font-family: var(--font-mono); font-size: 0.8rem;">${escapeHtml(lot.operator_id || "-")}</td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(lot.updated_at).toLocaleString("zh-TW", { hour12: false })}</td>
      </tr>
    `;
  }
}
