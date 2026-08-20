import type { DriveStep } from "driver.js";

export const dashboardTourSteps: DriveStep[] = [
  {
    element: '[data-tour="dashboard-card"]',
    popover: {
      title: "場次卡片",
      description: "每個活動場次都有一張獨立的卡片，一次掌握該場次目前的報名概況。",
    },
  },
  {
    element: '[data-tour="dashboard-basic-stats"]',
    popover: {
      title: "基本數據",
      description:
        "報名組數、總人數、開放報名上限、已錄取名額（超過名額會用紅框提醒）與已取消組數。",
    },
  },
  {
    element: '[data-tour="dashboard-category-stats"]',
    popover: {
      title: "依報名類別統計",
      description:
        "如果這個場次有設定報名類別（例如自搭帳篷／主辦搭設帳篷），這裡會分別列出每個類別各自的報名數、錄取數與名額。",
    },
  },
  {
    element: '[data-tour="dashboard-status-blocks"]',
    popover: {
      title: "審核與錄取結果",
      description: "依審核結果（審核中/審核通過/退回補件）與錄取結果（正取/備取/取消）分別統計筆數。",
    },
  },
  {
    element: '[data-tour="dashboard-payment-status"]',
    popover: {
      title: "繳費情況",
      description: "已完成/待繳費/無需繳費的筆數，以及目前已收金額與待收金額的總計。",
    },
  },
  {
    element: '[data-tour="dashboard-goto-review"]',
    popover: {
      title: "前往審核",
      description: "點這裡可以直接跳到這個場次的審核頁面，開始逐筆審核報名資料。",
    },
  },
  {
    element: '[data-tour="dashboard-activity-log"]',
    popover: {
      title: "異動紀錄",
      description: "展開可以看到這個場次最近的異動紀錄，包含是誰、何時做了什麼修改。",
    },
  },
];

export const reviewsTourSteps: DriveStep[] = [
  {
    element: '[data-tour="review-summary"]',
    popover: {
      title: "審核總覽",
      description:
        "顯示目前的總筆數、總人數、已錄取、已繳費、已取消，以及分組區域和睡袋自備/租借的統計。",
    },
  },
  {
    element: '[data-tour="review-filters"]',
    popover: {
      title: "搜尋與篩選",
      description:
        "可以用聯絡人姓名/電話搜尋，或依審核結果、錄取結果、取消狀態篩選；右側「查看欄位」可以自訂顯示哪些欄位。",
    },
  },
  {
    element: '[data-tour="review-export"]',
    popover: {
      title: "檔案下載",
      description:
        "可以匯出完整報名資料、收據開立用資料、報到使用資料或錄取名單，皆為 CSV 檔案，姓名/電話會依用途自動打碼。",
    },
  },
  {
    element: '[data-tour="review-table"]',
    popover: {
      title: "表格直接編輯",
      description:
        "審核結果、錄取結果、分組、睡袋數量、備註等欄位都可以直接在表格中點選或輸入修改，改完會自動儲存，不需要跳頁；「證明文件」欄位可以開啟浮層檢視文件並完成減免審核。",
    },
  },
  {
    element: '[data-tour="review-send-results"]',
    popover: {
      title: "寄送審核結果",
      description: "審核完成後，點這裡可以一次寄送審核結果通知信給所有正取/備取的報名者。",
    },
  },
];

export const paymentsTourSteps: DriveStep[] = [
  {
    element: '[data-tour="payment-page"]',
    popover: {
      title: "繳費核對",
      description: "這裡列出這個場次所有已提交報名的繳費狀態，方便核對款項。",
    },
  },
  {
    element: '[data-tour="payment-table"]',
    popover: {
      title: "繳費資訊",
      description:
        "可以看到每筆報名的繳費狀態、金額、繳費方式、繳費期限（逾期會標示「已逾期」）、轉帳後五碼與綠界交易編號。",
    },
  },
  {
    element: '[data-tour="payment-detail-link"]',
    popover: {
      title: "查看/核對",
      description: "點擊這裡可以進入該筆報名的詳細頁面，確認轉帳資訊或手動核對繳費狀態。",
    },
  },
];
