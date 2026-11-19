---
title: TSA Present API
emoji: 🎙️
colorFrom: indigo
colorTo: cyan
sdk: docker
app_port: 7860
---

# TSA Presentation Coach

An AI-powered presentation delivery analysis and coaching platform built for students, competitors, and professionals.

## Architecture

The platform uses a robust 3-layer analysis pipeline:
1. **Silero VAD ONNX & Librosa Prosody**: High-precision voice activity detection and audio feature extraction (speaking rate, pause duration, pitch variability).
2. **Deepgram Nova-2 Verbatim STT**: High-accuracy speech-to-text transcription preserving verbatim fillers (`"um"`/`"uh"`/`"like"` without blanking out heavy disfluencies, as live speech testing showed Nova-2 preserves these best).
3. **Gemini Native Audio Stutter Fusion & Evaluation**: Advanced LLM evaluation against pluggable JSON rubrics fusing audible disfluencies back into waveform markers and KPIs.

---

## Project Structure

```text
tsa-present/
├── backend/
│   ├── app/                # FastAPI application
│   ├── requirements.txt    # Python dependencies
│   └── .env.example        # Environment variable template
├── frontend/               # Next.js web application
├── rubrics/
│   ├── general_delivery_v1.json         # Active general presentation rubric
│   └── tsa_prepared_preview.json        # Phase 2 TSA Prepared Presentation preview rubric
├── Dockerfile              # Container configuration for Hugging Face Spaces (repo root)
└── README.md
```

---

## Local Setup Instructions

### 1. Backend Setup

Navigate to the `backend` directory and set up your environment:

```bash
cd backend
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory based on `.env.example`:

```env
DEEPGRAM_API_KEY=your_deepgram_api_key_here
DEEPGRAM_MODEL=nova-2
GEMINI_API_KEY=your_google_ai_studio_key_here
GEMINI_MODEL=gemini-2.5-flash
CORS_ORIGINS=http://localhost:3000
MAX_AUDIO_MB=25
MAX_DURATION_SEC=600
```

> [!NOTE]
> For fresh local clones, ensure `silero_vad.onnx` is downloaded to `backend/models/silero_vad.onnx` (or generated automatically by your container build / startup script if configured).

Run the FastAPI development server:

```bash
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup

Navigate to the `frontend` directory:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Free API Key Setup

- **Deepgram API Key**: Sign up for a free developer account at [Deepgram Console](https://console.deepgram.com/) and generate an API key.
- **Google AI Studio Key**: Obtain a free API key for Gemini models at [Google AI Studio](https://aistudio.google.com/).

---

## Deployment Instructions ($0 Free Tier, No Credit Card Required)

### 1. Backend (Render Free Tier — Docker Blueprint)
1. Go to [Render Dashboard](https://dashboard.render.com/) and click **New + → Blueprint**.
2. Connect your GitHub repo (`risithcha/tsa-present`) — Render automatically reads `render.yaml` and builds the root `Dockerfile` (pure-NumPy YIN prosody keeps steady RAM around ~135 MB, comfortably inside Render's free 512 MB tier!).
3. Enter your `DEEPGRAM_API_KEY` and `GEMINI_API_KEY` when prompted, then click **Apply**.
4. Copy your live Render URL (e.g., `https://tsa-present-api.onrender.com`) and verify `/health`.

### 2. Frontend (Vercel Free Hobby Tier)
1. Go to [vercel.com/new](https://vercel.com/new) and import `risithcha/tsa-present`.
2. Set **Root Directory** to `frontend`.
3. Add environment variable:
   - `NEXT_PUBLIC_API_URL=https://tsa-present-api.onrender.com` *(your exact Render URL, no trailing slash)*
4. Deploy, then update `CORS_ORIGINS=https://<your-app>.vercel.app,http://localhost:3000` in Render's **Environment** tab.
