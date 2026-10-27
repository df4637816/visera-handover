# VisEra 晶圓製程交接與批號流轉平台設計系統規範 (`design.md`)

本設計規範文件（Design Specification）萃取自 Apple 旗艦介面工藝（精密圓角、空間層次、Spring Physics 物理阻尼）與 Samsung 即時機能遙測（Bento Grid 架構、Monospace 即時讀數標註、動態能量微光），並針對半導體晶圓廠潔淨室（Cleanroom / Fab）交接與黃光微影區（Photolithography Yellow Room）之高對比作業場景進行深度適配與工程收斂。

---

## 一、 核心設計哲學與潔淨室場景融合

### 1.1 Apple 視覺語彙：精密工藝與空間層次（Craftsmanship & Material Depth）
* **空間層次（Spatial Depth & Frosted Glass）**：頂部導航列與狀態列採用多層次毛玻璃（`backdrop-filter: blur(20px) saturate(180%)`），營造通透浮動感，讓視覺焦點集中於機台看板上流轉之生產批號卡片。
* **物理阻尼（Spring Physics）**：所有卡片懸停、拖曳位移、核取方塊反饋與彈窗展開皆捨棄生硬的線性動畫，全面採用具備初速爆發與尾端緩衝之非對稱貝茲曲線（`cubic-bezier(0.16, 1, 0.3, 1)`）。
* **結構化資訊圖塊（Bento Grid Architecture）**：將批號、優先級、機台站點、製程檢核清單與操作人員資訊封裝於精密非對稱圓角容器內，貫徹「一卡一核心資訊」原則。

### 1.2 Samsung 視覺語彙：機能實證與即時遙測（Telemetry & Tactical Utility）
* **即時遙測數據標註（Live Telemetry Overlays）**：在頂部快捷摘要區與卡片關鍵欄位全面導入等寬字體（Monospace），清晰傳遞批號 ID（例：`F93868.00`）、機台站點（例：`GETHA4`、`GCOAT01`）、作業時間與在線數量。
* **膠囊控制器（Pill Controls）**：視圖切換器（看板視圖 vs. 數據清單）與優先度標籤採用膠囊圓角（`border-radius: 9999px`），提供高容錯率且直覺之點擊操作。
* **能量微光與狀態感知（Spectrum & State Feedback）**：以琥珀金（Amber 500）、極限急件紅（Coral Red）與安全翡翠綠（Emerald Green）標記生產狀態，支援卡關（HOLD）警示橫幅與二次確認武裝按鈕（Armed Pulse）。

### 1.3 半導體潔淨室專用適配（Cleanroom & Yellow Room Ergonomics）
* **黃光微影區光譜（Yellow Room Compatibility）**：提供專用 500nm+ 波長截斷防感光護眼模式（`theme-yellow-room`），維持文字在特殊照明環境下的超高閱讀對比度。
* **寬螢幕自適應排版（No Horizontal Overflow）**：機台看板全域採用彈性 Flexbox 排版，在 1080p 至 4K 無塵室終端機上均可自動均分縮放，杜絕橫向 X 軸滾動條。

---

## 二、 色彩與材質設計系統（Color & Material Tokens）

系統採用語意化 CSS 變數（Semantic Tokens）統一管理明暗主題與潔淨室專用模式。

### 2.1 基礎語意變數（Base Semantic Tokens）

| Token 名稱 | 用途說明 | 暗色模式建議值 (Dark Default) | 亮色模式建議值 (Light Fallback) |
| :--- | :--- | :--- | :--- |
| `--background` | 頁面底層畫布與容器槽底 | `#09090b` (Zinc 950) | `#fafafa` (Zinc 50) |
| `--card` | 批號卡片、彈窗主體與視圖容器表面 | `#121216` (Elevated Dark) | `#ffffff` (Pure White) |
| `--foreground` | 主標題、批號 ID 與高優先級文字 | `#f4f4f5` (Zinc 100) | `#18181b` (Zinc 900) |
| `--muted-foreground` | 輔助說明、站點標籤與未選中狀態 | `#a1a1aa` (Zinc 400) | `#71717a` (Zinc 500) |
| `--border` | 容器邊框、分隔線與卡片描邊 | `rgba(255, 255, 255, 0.10)` | `rgba(0, 0, 0, 0.08)` |
| `--primary` | 主行動按鈕、選中態與琥珀急件亮色 | `#f59e0b` (Amber 500) | `#d97706` (Amber 600) |
| `--primary-foreground` | 主按鈕上方之反白文字 | `#09090b` | `#ffffff` |

