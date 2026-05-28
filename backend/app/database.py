import os
import json
from pathlib import Path
from sqlmodel import SQLModel, create_engine, Session, Field
from typing import Generator, Optional
from dotenv import load_dotenv

# Ensure environment variables are loaded
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./analisador.db")

# SQLite connection args
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)

class AuditRecordDb(SQLModel, table=True):
    __tablename__ = "audit_records"
    
    id: str = Field(primary_key=True)
    timestamp: str
    companyName: str
    period: str
    results_json: str
    files_json: str
    created_at: float = Field(default=0.0)

class ManualValuesDb(SQLModel, table=True):
    __tablename__ = "manual_values"
    
    id: str = Field(primary_key=True)
    companyName: str
    period: str
    vendas: float = 0.0
    compras: float = 0.0
    servicos_prestados: float = 0.0
    servicos_tomados: float = 0.0
    folha_pagamento: float = 0.0
    outras_receitas: float = 0.0
    outras_despesas: float = 0.0
    devolucoes_vendas: float = 0.0
    devolucoes_compras: float = 0.0
    is_manual: bool = True

def init_db():
    SQLModel.metadata.create_all(engine)
    migrate_legacy_data()

def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session

def migrate_legacy_data():
    pkg_dir = Path(__file__).resolve().parent  # backend/app
    DATA_DIR = pkg_dir.parent / "data"  # backend/data
    HISTORY_FILE = DATA_DIR / "history.json"
    MANUAL_VALUES_FILE = DATA_DIR / "manual_values.json"
    
    with Session(engine) as session:
        # Check if databases are already populated
        from sqlmodel import select
        has_audit = session.exec(select(AuditRecordDb)).first() is not None
        has_manual = session.exec(select(ManualValuesDb)).first() is not None
        
        # 1. Migrate history.json
        if not has_audit and HISTORY_FILE.exists():
            try:
                history_data = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
                if history_data and isinstance(history_data, list):
                    for idx, record in enumerate(reversed(history_data)):
                        db_record = AuditRecordDb(
                            id=record["id"],
                            timestamp=record["timestamp"],
                            companyName=record["companyName"],
                            period=record["period"],
                            results_json=json.dumps(record["results"], ensure_ascii=False),
                            files_json=json.dumps(record["files"], ensure_ascii=False),
                            created_at=idx * 1.0  # Safe ordering
                        )
                        session.add(db_record)
                    session.commit()
                    print(f"[Migration] Migrated {len(history_data)} records from legacy history.json.")
            except Exception as e:
                print(f"[Migration Error] Failed to migrate history.json: {e}")
                
        # 2. Migrate manual_values.json
        if not has_manual and MANUAL_VALUES_FILE.exists():
            try:
                manual_data = json.loads(MANUAL_VALUES_FILE.read_text(encoding="utf-8"))
                if manual_data and isinstance(manual_data, dict):
                    migrated_count = 0
                    for key, val in manual_data.items():
                        db_manual = ManualValuesDb(
                            id=key,
                            companyName=val.get("companyName"),
                            period=val.get("period"),
                            vendas=val.get("vendas", 0.0),
                            compras=val.get("compras", 0.0),
                            servicos_prestados=val.get("servicos_prestados", 0.0),
                            servicos_tomados=val.get("servicos_tomados", 0.0),
                            folha_pagamento=val.get("folha_pagamento", 0.0),
                            outras_receitas=val.get("outras_receitas", 0.0),
                            outras_despesas=val.get("outras_despesas", 0.0),
                            devolucoes_vendas=val.get("devolucoes_vendas", 0.0),
                            devolucoes_compras=val.get("devolucoes_compras", 0.0),
                            is_manual=val.get("is_manual", True)
                        )
                        session.add(db_manual)
                        migrated_count += 1
                    session.commit()
                    print(f"[Migration] Migrated {migrated_count} records from legacy manual_values.json.")
            except Exception as e:
                print(f"[Migration Error] Failed to migrate manual_values.json: {e}")
