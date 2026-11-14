# 📋 NPI Project Tracker

A modern, local-first **New Product Introduction (NPI) Hardware Project Management** web application designed for semiconductor hardware design engineers to track projects, hardware deliverables, 5-day workweek schedules, suppliers, and end-to-end commercial & hardware delivery pipelines.

> **Author:** [Pacca1214](https://github.com/pacca1412)

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Quick Installation](#-quick-installation)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

**NPI Project Tracker** streamlines daily project tracking for hardware design engineers working on PCB load boards, test sockets, and handler change kits. All data is persisted locally in your browser using **IndexedDB (Dexie.js)**—requiring zero backend setup, external servers, or cloud subscriptions—while providing instant JSON backup/restore and multi-sheet Excel (`.xlsx`) reporting.

---

## ✨ Key Features

- **📅 Interactive 5-Day Workweek Calendar & Outlook-Style Mini Calendar**
  - Visualizes tasks and milestones across customizable 1–10 workweek horizons (`WWxx`, Monday–Friday).
  - Supports **Drag & Drop** date rescheduling plus **Copy, Cut & Paste** (`Ctrl+C`, `Ctrl+X`, `Ctrl+V`) to duplicate or move items across dates.
  - Includes a synchronized 2-month light-theme mini calendar that highlights active workweeks and allows one-click week navigation.
- **🌿 Project & Deliverable Branch Hierarchy**
  - Organizes hardware deliverables (PCB Development, Test Socket Development, Handler Kit Development) as visual tree branches (`├─` / `└─`) under each main NPI project.
  - Tracks baseline, revised, and actual completion dates alongside real-time progress bars.
- **💼 Unified Commercial & Delivery Pipeline**
  - Combines **Quotation → PET → Purchase Order (PO) → Hardware Delivery Tracking** into a single unified table tied directly to each project deliverable.
  - Highlights overdue deliveries, supplier confirmations, and fabrication stages.
- **🚚 Supplier Directory & Follow-Up Tracker**
  - Centralizes vendor contacts, associated projects, assigned deliverables, and pending supplier follow-ups.
- **📊 Excel (`.xlsx`) Reports, Activity Audit Log & JSON Backups**
  - Automatically logs every create, update, status change, and deletion.
  - Exports formatted `.xlsx` spreadsheets for Projects, Deliverables, Tasks, Milestones, Suppliers, Commercial pipelines, and Recent Activities.
  - Full one-click JSON database backup, restore, and demo data toggle.

---

## 🛠️ Tech Stack

- **Frontend Framework:** [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Styling & UI:** [Tailwind CSS](https://tailwindcss.com/) + [Lucide React Icons](https://lucide.dev/)
- **Charts & Analytics:** [Recharts](https://recharts.org/)
- **Local Database:** [Dexie.js](https://dexie.org/) (IndexedDB wrapper with live reactive queries)
- **Spreadsheet Export:** [SheetJS (`xlsx`)](https://sheetjs.com/)
- **Testing:** [Vitest](https://vitest.dev/) + `fake-indexeddb`

---

## ⚙️ Prerequisites

Ensure you have the following installed on your local machine before running the project:

- **[Node.js](https://nodejs.org/)** `v18.0.0` or higher (includes `npm`)
- **[Git](https://git-scm.com/)**

Verify your installation:

```bash
node -v
npm -v
git --version
```

---

## 🚀 Quick Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/pacca1412/project-tracker.git
   ```

2. **Navigate to the project directory:**

   ```bash
   cd project-tracker
   ```

3. **Install dependencies:**

   ```bash
   npm install
   ```

---

## 💻 Usage

### Start the Development Server

Launch the local Vite development server with Hot Module Replacement (HMR):

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Run Automated Tests

Execute the Vitest unit and database integration test suite:

```bash
npm test
```

### Build for Production

Type-check and bundle the application into the `dist/` folder:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

---

## 📂 Project Structure

```text
project-tracker/
├── src/
│   ├── components/       # Reusable UI primitives (Modal, Card, Badge, Button, etc.)
│   ├── database/         # Dexie.js IndexedDB schema & table definitions
│   ├── features/         # Feature modules (WorkWeekCalendar, Project/Deliverable/Commercial forms)
│   ├── hooks/            # Reactive database query hooks
│   ├── layouts/          # AppLayout, Sidebar, and TopBar with global search
│   ├── pages/            # Route pages (Overview, Projects, ProjectDetail, Tasks, Suppliers, Settings)
│   ├── services/         # CRUD services, validation, Excel export, JSON backup, sample data
│   ├── types/            # TypeScript data models and status constants
│   └── utils/            # Date formatting and validation helpers
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the repository.
2. Create your feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Commit your changes:
   ```bash
   git commit -m "Add: brief description of your feature"
   ```
4. Push to the branch:
   ```bash
   git push origin feature/your-feature-name
   ```
5. Open a Pull Request.

---

## 📄 License

Distributed under the **MIT License**.

```text
MIT License

Copyright (c) 2026 Pacca1214

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