### 2.2 潔淨室金屬材質與狀態漸層（Hardware & Telemetry Finishes）

| 材質名稱 | 金屬線性漸層代碼 | 邊框高光色 | 環境微光色 (`ambient-glow`) | 應用場景 |
| :--- | :--- | :--- | :--- | :--- |
| **沙漠鈦金 (Desert Titanium)** | `linear-gradient(135deg, #d6bfa7 0%, #8f7963 50%, #4a3e33 100%)` | `#ebd9c8` | `rgba(245, 158, 11, 0.28)` | 黃光區主題、HOT 警示標記 |
| **翡翠鈦綠 (Jade Green)** | `linear-gradient(135deg, #6ee7b7 0%, #047857 55%, #064e3b 100%)` | `#a7f3d0` | `rgba(16, 185, 129, 0.28)` | 完工簽核、任務通過標籤 |
| **曜石鈦黑 (Phantom Titanium)** | `linear-gradient(135deg, #52525b 0%, #27272a 50%, #09090b 100%)` | `#71717a` | `rgba(148, 163, 184, 0.22)` | 暗色畫布底槽、終端機黑底 |

### 2.3 優先度與狀態色彩系統

| 狀態類型 | 標籤色彩代碼 | 背景半透明填色 | 顯示文字與意涵 |
| :--- | :--- | :--- | :--- |
| **SUPER HOT** | `#ff3b30` / `#ff453a` (Dark) | `rgba(255, 59, 48, 0.12)` | 超急件：產線最高優先插單推動 |
| **HOT** | `#f59e0b` / `#ff9f0a` (Dark) | `rgba(245, 158, 11, 0.14)` | 急件：當班必續移轉之關鍵批號 |
| **NORMAL** | `#0071e3` / `#0a84ff` (Dark) | `rgba(0, 113, 227, 0.10)` | 常態流轉：標準工序推進批號 |
| **HOLD** | `#ff3b30` (警示橫幅) | `rgba(255, 59, 48, 0.10)` | 卡關待決：品質異常或待工程師指示 |
| **COMPLETED** | `#34c759` / `#30d158` (Dark) | `rgba(52, 199, 89, 0.12)` | 本班已完成：工序結束等待交接封存 |

---

## 三、 字體排印與階層系統（Typography Scale）

嚴格遵守無障礙與生產安全守則：**全系統最小字級不得低於 `12px`（`0.75rem`）**。

### 3.1 字體家族（Font Stacks）
* **無襯線主字體（Sans-Serif UI & Display）**：`-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "PingFang TC", "Noto Sans TC", sans-serif`
* **等寬數據字體（Monospace Telemetry）**：`"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace`（強制應用於批號 ID、站點代碼、時間戳記、操作員 ID 與計數膠囊）。

### 3.2 字級階層對照表

| 階層名稱 | CSS 字級 / 行高 | 字重 | 應用場景 |
| :--- | :--- | :--- | :--- |
| **Brand Title** | `1.15rem` (18.4px) / `1.2` | `700` 至 `800` | 頂部導航列系統品牌標誌 |
| **Section Title** | `1.05rem` (16.8px) / `1.3` | `700` | 彈窗標題、交接報表大標 |
| **Lot ID Heading** | `0.98rem` (15.7px) / `1.2` | `700` (Monospace) | 看板卡片上方之核心批號代碼 |
| **Column Title** | `0.92rem` (14.7px) / `1.2` | `700` | 看板各站點欄位標題 |
| **Body & Form Input**| `0.86rem` 至 `0.90rem` / `1.5` | `400` 至 `500` | 表單輸入框、按鈕文字、交接日報內文 |
| **Card Instruction** | `0.82rem` (13.1px) / `1.45` | `400` | 工程師交代文字兩行截斷預覽 |
| **Telemetry & Pill** | `0.75rem` (12.0px，最低底線) / `1.5` | `600` 至 `700` | 優先級膠囊、類別標籤、計數徽章、時間戳記 |

---

## 四、 版面網格與空間規範（Layout & Responsive Grid）

### 4.1 全局空間與圓角階層（Radius Hierarchy）
* **巨型看板與工作區外框**：`--radius-xl: 24px`（`rounded-3xl`）
* **機台看板欄位與彈窗主體**：`--radius-lg: 16px`（`rounded-2xl`）
* **批號卡片與內部表單區塊**：`--radius-md: 12px`
* **狀態徽章、核取圓圈與膠囊按鈕**：`--radius-full: 9999px`

