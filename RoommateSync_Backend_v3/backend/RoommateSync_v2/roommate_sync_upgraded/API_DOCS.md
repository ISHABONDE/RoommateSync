# RoommateSync — API Reference
> face_recognition removed · Email OTP · OpenCV face detection · pytesseract OCR

Base URL: `http://localhost:5000`

All protected routes require:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## 1. Authentication

### POST /auth/register
Register a new user. Triggers a 6-digit OTP email.

**Request**
```json
{
  "name":     "Riya Sharma",
  "email":    "riya@example.com",
  "password": "SecurePass123",
  "phone":    "9876543210"
}
```
**Response 201**
```json
{
  "success": true,
  "message": "Registration successful. Please verify your email with the OTP sent.",
  "user_id": "6650abc123def456"
}
```

---

### POST /auth/verify-otp
Verify the OTP sent to the user's email. Unlocks the account for login.

**Request**
```json
{ "email": "riya@example.com", "otp": "483921" }
```
**Response 200**
```json
{ "success": true, "message": "Email verified successfully." }
```
**Response 400 (wrong OTP)**
```json
{ "success": false, "message": "Invalid OTP. Please try again." }
```
**Response 400 (expired)**
```json
{ "success": false, "message": "OTP has expired. Please request a new one." }
```

---

### POST /auth/resend-otp
Request a fresh OTP.

**Request**
```json
{ "email": "riya@example.com" }
```
**Response 200**
```json
{ "success": true, "message": "OTP sent to your email." }
```

---

### POST /auth/login
Login. Returns a JWT. **Requires email_verified = true**.

