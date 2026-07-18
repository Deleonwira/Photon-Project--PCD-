# Photon -- Setup Guide

> Image Processing Suite built with Vite + Flask + OpenCV

## Quick Start (Copy and Paste)

**Terminal 1 -- Backend (Python Virtual Environment):**
```cmd
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python app.py
```

**Terminal 2 -- Frontend (new window):**
```cmd
npm install
npm run dev
```

Then open **http://localhost:3000** in your browser.

---

## Prerequisites

Install these before starting:

| Software | Version | Download |
|----------|---------|----------|
| **Node.js** | 18+ | https://nodejs.org |
| **Python** | 3.10+ | https://www.python.org/downloads |

> During Python install, check "Add Python to PATH".

---

## Step 1 -- Extract the Project

Unzip `Photon Project (PCD).zip` to any folder, for example:

```
D:\Photon Project (PCD)\
```

---

## Step 2 -- Setup Virtual Environment & Install Dependencies

Open Command Prompt and run:

```cmd
cd "C:\Users\hamza\Desktop\Photon Project (PCD)\backend"
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

This creates a Python Virtual Environment (`venv`), activates it, and installs the required packages (Flask, OpenCV, NumPy, Matplotlib, PyMySQL, Pillow, Python-Dotenv).

---

## Step 3 -- Configure Environment Variables (.env)

In the same folder, copy the example configuration to create your `.env` file:

```cmd
copy .env.example .env
```

Open the newly created `.env` file to customize your configuration (such as database host, username, password, and port if needed).

---

## Step 4 -- Start the Backend Server

With the virtual environment active, run:

```cmd
python app.py
```

You should see:

```
  [*] Photon Database 'photon_db' initialized and verified successfully.
  [*] Photon Backend running on http://localhost:5000
  [*] Health check: http://localhost:5000/api/health
```

Leave this terminal open.

---

## Step 5 -- Install Frontend Dependencies

Open a new Command Prompt window and run:

```cmd
cd "C:\Users\hamza\Desktop\Photon Project (PCD)"
npm install
```

> First time may take 1-3 minutes.

---

## Step 6 -- Start the Frontend Server

In the same terminal:

```cmd
npm run dev
```

You should see:

```
  VITE v6.x.x  ready in XXX ms

  Local:   http://localhost:3000/
```

---

## Step 7 -- Open the App

Open your browser and go to:

**http://localhost:3000**

You should see the Photon dashboard.

---

## Quick Start Checklist

```
Terminal 1: python app.py     (port 5000)
Terminal 2: npm run dev       (port 3000)
Browser: http://localhost:3000
```

---

## How to Use

1. Click **+ New Project** or **Open Image** (Ctrl+O)
2. Use the **toolbar** on the left to select tools
3. Use the **properties panel** on the right to adjust settings
4. **Ctrl+Z** = Undo, **Ctrl+Y** = Redo
5. **Ctrl+S** = Save, **Ctrl+E** = Export

---

## Troubleshooting

### "pip is not recognized"
Reinstall Python and check "Add Python to PATH" during installation.

### "npm is not recognized"
Reinstall Node.js and restart your terminal.

### CORS error in browser console
Make sure the backend is running on port 5000 and frontend on port 3000.

### AI Recognition says "YOLO weights not found"
The `backend/models/yolov3-tiny.weights` file (34MB) is needed. Download it:
   1. Go to: https://pjreddie.com/media/files/yolov3-tiny.weights
   2. Save to: `backend/models/yolov3-tiny.weights`

---

## Database (Optional)

The app stores projects locally in your browser (IndexedDB). No database needed.

If you want server-side storage with MySQL, install XAMPP and import `backend/schema.sql`:

```cmd
C:\xampp\mysql\bin\mysql.exe -u root < backend/schema.sql
```

---

## Folder Structure

```
Photon Project (PCD)/
  backend/                   Flask server (Python)
    app.py                   Entry point
    config.py                Config
    schema.sql               Database schema (optional)
    requirements.txt         Python packages
    models/                  YOLOv3-tiny AI model
    routes/                  API endpoints
    services/                DB connection
  src/                       Frontend (JavaScript)
    main.js                  Entry point
    components/              UI components
    services/                Image processing + API
    styles/                  CSS
    utils/                   State, router, shortcuts
  index.html                 HTML shell
  package.json               Node dependencies
  vite.config.js             Vite config
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + Vanilla JS + CSS |
| Backend | Flask (Python) |
| Storage | IndexedDB (browser-local) |
| Image Processing | OpenCV + NumPy |
| Histogram | Matplotlib |
| AI/CNN | YOLOv3-tiny (OpenCV DNN) |