### 4.2 機台看板彈性伸縮規範（Flexbox Responsive Engine）
* **看板容器**：`display: flex; gap: 14px; width: 100%; overflow-x: hidden; align-items: flex-start;`
* **站點欄位**：`flex: 1 1 0; min-width: 0;`。
  * 確保在 5 欄配置（`GETHA4`、`GCOAT01`、`GDEV01`、`未分配站點`、`本班已完成`）時，即便在不同螢幕寬度下皆能自適應均分，卡片文字自動換行，不向外溢出觸發瀏覽器水平捲軸。

---

## 五、 動畫與物理微互動規範（Motion & Micro-interactions）

### 5.1 緩動曲線與時間常數

```css
:root {
  /* Apple 標準彈簧阻尼曲線：用於卡片懸停、拖曳位移、面板切換 */
  --ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
  /* 環境光呼吸曲線：用於焦點光暈與狀態切換 */
  --ease-ambient: cubic-bezier(0.4, 0, 0.6, 1);
}
```

* **微互動回饋（Micro-feedback）**：`150ms` 至 `250ms` `--ease-spring`（按鈕懸停、核取圓點狀態變化）。
* **卡片懸停微浮動（Card Hover Elevation）**：`transform: translateY(-2px);`，搭配微金色環境邊框高光 `rgba(245, 158, 11, 0.35)`。
* **二階段確認按鈕（Armed Action State）**：危險操作（如刪除批號）點擊第一下進入「武裝狀態」（`.armed`），按鈕轉為高警示紅並觸發 `armPulse` 光圈動畫，4 秒無操作自動解除。

---

## 六、 核心元件規格與狀態定義（Component Specifications）

| 元件名稱 | 結構組成 | 互動狀態與行為 |
| :--- | :--- | :--- |
| **1. Frosted Navigation Bar** | 品牌標誌 + 4 組即時遙測膠囊 + 主功能操作按鈕 | 黏性固定置頂（`top: 0; z-index: 40`）；即時回報在線批數、HOT 數、HOLD 數與已完成數。 |
| **2. Tactical Toolbar** | 視圖切換器 + 搜尋欄 + 類別/優先級篩選 + 智慧轉入/新增按鈕 | 支援鍵盤輸入即時模糊過濾看板與清單；即時響應視圖平滑切換。 |
| **3. Kanban Lot Card** | 左側優先度飾條 + 批號 ID + 狀態橫幅 + 交代簡述 + 工序檢核表 + 人員時間 | 支援 HTML5 原生拖曳跨站點移轉；點擊卡片開啟全狀態生產履歷檢核表彈窗。 |
| **4. Traceability Modal** | 批號基礎資訊 + 4 道工序檢核勾選 + 推進站點選單 + HOLD 解除/鎖定 + 刪除武裝按鈕 | 支援鍵盤 `ESC` 鍵或點擊外部遮罩瞬間關閉；工序變更即時持久化至資料庫。 |
| **5. Email Parser Engine** | 郵件貼上輸入框 + 智慧正則預覽清單 + 衝突合併與新建識別徽章 | 精準單行上下文萃取，排除非關聯機台雜訊，未知機台自動歸入「未分配站點」。 |
| **6. Cleanroom Yellow Theme** | 黃光高對比模式切換器 + 500nm 波長色票對齊 | 一鍵切換高清晰防感光對比，適配無塵室黃光顯影區環境。 |

---

## 七、 工程實作與品質守則（Implementation Guardrails）

1. **強制變數綁定**：嚴禁在組件樣式中直接寫死明暗十六進位色碼，所有表面、邊框與文字必須綁定 `--background`、`--card`、`--foreground`、`--border` 與 `--primary`。
2. **禁止小於 12px 微字體**：嚴格禁止使用 `10px`、`11px` 或小於 `0.75rem` 的文字，確保無塵室作業人員穿戴無塵衣與防護面罩時能清晰辨識。
3. **GPU 硬體加速渲染**：高頻動態屬性僅使用 `transform` 與 `opacity`，杜絕觸發重排（Reflow）損耗效能。
4. **自動化驗證保證**：任何涉及領域邏輯、解析規則與樣式架構之變更，必須以 `node --test tests/` 通過所有回歸驗證。
