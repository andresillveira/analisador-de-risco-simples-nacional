import os
import sys
import unittest
import json

# Force in-memory SQLite database for testing to isolate from development database
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sqlmodel import Session, select, delete
from app.database import init_db, engine, AuditRecordDb, ManualValuesDb

class TestDatabaseIntegration(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        # Initialize the in-memory database and create all tables
        init_db()
        
    def setUp(self):
        # Clear database before each test
        with Session(engine) as session:
            session.exec(delete(AuditRecordDb))
            session.exec(delete(ManualValuesDb))
            session.commit()
            
    def test_audit_record_crud(self):
        with Session(engine) as session:
            # 1. Create
            record = AuditRecordDb(
                id="test_audit_1",
                timestamp="28/05/2026 14:00:00",
                companyName="Empresa Teste Ltda",
                period="Maio 2026",
                results_json=json.dumps({"faturamento": 150000.0, "statusX": "Regular"}),
                files_json=json.dumps([{"name": "test.csv", "size": 100}]),
                created_at=100.0
            )
            session.add(record)
            session.commit()
            
            # 2. Read
            db_record = session.exec(select(AuditRecordDb).where(AuditRecordDb.id == "test_audit_1")).first()
            self.assertIsNotNone(db_record)
            self.assertEqual(db_record.companyName, "Empresa Teste Ltda")
            self.assertEqual(db_record.period, "Maio 2026")
            
            results = json.loads(db_record.results_json)
            self.assertEqual(results["faturamento"], 150000.0)
            
            # 3. Update
            db_record.companyName = "Empresa Teste Modificada"
            session.add(db_record)
            session.commit()
            
            db_record_updated = session.exec(select(AuditRecordDb).where(AuditRecordDb.id == "test_audit_1")).first()
            self.assertEqual(db_record_updated.companyName, "Empresa Teste Modificada")
            
            # 4. Delete
            session.delete(db_record_updated)
            session.commit()
            
            db_record_deleted = session.exec(select(AuditRecordDb).where(AuditRecordDb.id == "test_audit_1")).first()
            self.assertIsNone(db_record_deleted)

    def test_manual_values_crud(self):
        with Session(engine) as session:
            # 1. Create
            manual = ManualValuesDb(
                id="empresa teste ltda|||maio 2026",
                companyName="Empresa Teste Ltda",
                period="Maio 2026",
                vendas=10000.0,
                compras=5000.0,
                servicos_prestados=2000.0,
                is_manual=True
            )
            session.add(manual)
            session.commit()
            
            # 2. Read
            db_manual = session.exec(select(ManualValuesDb).where(ManualValuesDb.id == "empresa teste ltda|||maio 2026")).first()
            self.assertIsNotNone(db_manual)
            self.assertEqual(db_manual.companyName, "Empresa Teste Ltda")
            self.assertEqual(db_manual.vendas, 10000.0)
            self.assertTrue(db_manual.is_manual)
            
            # 3. Update
            db_manual.compras = 6000.0
            session.add(db_manual)
            session.commit()
            
            db_manual_updated = session.exec(select(ManualValuesDb).where(ManualValuesDb.id == "empresa teste ltda|||maio 2026")).first()
            self.assertEqual(db_manual_updated.compras, 6000.0)
            
            # 4. Delete
            session.delete(db_manual_updated)
            session.commit()
            
            db_manual_deleted = session.exec(select(ManualValuesDb).where(ManualValuesDb.id == "empresa teste ltda|||maio 2026")).first()
            self.assertIsNone(db_manual_deleted)

    def test_audit_record_ordering(self):
        # Verify that created_at ordering works correctly (newest first / desc order)
        with Session(engine) as session:
            rec1 = AuditRecordDb(
                id="audit_first",
                timestamp="28/05/2026 14:00:00",
                companyName="First",
                period="Period",
                results_json="{}",
                files_json="[]",
                created_at=1.0
            )
            rec2 = AuditRecordDb(
                id="audit_second",
                timestamp="28/05/2026 14:01:00",
                companyName="Second",
                period="Period",
                results_json="{}",
                files_json="[]",
                created_at=2.0
            )
            session.add(rec1)
            session.add(rec2)
            session.commit()
            
            # Fetch ordered by created_at desc
            records = session.exec(select(AuditRecordDb).order_by(AuditRecordDb.created_at.desc())).all()
            self.assertEqual(len(records), 2)
            self.assertEqual(records[0].id, "audit_second")
            self.assertEqual(records[1].id, "audit_first")

if __name__ == "__main__":
    unittest.main()
