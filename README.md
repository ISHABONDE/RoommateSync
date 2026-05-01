# 🏠 RoommateSync

**AI-powered roommate matching platform for urban India**

RoommateSync helps people find compatible roommates using a multi-stage ML pipeline — KMeans clustering → KNN retrieval → Cosine similarity scoring — combined with OCR-based KYC identity verification. Built as a full-stack web application with a React frontend, Flask REST API, real-time WebSocket chat, and MongoDB.

---

## 📌 Table of Contents

- [Features](#features)
- [ML Pipeline](#ml-pipeline)
- [KYC Verification](#kyc-verification)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Overview](#api-overview)
- [Model Evaluation](#model-evaluation)
- [Dataset](#dataset)

---

## Features

- **AI Roommate Matching** — 3-stage pipeline (KMeans + KNN + Cosine) ranks users by lifestyle compatibility with a 0–100 score
- **OCR-based KYC** — Tesseract extracts ID numbers from uploaded Aadhaar/PAN documents; Jaccard similarity verifies names
- **Real-time Chat** — Flask-SocketIO WebSocket layer with per-conversation room isolation
- **Location-aware Filtering** — Haversine distance filter restricts matches to the user's preferred area radius
- **Room Scenario Matching** — Matches users by room intent (has room / looking together / wants to join)
- **Admin Panel** — Manual KYC review queue, user management, match analytics
- **OTP Email Auth** — Registration and login protected by time-limited OTP codes via Flask-Mail
- **Rate Limiting** — Per-endpoint rate limits (Flask-Limiter) on all auth routes

---

## ML Pipeline

The matching engine runs a 3-stage pipeline on every `GET /matches` request:

```
MongoDB users
     │
     ▼
[1] MinMaxScaler          ← normalise 10 lifestyle features to [0, 1]
     │
     ▼
[2] KMeans (dynamic K)    ← group users into lifestyle clusters
     │                       K = min(10, √(n/2)), auto-scales with user count
     ▼
[3] KNN (K=20 per cluster)← retrieve 20 nearest neighbours from requester's cluster
     │
     ▼
[4] Cosine Similarity     ← rank candidates, produce 0–100 compatibility score
     │
     ▼
[5] Location + Room filter← Haversine distance, room status, capacity check
     │
     ▼
Top 10 ranked matches
```

**Features used for matching:**

| Feature | Scale | Description |
|---|---|---|
| `sleep_time` | 0–2 | Early / Normal / Late |
| `wake_time` | 0–2 | Early / Normal / Late |
| `cleanliness` | 1–5 | Self-rated scale |
| `noise_tolerance` | 1–5 | Self-rated scale |
| `smoking` | 0/1 | Binary |
| `Alcohol` | 0/1 | Binary |
| `study_habit` | 0–2 | None / Light / Heavy |
| `social_level` | 1–5 | Self-rated scale |
| `guest_frequency` | 0–3 | Never / Rarely / Sometimes / Often |
| `room_rent` | INR | Monthly budget |

**Dynamic cluster sizing** ensures the model works correctly with as few as 2 users and scales up automatically — no manual `KMEANS_CLUSTERS` tuning required in production.

---

## KYC Verification

Identity verification runs a document-only pipeline (no selfie required):

```
Upload ID document (Aadhaar / PAN / Voter ID)
     │
     ▼
OpenCV pre-processing    ← grayscale, denoise, threshold
     │
     ▼
Tesseract OCR            ← extract raw text from document image
     │
     ▼
Regex extraction         ← locate ID number (12-digit Aadhaar / 10-char PAN pattern)
     │
     ▼
Jaccard name matching    ← compare OCR name tokens vs profile name (threshold ≥ 0.5)
     │
     ▼
Decision:
  VERIFIED  → ID number found + name matches
  PENDING   → partial match → manual admin review queue
  REJECTED  → OCR extracted nothing useful
```

This is architecturally similar to Razorpay's merchant onboarding KYC pipeline, where documents are verified programmatically before manual escalation.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Axios, Socket.IO client |
| Backend | Python 3.11, Flask 3.0, Flask-SocketIO |
| ML | scikit-learn (KMeans, KNN, Cosine), NumPy, Pandas |
| OCR / CV | Tesseract, OpenCV, Pillow |
| Database | MongoDB (PyMongo), geospatial index |
| Auth | JWT (PyJWT), bcrypt, OTP via Flask-Mail |
| Rate Limiting | Flask-Limiter |
| Distance | Haversine formula (custom implementation) |

---

## Project Structure

```
roommate_sync_upgraded/
├── app.py                      # Flask app factory, SocketIO init
├── config.py                   # Central config (env-driven)
├── requirements.txt
│
├── ml/
│   ├── matching_engine.py      # Live MongoDB → KMeans+KNN+Cosine pipeline
│   ├── recommendation_model.py # CSV-based recommendation (dataset training)
│   ├── evaluation.py           # Silhouette, DBI, Precision@K, NDCG@K, Coverage
│   └── dataset_generator.py    # Realistic synthetic dataset (2000 Indian users)
│
├── verification/
│   ├── kyc_workflow.py         # Full KYC decision pipeline
│   ├── ocr_service.py          # Tesseract OCR wrapper
│   ├── document_upload.py      # Secure document storage
│   └── face_detection.py       # OpenCV face detection utility
│
├── routes/
│   ├── auth_routes.py          # Register, login, OTP verify
│   ├── recommendation_routes.py# /matches, /ml/train, /ml/evaluate
│   ├── room_routes.py          # Room CRUD, photo upload
│   ├── chat_routes.py          # Chat history
│   ├── document_routes.py      # KYC upload trigger
│   ├── admin_routes.py         # Admin panel endpoints
│   └── ...
│
├── services/
│   ├── matching_service.py
│   ├── user_service.py
│   ├── email_service.py
│   ├── notification_service.py
│   └── location_service.py
│
├── chat/
│   └── socket_events.py        # SocketIO event handlers
│
├── database/
│   ├── db.py                   # MongoDB connection singleton
│   └── models.py               # Collection accessors, VerificationStatus enum
│
├── location/
│   └── distance_calculator.py  # Haversine implementation
│
└── dataset/
    └── roommate_dataset.csv    # Generated by dataset_generator.py
```

```
roommate_frontend/
├── src/
│   ├── pages/
│   │   ├── Matches.jsx         # Compatibility score cards
│   │   ├── Discover.jsx        # Browse + filter users
│   │   ├── Chat.jsx            # Real-time chat UI
│   │   ├── Profile.jsx         # Edit preferences
│   │   ├── Rooms.jsx           # Room listings
│   │   └── Admin.jsx           # Admin dashboard
│   ├── context/
│   │   ├── AuthContext.jsx     # JWT state management
│   │   └── SocketContext.jsx   # Socket.IO provider
│   └── api/
│       ├── client.js           # Axios instance with JWT interceptor
│       └── index.js            # All API call functions
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- MongoDB running locally (`mongodb://localhost:27017`)
- Tesseract OCR installed (`sudo apt install tesseract-ocr` on Ubuntu)

### Backend Setup

```bash
git clone https://github.com/yourusername/roommate-sync.git
cd roommate-sync/backend/roommate_sync_upgraded

# Create virtual environment
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your MongoDB URI, SMTP credentials, secret key

# Generate dataset (first run)
python ml/dataset_generator.py

# Start server
python app.py
```

The API will be available at `http://localhost:5000`.

### Frontend Setup

```bash
cd frontend/roommate_frontend
npm install
npm run dev
```

The React app will run at `http://localhost:5173`.

### Environment Variables

```env
SECRET_KEY=your-secret-key
MONGO_URI=mongodb://localhost:27017/
MONGO_DB_NAME=roommate_sync
MAIL_USERNAME=your@gmail.com
MAIL_PASSWORD=your-app-password
DEBUG=True
```

---

## API Overview

All endpoints are available under both `/` and `/api/v1/` prefixes.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register with name, email, password |
| POST | `/auth/verify-otp` | Verify OTP and activate account |
| POST | `/auth/login` | Login, receive JWT |
| GET | `/matches` | Get top-10 AI-matched roommates |
| GET | `/recommendation/recommend` | Dataset-based recommendations |
| POST | `/ml/train` | Retrain model on dataset |
| GET | `/ml/evaluate` | Full model evaluation report |
| GET | `/users/profile` | Get own profile |
| PUT | `/users/profile` | Update lifestyle preferences |
| POST | `/documents/kyc` | Upload ID for KYC verification |
| GET | `/rooms` | List rooms |
| POST | `/rooms` | Create room listing |
| GET | `/chat/history/<user_id>` | Chat history with a user |

Real-time chat uses Socket.IO events: `join_room`, `send_message`, `receive_message`, `typing`.

---

## Model Evaluation

Run the full evaluation pipeline:

```bash
python ml/evaluation.py
```

Metrics produced:

| Category | Metric | What it measures |
|---|---|---|
| Clustering | Silhouette Score | Cluster separation quality (-1 to 1, higher = better) |
| Clustering | Davies-Bouldin Index | Cluster compactness (lower = better) |
| Clustering | Elbow curve | Inertia vs K — helps choose optimal cluster count |
| Recommendation | Precision@K | Of top-K returned, how many are truly compatible |
| Recommendation | Recall@K | Of all compatible users, how many appear in top-K |
| Recommendation | NDCG@K | Ranking quality — compatible users ranked higher = better score |
| Recommendation | Coverage | % of users who receive at least one relevant match |
| Performance | Train time (ms) | Full pipeline training latency |
| Performance | Query time (ms) | Per-user recommendation latency |

Relevance is defined via pseudo-labels: a pair is "relevant" if their cosine similarity ≥ 0.75 on the 14-feature lifestyle vector.

The evaluation report is also available as a live API endpoint:

```
GET /ml/evaluate
```

---

## Dataset

The dataset is generated by `ml/dataset_generator.py` and contains **2,000 synthetic users** based on realistic Indian urban distributions:

- **8 cities** — Mumbai, Bangalore, Pune, Delhi, Hyderabad, Chennai, Kolkata, Ahmedabad — weighted by metro population
- **Rent** — log-normal distribution per city, calibrated to NoBroker/MagicBricks 2024 median shared-room rates (₹7,000–₹18,000)
- **Sleep habits** — bimodal (students skew later, working professionals skew earlier)
- **Smoking prevalence** — ~18% (WHO India 2023)
- **Alcohol prevalence** — ~30% (urban India survey)
- **Student ratio** — ~45% of users

Replace with real user data from MongoDB in production by using the live `MatchingEngine` (which reads directly from MongoDB) instead of `RecommendationModel` (which reads the CSV).

---

## License

MIT
