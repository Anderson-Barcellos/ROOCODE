from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from Sleep.sleep import router as sleep_router
from Metrics.metrics import router as metrics_router
from Mood.mood import router as mood_router
from Farma.router import router as farma_router

app = FastAPI(title="RooCode API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sleep_router, prefix="/sleep", tags=["sleep"])
app.include_router(metrics_router, prefix="/metrics", tags=["metrics"])
app.include_router(mood_router, prefix="/mood", tags=["mood"])
app.include_router(farma_router, prefix="/farma", tags=["farma"])


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8011, reload=True)