**Request**
```json
{ "email": "riya@example.com", "password": "SecurePass123" }
```
**Response 200**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "user_id": "6650abc123def456",
    "name": "Riya Sharma",
    "email": "riya@example.com",
    "email_verified": true,
    "verification_status": 0
  }
}
```
**Response 401 (unverified)**
```json
{
  "success": false,
  "message": "Email not verified. Please check your inbox for the OTP."
}
```

---

### GET /auth/me
Get current authenticated user.

**Response 200**
```json
{
  "success": true,
  "user": { "user_id": "...", "name": "Riya Sharma", "email": "...", ... }
}
```

---

## 2. Profile Photo Upload

### POST /users/profile/photo
Upload a profile photo (multipart form).

**Form-data:** `file=<image (jpg/png/webp)>`

**Response 200**
```json
{
  "success": true,
  "profile_image": "uploads/profiles/a3f2bc1d.jpg"
}
```
**Response 400 (invalid type)**
```json
{ "success": false, "message": "Invalid image type. Allowed: png, jpg, jpeg, webp" }
```

---

## 3. ID Document Upload + OCR

### POST /documents/upload-id
Upload an ID document. OCR runs automatically.

**Form-data:** `file=<image or pdf>`

**Response 200**
```json
{
  "success": true,
  "message": "ID document uploaded and OCR extracted.",
  "id_document": "uploads/documents/7e9f12ab.jpg",
  "ocr_data": {
    "name":      "RIYA SHARMA",
    "id_number": "483921748302",
    "raw_text":  "Government of India\nAadhaar Card\nRIYA SHARMA\n4839 2174 8302 ..."
  }
}
```

---

## 4. Full KYC Submission (Selfie + Document)

### POST /documents/submit-kyc
Submit selfie + ID document for full KYC. Runs:
1. OpenCV face detection on selfie
2. Tesseract OCR on document

**Form-data:** `selfie=<image>`, `document=<image>`

**Response 200**
```json
{
  "success": true,
  "message": "Documents submitted successfully. Verification is pending admin review.",
  "details": {
    "face_detection": {
      "success": true,
      "face_found": true,
      "face_count": 1,
      "message": "Face detected (1 face(s) found)."
    },
    "ocr": {
      "success": true,
      "raw_text": "...",
      "name": "RIYA SHARMA",
      "id_number": "483921748302"
    }
  }
}
```
**Response 400 (no face)**
```json
{
  "success": false,
  "message": "No face detected in selfie. Verification rejected."
}
```

---

## 5. Verification Status

### GET /documents/status/{user_id}

**Response 200**
```json
{
  "success": true,
  "user_id": "6650abc123def456",
  "verification_status": 1,
  "email_verified": true,
  "profile_image": "uploads/profiles/a3f2bc1d.jpg",
  "id_document":   "uploads/documents/7e9f12ab.jpg",
  "ocr_data": { "name": "RIYA SHARMA", "id_number": "483921748302" }
}
```

> verification_status: 0=not verified, 1=pending, 2=verified, 3=rejected

---

## 6. User Profile

### POST /users/profile  (or PUT /users/profile)
Update lifestyle & room preferences.

**Request**
```json
{
  "sleep_time": 2, "wake_time": 2, "cleanliness": 4,
  "noise_tolerance": 3, "smoking": 0, "Alcohol": 0,
  "study_habit": 1, "social_level": 3, "guest_frequency": 1,
  "room_rent": 8000, "room_size": 3, "wifi": 1, "parking": 0,
  "furnished": 1, "room_status": 1, "roommates_needed": 2,
  "current_roommates": 0, "city": "Pune", "area": "Kothrud",
  "latitude": 18.5074, "longitude": 73.8077,
  "preferred_city": "Pune", "preferred_distance": 5
}
```

---

## 7. Recommendations

### GET /recommend
Returns top 10 compatible roommates.

**Response 200**
```json
{
  "success": true,
  "count": 8,
  "recommendations": [
    { "dataset_user_id": "u_42", "cos_score": 0.9812, "city": "Pune", ... }
  ]
}
```

---

## 8. Location

### POST /location/update
```json
{ "latitude": 18.5074, "longitude": 73.8077, "city": "Pune", "area": "Kothrud" }
```

### GET /location/nearby?radius=5
```json
{ "success": true, "nearby_users": [ { "user_id": "...", "distance": 2.3 } ] }
```

---

## 9. Chat (Request-Accept Model)

### POST /chat/request
```json
{ "to_user_id": "6650xyz789" }
```
→ `{ "success": true, "request_id": "..." }`

### POST /chat/accept
```json
{ "request_id": "..." }
```

### POST /chat/reject
```json
{ "request_id": "..." }
```

### GET /chat/requests/{user_id}
Lists incoming chat requests.

### POST /chat/message
```json
{ "request_id": "...", "message": "Hey, are you looking for a roommate?" }
```

### GET /chat/messages/{chat_id}
Returns full message history.

---

## 10. Admin

### GET /admin/analytics
```json
{
  "analytics": {
    "total_users": 142, "email_verified": 130,
    "kyc_verified": 88,  "kyc_pending": 22,
    "total_rooms": 54,   "total_chat_requests": 210,
    "total_messages": 890
  }
}
```

### DELETE /admin/users/{id}
Delete a user.

### POST /admin/verify-document
```json
{ "user_id": "...", "status": 2, "reason": "Documents clear" }
```

### POST /admin/upload-dataset
Form-data: `file=<roommate_dataset.csv>`

### POST /admin/retrain-model
Retrain the KMeans + KNN recommendation model.

---

## MongoDB Collections

| Collection     | Purpose                              |
|---------------|--------------------------------------|
| users          | All user accounts + profiles         |
| otps           | Active OTP records (auto-expire)     |
| documents      | KYC document records + OCR results   |
| rooms          | Room listings                        |
| matches        | Recommendation match records         |
| chat_requests  | Request-accept chat state            |
| messages       | Chat messages                        |
| notifications  | User notification inbox              |
| admins         | Admin accounts                       |
| analytics      | Platform analytics snapshots         |

---

## User Document Schema (MongoDB)

```json
{
  "_id":                 "ObjectId",
  "name":                "Riya Sharma",
  "email":               "riya@example.com",
  "password":            "<bcrypt hash>",
  "phone":               "9876543210",
  "email_verified":      false,
  "profile_image":       "uploads/profiles/abc123.jpg",
  "id_document":         "uploads/documents/def456.jpg",
  "ocr_text":            "raw extracted text...",
  "ocr_data":            { "name": "RIYA SHARMA", "id_number": "4839..." },
  "verification_status": 0,
  "sleep_time":          2,
  "wake_time":           2,
  "cleanliness":         4,
  "noise_tolerance":     3,
  "smoking":             0,
  "Alcohol":             0,
  "study_habit":         1,
  "social_level":        3,
  "guest_frequency":     1,
  "room_rent":           8000,
  "room_size":           3,
  "wifi":                1,
  "parking":             0,
  "furnished":           1,
  "room_status":         1,
  "roommates_needed":    2,
  "current_roommates":   0,
  "city":                "Pune",
  "area":                "Kothrud",
  "latitude":            18.5074,
  "longitude":           73.8077,
  "preferred_city":      "Pune",
  "preferred_distance":  5,
  "created_at":          "2025-01-15T10:30:00Z"
}
```
