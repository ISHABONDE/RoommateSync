# RoommateSync — Backend

A production-ready Flask + MongoDB roommate recommendation platform.

## What Changed from Original
- ❌ **Removed** `face_recognition` completely (no face encoding / matching)
- ✅ **Added** Email OTP verification via Flask-Mail
- ✅ **Added** OpenCV face presence detection (Haar Cascade — no identity matching)
- ✅ **Added** Tesseract OCR for ID document text extraction
- ✅ **Added** Profile photo & ID document upload endpoints

---

## Quick Start

### 1. Prerequisites
- Python 3.9+
- MongoDB running locally on port 27017
- Tesseract OCR installed: `sudo apt install tesseract-ocr` (Linux) or [installer](https://github.com/UB-Mannheim/tesseract/wiki) (Windows)

### 2. Install dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env — set MAIL_USERNAME, MAIL_PASSWORD (Gmail App Password), SECRET_KEY
```

### 4. Run
```bash
python app.py
```
Server starts at `http://localhost:5000`

---

## Project Structure
```
backend/
├── app.py                        # Flask app factory
├── config.py                     # All configuration
├── requirements.txt
├── .env.example
├── API_DOCS.md                   # Full API reference
│
├── database/
│   ├── db.py                     # MongoDB connection singleton
│   └── models.py                 # Collection helpers & schema constants
│
├── routes/
│   ├── auth_routes.py            # POST /auth/register, /login, /verify-otp
│   ├── user_routes.py            # GET/PUT /users/profile
│   ├── document_routes.py        # POST /documents/upload-*, /submit-kyc
│   ├── recommendation_routes.py  # GET /recommend
│   ├── chat_routes.py            # Chat request-accept model
│   ├── notification_routes.py
│   ├── location_routes.py
│   ├── room_routes.py
│   └── admin_routes.py
│
├── services/
│   ├── email_service.py          # OTP generation + Flask-Mail sending
│   ├── user_service.py           # Register, login, JWT, profile CRUD
│   ├── location_service.py
│   └── notification_service.py
│
├── verification/
│   ├── face_detection.py         # OpenCV Haar Cascade face presence check
│   ├── ocr_service.py            # pytesseract text + ID number extraction
│   ├── document_upload.py        # File validation & save helpers
│   └── kyc_workflow.py           # Orchestrates full KYC pipeline
│
├── ml/
│   └── recommendation_model.py   # KMeans + KNN + Cosine similarity engine
│
├── location/
│   └── distance_calculator.py    # Haversine formula
│
├── dataset/
│   └── roommate_dataset.csv      # Training dataset (sample included)
│
└── uploads/
    ├── profiles/                 # Profile photos
    ├── documents/                # ID documents
    └── selfies/                  # KYC selfies
```

---

## Key API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register + send OTP |
| POST | `/auth/verify-otp` | Verify OTP → unlock account |
| POST | `/auth/resend-otp` | Resend OTP |
| POST | `/auth/login` | Login → JWT (requires email verified) |
| GET  | `/auth/me` | Current user |
| POST | `/users/profile/photo` | Upload profile photo |
| POST | `/documents/upload-id` | Upload ID + run OCR |
| POST | `/documents/submit-kyc` | Full KYC (selfie + ID) |
| GET  | `/documents/status/<id>` | Verification status |
| GET  | `/recommend` | Top 10 roommate matches |
| POST | `/chat/request` | Send chat request |
| POST | `/chat/accept` | Accept chat request |
| GET  | `/admin/analytics` | Platform stats |

See `API_DOCS.md` for full request/response examples.

---

## Verification Status Codes
| Code | Meaning |
|------|---------|
| 0 | Not verified |
| 1 | Pending (submitted, awaiting admin review) |
| 2 | Verified |
| 3 | Rejected |

---

## MongoDB Collections
`users` · `otps` · `documents` · `rooms` · `matches` · `chat_requests` · `messages` · `notifications` · `admins` · `analytics`
