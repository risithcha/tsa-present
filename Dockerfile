# Build context is repo root: docker build -f Dockerfile .
FROM python:3.12-slim

# Install system dependencies including ffmpeg, libsndfile1, and curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user with UID 1000 for Hugging Face Spaces compatibility
RUN useradd -m -u 1000 user

# Set environment variables
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    NUMBA_CACHE_DIR=/tmp/numba_cache \
    MPLCONFIGDIR=/tmp/matplotlib \
    PORT=7860

WORKDIR /app

# Copy and install python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download silero_vad.onnx during build (fail fast on HTTP errors)
RUN mkdir -p /app/models && \
    curl -fL -o /app/models/silero_vad.onnx https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx

# Copy rubrics and backend application code
COPY rubrics/ /app/rubrics/
COPY backend/app/ /app/app/

# Set ownership and permissions for non-root user execution
RUN chown -R user:user /app && \
    mkdir -p /tmp/numba_cache /tmp/matplotlib && \
    chmod -R 777 /tmp/numba_cache /tmp/matplotlib

USER user

EXPOSE 7860

# Port environment variable defaults to 7860 for Hugging Face Spaces Docker SDK compatibility
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
