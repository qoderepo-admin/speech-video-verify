from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import shutil
import os
import ffmpeg
import speech_recognition as sr
from typing import Optional
from pathlib import Path

app = FastAPI()

# Enhanced CORS configuration
origins = [
    "http://localhost:3000",  # Your React development server
    "http://localhost:5173",  # Vite default port
    "http://127.0.0.1:3000",  # Alternative localhost
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],  # Important for some CORS scenarios
)

EXPECTED_TEXT = "I accept"

# Set this to where you extracted FFmpeg
FFMPEG_PATH = str(
    Path(__file__).resolve().parent
    / "ffmpeg"
    / "ffmpeg-7.1.1-essentials_build"
    / "bin"
    / "ffmpeg"
)

# On Windows, add .exe automatically
if os.name == "nt":
    FFMPEG_PATH = FFMPEG_PATH + ".exe"


@app.post("/upload/")
async def upload_video(file: UploadFile = File(...)):
    try:
        # Validate file type
        if file.content_type not in ["video/mp4", "video/webm"]:
            raise HTTPException(
                status_code=400, detail="Only MP4 or WebM videos are allowed"
            )

        # Create temp directory if it doesn't exist
        os.makedirs("temp_uploads", exist_ok=True)

        video_path = os.path.join("temp_uploads", "temp_video.mp4")
        audio_path = os.path.join("temp_uploads", "temp_audio.wav")

        # Save uploaded file
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Extract audio using ffmpeg
        try:
            (
                ffmpeg.input(video_path)
                .output(
                    audio_path, format="wav", ac=1, ar=16000
                )  # Mono, 16kHz for better recognition
                .run(
                    cmd=FFMPEG_PATH,
                    overwrite_output=True,
                    capture_stdout=True,
                    capture_stderr=True,
                )
            )
        except ffmpeg.Error as e:
            print(e.stderr.decode())
            raise HTTPException(
                status_code=500,
                detail=f"FFmpeg error: {e.stderr.decode('utf-8') if e.stderr else str(e)}",
            )

        # Transcribe audio
        recognizer = sr.Recognizer()
        text: Optional[str] = None

        with sr.AudioFile(audio_path) as source:
            audio_data = recognizer.record(source)
            try:
                text = recognizer.recognize_google(audio_data).lower()
                print("Transcript:", text)
            except sr.UnknownValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Could not understand audio - speech may be unclear",
                )
            except sr.RequestError as e:
                raise HTTPException(
                    status_code=503,
                    detail=f"Speech recognition service error: {str(e)}",
                )

        # Clean up files
        for file_path in [video_path, audio_path]:
            if os.path.exists(file_path):
                os.remove(file_path)

        # Return response with proper CORS headers
        return JSONResponse(
            content={
                "status": "Match" if text == EXPECTED_TEXT.lower() else "No Match",
                "transcript": text,
                "expected": EXPECTED_TEXT,
            },
            headers={
                "Access-Control-Allow-Origin": "http://localhost:5173",
                "Access-Control-Allow-Credentials": "true",
            },
        )

    except Exception as e:
        # Clean up any remaining files
        for file_path in [video_path, audio_path]:
            if "file_path" in locals() and os.path.exists(file_path):
                os.remove(file_path)

        if not isinstance(e, HTTPException):
            raise HTTPException(status_code=500, detail=str(e))
        raise e


@app.get("/")
async def health_check():
    return {"status": "API is running"}
