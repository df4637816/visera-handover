/* VisEra Shift Handover System - Kanban Module */

import { columnOf, stationName, escapeHtml, UNASSIGNED, COMPLETED_COLUMN, STATUS, PRIORITY_LABEL, CATEGORY_LABEL } from "./lots.js";

export class KanbanView {
  constructor(containerId, storage, onCardClick) {
    this.container = document.getElementById(containerId);
    this.storage = storage;
    this.onCardClick = onCardClick;
    this.filterQuery = "";
    this.categoryFilter = "ALL";
    this.priorityFilter = "ALL";
  }

  setFilters({ query, category, priority }) {
    if (query !== undefined) this.filterQuery = query.toLowerCase().trim();
    if (category !== undefined) this.categoryFilter = category;
    if (priority !== undefined) this.priorityFilter = priority;
    this.render();
  }

  render() {
    if (!this.container) return;
    const data = this.storage.getData();
    if (!data || !data.stations) return;

    this.container.innerHTML = "";
    const board = document.createElement("div");
    board.className = "kanban-board";

    // 1. Regular physical stations
    const activeStations = data.stations.filter((s) => s.id !== "HOLD" && s.id !== "COMPLETED");
    activeStations.forEach((station) => {
      board.appendChild(this.createColumn(station.id, station.name, data.lots));
    });

    // 2. UNASSIGNED column (appears only if there are lots in UNASSIGNED)
    const unassignedLots = data.lots.filter((l) => columnOf(l) === UNASSIGNED);
    if (unassignedLots.length > 0) {
      board.appendChild(this.createColumn(UNASSIGNED, "未分配站點", data.lots, true));
    }

    // 3. COMPLETED column (本班完成)
    board.appendChild(this.createColumn(COMPLETED_COLUMN, "本班已完成", data.lots, false, true));

    this.container.appendChild(board);
  }

  createColumn(columnId, columnName, allLots, isUnassigned = false, isCompleted = false) {
    const col = document.createElement("div");
    col.className = `kanban-column ${isUnassigned ? "col-unassigned" : ""} ${isCompleted ? "col-completed" : ""}`;
    col.dataset.columnId = columnId;

    // Filter lots for this column
    const columnLots = allLots.filter((lot) => {
      if (columnOf(lot) !== columnId) return false;
      if (this.categoryFilter !== "ALL" && lot.category !== this.categoryFilter) return false;
      if (this.priorityFilter !== "ALL" && lot.priority !== this.priorityFilter) return false;
      if (this.filterQuery) {
        const matchLotId = lot.lot_id.toLowerCase().includes(this.filterQuery);
        const matchEng = (lot.engineer || "").toLowerCase().includes(this.filterQuery);
        const matchInst = (lot.engineer_instructions || "").toLowerCase().includes(this.filterQuery);
        if (!matchLotId && !matchEng && !matchInst) return false;
      }
      return true;
    });

    // Column Header
    const header = document.createElement("div");
    header.className = "column-header";
    header.innerHTML = `
      <div class="column-title-group">
        <span class="column-name">${escapeHtml(columnName)}</span>
        <span class="column-badge">${columnLots.length}</span>
      </div>
    `;
    col.appendChild(header);

    // Cards Container
    const cardsContainer = document.createElement("div");
    cardsContainer.className = "column-cards-container";

    columnLots.forEach((lot) => {
      const card = this.createLotCard(lot);
      cardsContainer.appendChild(card);
    });

    col.appendChild(cardsContainer);

    // Drag & Drop Listeners
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      col.classList.add("drag-over");
    });

    col.addEventListener("dragleave", () => {
      col.classList.remove("drag-over");
    });

    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const lotId = e.dataTransfer.getData("text/plain");
      if (lotId) {
        this.storage.updateLotStation(lotId, columnId);
      }
    });

    return col;
  }

  createLotCard(lot) {
    const card = document.createElement("div");
    const priorityClass = lot.priority.toLowerCase().replace("_", "-");
    const isHeld = lot.status === STATUS.HELD;
    card.className = `lot-card priority-${priorityClass} ${isHeld ? "is-held" : ""}`;
    card.draggable = true;
    card.dataset.lotId = lot.id;

    const priorityLabel = PRIORITY_LABEL[lot.priority] || lot.priority;
    const categoryLabel = CATEGORY_LABEL[lot.category] || lot.category;

    // HOLD Badge / Banner
    const holdBannerHtml = isHeld
      ? `<div class="hold-banner">
           <span class="hold-dot"></span>
           <span class="hold-text">HOLD: ${escapeHtml(lot.hold_reason || "待工程師確認")}</span>
         </div>`
      : "";

    // Tasks Checklist HTML
    let tasksHtml = "";
    if (lot.tasks && lot.tasks.length > 0) {
      tasksHtml = `<div class="card-tasks">` +
        lot.tasks.map((t, idx) => `
          <div class="task-item">
            <span class="task-name-check">
              <span class="task-check-circle ${t.completed ? "done" : ""}"></span>
              <span class="task-name-text">${escapeHtml(t.name)}</span>
            </span>
            <input type="checkbox" class="task-quick-toggle" data-task-idx="${idx}" ${t.completed ? "checked" : ""} style="cursor:pointer;" />
          </div>
        `).join("") +
        `</div>`;
    }

    card.innerHTML = `
      <div class="card-top">
        <span class="lot-id">${escapeHtml(lot.lot_id)}</span>
        <span class="priority-tag ${priorityClass}">${priorityLabel}</span>
      </div>
      <div class="card-meta">
        <span class="category-tag">${categoryLabel}</span>
        <span class="engineer-name">${escapeHtml(lot.engineer || "")}</span>
      </div>
      ${holdBannerHtml}
      ${lot.engineer_instructions ? `<div class="card-instruction">${escapeHtml(lot.engineer_instructions)}</div>` : ""}
      ${tasksHtml}
      <div class="card-footer">
        <span class="operator-tag">${escapeHtml(lot.operator_id || "V_SYSTEM")}</span>
        <span class="time-tag">${this.formatTime(lot.updated_at || lot.created_at)}</span>
      </div>
    `;

    // Drag start
    card.addEventListener("dragstart", (e) => {
      card.classList.add("dragging");
      e.dataTransfer.setData("text/plain", lot.id);
      e.dataTransfer.effectAllowed = "move";
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
    });

    // Card click opens detail modal
    card.addEventListener("click", (e) => {
      if (e.target.classList.contains("task-quick-toggle")) {
        const taskIdx = parseInt(e.target.dataset.taskIdx, 10);
        lot.tasks[taskIdx].completed = e.target.checked;
        this.storage.updateLot(lot.id, { tasks: lot.tasks });
        e.stopPropagation();
        return;
      }
      if (this.onCardClick) {
        this.onCardClick(lot);
      }
    });

    return card;
  }

  formatTime(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
}
