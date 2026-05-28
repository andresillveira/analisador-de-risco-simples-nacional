from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import api
from app.database import init_db

app = FastAPI(title="Simples Nacional Risk Analyzer Backend")

@app.on_event("startup")
def on_startup():
    init_db()


# Habilita CORS para o desenvolvimento local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api.router, prefix="/api")
