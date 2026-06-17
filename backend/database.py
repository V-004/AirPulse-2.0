import os
import json
import random
from datetime import datetime, timedelta
from dotenv import load_dotenv
import importlib.util

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

# Dynamically import root database.py
root_db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'database.py')
spec = importlib.util.spec_from_file_location("root_database", root_db_path)
root_db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(root_db)

# Try importing PyMongo
try:
    import pymongo
    from pymongo import MongoClient
    from bson import ObjectId
    HAS_PYMONGO = True
except ImportError:
    HAS_PYMONGO = False
    class ObjectId:
        def __init__(self, oid=None):
            self.oid = oid or f"{random.randint(100000, 999999):x}{random.randint(100000, 999999):x}"
        def __str__(self):
            return str(self.oid)
        def __repr__(self):
            return f"ObjectId('{self.oid}')"

# =============================================================
# 1. Local JSON NoSQL Database Emulator (MockPyMongo)
# =============================================================
class InsertOneResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id

class DeleteResult:
    def __init__(self, deleted_count):
        self.deleted_count = deleted_count

class UpdateResult:
    def __init__(self, matched_count, modified_count):
        self.matched_count = matched_count
        self.modified_count = modified_count

class MockCollection:
    def __init__(self, db_store, name):
        self.db_store = db_store
        self.name = name
        if name not in self.db_store.data:
            self.db_store.data[name] = []

    def _match_filter(self, doc, filter_query):
        if not filter_query:
            return True
        for key, val in filter_query.items():
            if key == '_id' and isinstance(val, dict) and '$in' in val:
                # Handle $in operator for ObjectIds/strings
                doc_val = str(doc.get('_id'))
                in_list = [str(x) for x in val['$in']]
                if doc_val not in in_list:
                    return False
                continue
                
            doc_val = doc.get(key)
            
            # Simple nested path mapping (e.g., "pollutants.pm25")
            if '.' in key:
                parts = key.split('.')
                temp_val = doc
                for p in parts:
                    if isinstance(temp_val, dict):
                        temp_val = temp_val.get(p)
                    else:
                        temp_val = None
                doc_val = temp_val

            if isinstance(val, dict):
                # Basic operator support ($gt, $lt, $eq)
                for op, op_val in val.items():
                    if op == '$gt' and not (doc_val is not None and doc_val > op_val): return False
                    elif op == '$lt' and not (doc_val is not None and doc_val < op_val): return False
                    elif op == '$eq' and not (doc_val == op_val): return False
                    elif op == '$ne' and not (doc_val != op_val): return False
            else:
                if str(doc_val) != str(val):
                    return False
        return True

    def find(self, filter_query=None, sort=None, limit=None):
        docs = [doc for doc in self.db_store.data[self.name] if self._match_filter(doc, filter_query)]
        
        # Simple sorting
        if sort:
            sort_key, sort_dir = sort[0]
            def get_sort_val(d):
                v = d.get(sort_key)
                if '.' in sort_key:
                    parts = sort_key.split('.')
                    v = d
                    for p in parts:
                        v = v.get(p) if isinstance(v, dict) else None
                return v or ""
            docs.sort(key=get_sort_val, reverse=(sort_dir == -1))
            
        if limit:
            docs = docs[:limit]
            
        # Clone docs to avoid mutation references
        return [json.loads(json.dumps(doc)) for doc in docs]

    def find_one(self, filter_query=None, **kwargs):
        docs = self.find(filter_query, limit=1, **kwargs)
        return docs[0] if docs else None

    def insert_one(self, doc):
        doc = json.loads(json.dumps(doc, default=str))
        if '_id' not in doc:
            doc['_id'] = str(ObjectId())
        elif isinstance(doc['_id'], dict) and '$oid' in doc['_id']:
            doc['_id'] = doc['_id']['$oid']
        
        self.db_store.data[self.name].append(doc)
        self.db_store.save()
        return InsertOneResult(doc['_id'])

    def update_one(self, filter_query, update_op):
        docs = [d for d in self.db_store.data[self.name] if self._match_filter(d, filter_query)]
        if not docs:
            return UpdateResult(0, 0)
        
        doc = docs[0]
        modified = 0
        if '$set' in update_op:
            for k, v in update_op['$set'].items():
                v = json.loads(json.dumps(v, default=str))
                if '.' in k:
                    # Nested update (e.g. lastReading.aqi)
                    parts = k.split('.')
                    target = doc
                    for p in parts[:-1]:
                        if p not in target: target[p] = {}
                        target = target[p]
                    target[parts[-1]] = v
                else:
                    doc[k] = v
            modified = 1
            
        self.db_store.save()
        return UpdateResult(1, modified)

    def delete_one(self, filter_query):
        initial_count = len(self.db_store.data[self.name])
        self.db_store.data[self.name] = [d for d in self.db_store.data[self.name] if not self._match_filter(d, filter_query)]
        deleted = initial_count - len(self.db_store.data[self.name])
        self.db_store.save()
        return DeleteResult(deleted)

    def count_documents(self, filter_query=None):
        return len(self.find(filter_query))

    def aggregate(self, pipeline):
        # A simple emulator for MATCH and GROUP aggregations used in dashboard
        docs = json.loads(json.dumps(self.db_store.data[self.name]))
        
        for stage in pipeline:
            if '$match' in stage:
                docs = [d for d in docs if self._match_filter(d, stage['$match'])]
            elif '$group' in stage:
                group_config = stage['$group']
                group_id_expr = group_config['_id']
                
                groups = {}
                for d in docs:
                    # Find group key
                    if isinstance(group_id_expr, str) and group_id_expr.startswith('$'):
                        g_key = d.get(group_id_expr[1:])
                    else:
                        g_key = group_id_expr
                        
                    if g_key not in groups:
                        groups[g_key] = []
                    groups[g_key].append(d)
                
                grouped_docs = []
                for g_key, g_docs in groups.items():
                    grouped_doc = {'_id': g_key}
                
                    def get_nested_val(d, f):
                        if not f: return None
                        if '.' in f:
                            parts = f.split('.')
                            curr = d
                            for p in parts:
                                curr = curr.get(p) if isinstance(curr, dict) else None
                            return curr
                        return d.get(f)

                    for op_key, op_val in group_config.items():
                        if op_key == '_id': continue
                        
                        op_name = list(op_val.keys())[0]
                        op_expr = list(op_val.values())[0]
                        
                        # Extract expression field (e.g. "$aqi")
                        field = op_expr[1:] if isinstance(op_expr, str) and op_expr.startswith('$') else None
                        
                        if op_name == '$avg' and field:
                            vals = [float(get_nested_val(doc, field)) for doc in g_docs if get_nested_val(doc, field) is not None]
                            grouped_doc[op_key] = sum(vals)/len(vals) if vals else 0
                        elif op_name == '$max' and field:
                            vals = [float(get_nested_val(doc, field)) for doc in g_docs if get_nested_val(doc, field) is not None]
                            grouped_doc[op_key] = max(vals) if vals else 0
                        elif op_name == '$sum' and field:
                            vals = [float(get_nested_val(doc, field)) for doc in g_docs if get_nested_val(doc, field) is not None]
                            grouped_doc[op_key] = sum(vals)
                        elif op_name == '$sum' and op_expr == 1:
                            grouped_doc[op_key] = len(g_docs)
                            
                    grouped_docs.append(grouped_doc)
                docs = grouped_docs
            elif '$sort' in stage:
                sort_config = stage['$sort']
                sort_key = list(sort_config.keys())[0]
                sort_dir = list(sort_config.values())[0]
                docs.sort(key=lambda x: x.get(sort_key, ""), reverse=(sort_dir == -1))
            elif '$limit' in stage:
                docs = docs[:stage['$limit']]
                
        return docs

class MockDBStore:
    def __init__(self, filepath):
        self.filepath = filepath
        self.data = {}
        self.load()

    def load(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, 'r') as f:
                    self.data = json.load(f)
            except Exception:
                self.data = {}
        else:
            self.data = {}

    def save(self):
        with open(self.filepath, 'w') as f:
            json.dump(self.data, f, indent=2)

class MockMongoClient:
    def __init__(self, filepath='mock_mongodb.json'):
        self.db_store = MockDBStore(filepath)
        
    def __getitem__(self, db_name):
        return MockDatabase(self.db_store)

class MockDatabase:
    def __init__(self, db_store):
        self.db_store = db_store
        
    def __getitem__(self, collection_name):
        return MockCollection(self.db_store, collection_name)


# =============================================================
# 2. Database Connection Factory
# =============================================================
mongo_client = None
db = None
is_mock = False

def connect_db():
    global mongo_client, db, is_mock
    
    mongo_uri = os.getenv('MONGO_URI')
    db_name = os.getenv('DATABASE_NAME', 'airpulse')
    
    # If connection string is missing or still has placeholder text, fallback to mock
    if not mongo_uri or '<username>' in mongo_uri or '<password>' in mongo_uri or '<cluster>' in mongo_uri or len(mongo_uri) < 20:
        print("\n[AirPulse 2.0 WARNING]: No valid MONGO_URI detected in .env.")
        print("Falling back to offline JSON NoSQL Emulator (mock_mongodb.json) for presentation stability.")
        mongo_client = MockMongoClient(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mock_mongodb.json'))
        db = mongo_client[db_name]
        is_mock = True
        return db
        
    try:
        # Establish real MongoDB Connection
        print(f"\nConnecting to MongoDB Atlas Cloud Cluster...")
        mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=4000)
        # Verify connection by fetching server info
        mongo_client.server_info()
        db = mongo_client[db_name]
        is_mock = False
        print("MongoDB Atlas connected successfully!")
    except Exception as e:
        print(f"\nMongoDB Atlas Connection Failed: {str(e)}")
        print("Falling back to local NoSQL Emulator (mock_mongodb.json) for dashboard execution.")
        mongo_client = MockMongoClient(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mock_mongodb.json'))
        db = mongo_client[db_name]
        is_mock = True
        
    return db

def get_db():
    global db
    if db is None:
        db = connect_db()
    return db


# =============================================================
# 3. AQI Calculators and DB Alerts helper
# =============================================================
def calculate_aqi_category(aqi):
    if aqi <= 50: return 'Good'
    elif aqi <= 100: return 'Moderate'
    elif aqi <= 150: return 'Poor'
    elif aqi <= 200: return 'Very Poor'
    else: return 'Severe'

def calculate_aqi_values(pm25, pm10, co, no2, so2, o3):
    # Normalized AQI sub-indexing
    sub_indices = [
        float(pm25) * 1.5,
        float(pm10) * 0.8,
        float(co) * 12.0,
        float(no2) * 1.3,
        float(so2) * 1.8,
        float(o3) * 1.0
    ]
    aqi = min(500, int(max(sub_indices)))
    category = calculate_aqi_category(aqi)
    return aqi, category

def log_audit(action_type, collection_name, doc_id, old_values=None, new_values=None, user='api_admin'):
    """Logs database mutations to audit_logs collection (emulates relational triggers)"""
    db = get_db()
    audit_doc = {
        "actionType": action_type,
        "collectionName": collection_name,
        "documentId": str(doc_id),
        "oldState": old_values,
        "newState": new_values,
        "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "executedBy": user
    }
    db['audit_logs'].insert_one(audit_doc)
    return audit_doc

def check_alerts_and_create(station_id, record_id, pollutants, aqi):
    """Evaluates pollutant thresholds and inserts active SystemAlerts documents"""
    db = get_db()
    alerts_created = []
    
    thresholds = {
        "PM2.5": (pollutants.get("pm25", 0), 150.0),
        "SO2": (pollutants.get("so2", 0), 75.0),
        "AQI": (aqi, 200.0)
    }
    
    for pollutant, (val, limit) in thresholds.items():
        if val > limit:
            alert_doc = {
                "stationId": str(station_id),
                "recordId": str(record_id),
                "pollutant": pollutant,
                "observedValue": float(val),
                "thresholdValue": float(limit),
                "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                "status": "Active"
            }
            db['system_alerts'].insert_one(alert_doc)
            alerts_created.append(alert_doc)
            
    return alerts_created

def sync_all_sqlite_to_mongodb():
    """Synchronizes all tables and trigger logs from SQLite (primary DBMS) to MongoDB Atlas mirror"""
    db = get_db()
    conn = root_db.get_db_connection()
    cursor = conn.cursor()
    
    # 1. Clear MongoDB collections (or emulator arrays)
    collections = ['stations', 'pollution_records', 'health_advisories', 'system_alerts', 'audit_logs']
    for coll in collections:
        if is_mock:
            db[coll].db_store.data[coll] = []
        else:
            db[coll].drop()
            
    # Save empty state for mock
    if is_mock:
        db['stations'].db_store.save()
        
    # 2. Sync HealthAdvisories
    cursor.execute("SELECT * FROM HealthAdvisories")
    advisories = [dict(row) for row in cursor.fetchall()]
    for adv in advisories:
        db['health_advisories'].insert_one({
            "_id": adv['CategoryName'],
            "aqiRange": { "lower": adv['AQILower'], "upper": adv['AQIUpper'] },
            "generalAdvisory": adv['GeneralAdvisory'],
            "sensitiveAdvisory": adv['ChildElderlyAdvisory'],
            "actionTip": adv['ActionTip'],
            "colorCode": adv['ColorCode']
        })
        
    # 3. Sync Stations
    cursor.execute("SELECT * FROM Stations")
    stations = [dict(row) for row in cursor.fetchall()]
    for st in stations:
        st_id = st['StationID']
        mongo_id = f"60c72b2f9b1d8a2c2c8b45{st_id:02x}"
        
        # Get latest reading from PollutionRecords in SQLite
        cursor.execute("""
            SELECT Timestamp, AQI FROM PollutionRecords 
            WHERE StationID = ? 
            ORDER BY Timestamp DESC, RecordID DESC LIMIT 1
        """, (st_id,))
        latest = cursor.fetchone()
        latest_reading = { "timestamp": None, "aqi": None }
        if latest:
            latest_reading = { "timestamp": latest[0], "aqi": latest[1] }
            
        db['stations'].insert_one({
            "_id": mongo_id,
            "name": st['Name'],
            "city": st['City'],
            "location": { "type": "Point", "coordinates": [st['Longitude'], st['Latitude']] },
            "status": st['Status'],
            "establishedDate": st['EstablishedDate'],
            "lastReading": latest_reading
        })
        
    # 4. Sync PollutionRecords
    cursor.execute("SELECT * FROM PollutionRecords")
    records = [dict(row) for row in cursor.fetchall()]
    for rec in records:
        r_id = rec['RecordID']
        mongo_id = f"60c72b2f9b1d8a2c2c8b47{r_id:02x}"
        st_mongo_id = f"60c72b2f9b1d8a2c2c8b45{rec['StationID']:02x}"
        db['pollution_records'].insert_one({
            "_id": mongo_id,
            "stationId": st_mongo_id,
            "timestamp": rec['Timestamp'],
            "pollutants": {
                "pm25": rec['PM25'],
                "pm10": rec['PM10'],
                "co": rec['CO'],
                "no2": rec['NO2'],
                "so2": rec['SO2'],
                "o3": rec['O3']
            },
            "aqi": rec['AQI'],
            "aqiCategory": rec['AQI_Category']
        })
        
    # 5. Sync SystemAlerts
    cursor.execute("SELECT * FROM SystemAlerts")
    alerts = [dict(row) for row in cursor.fetchall()]
    for a in alerts:
        a_id = a['AlertID']
        mongo_id = f"60c72b2f9b1d8a2c2c8b48{a_id:02x}"
        st_mongo_id = f"60c72b2f9b1d8a2c2c8b45{a['StationID']:02x}"
        rec_mongo_id = f"60c72b2f9b1d8a2c2c8b47{a['RecordID']:02x}"
        db['system_alerts'].insert_one({
            "_id": mongo_id,
            "stationId": st_mongo_id,
            "recordId": rec_mongo_id,
            "pollutant": a['Pollutant'],
            "observedValue": a['ObservedValue'],
            "thresholdValue": a['ThresholdValue'],
            "timestamp": a['AlertTimestamp'],
            "status": a['Status']
        })
        
    # 6. Sync AuditLog
    cursor.execute("SELECT * FROM AuditLog ORDER BY LogID ASC")
    logs = [dict(row) for row in cursor.fetchall()]
    for log in logs:
        l_id = log['LogID']
        mongo_id = f"60c72b2f9b1d8a2c2c8b49{l_id:02x}"
        tbl = log['TableName']
        rec_id = log['RecordID']
        
        if tbl == 'PollutionRecords':
            doc_id = f"60c72b2f9b1d8a2c2c8b47{rec_id:02x}"
            collection_name = 'pollution_records'
        elif tbl == 'Stations':
            doc_id = f"60c72b2f9b1d8a2c2c8b45{rec_id:02x}"
            collection_name = 'stations'
        else:
            doc_id = str(rec_id)
            collection_name = tbl.lower()
            
        try:
            old_s = json.loads(log['OldValues']) if log['OldValues'] else None
        except Exception:
            old_s = log['OldValues']
            
        try:
            new_s = json.loads(log['NewValues']) if log['NewValues'] else None
        except Exception:
            new_s = log['NewValues']
            
        db['audit_logs'].insert_one({
            "_id": mongo_id,
            "actionType": log['ActionType'],
            "collectionName": collection_name,
            "documentId": doc_id,
            "oldState": old_s,
            "newState": new_s,
            "timestamp": log['ActionTimestamp'],
            "executedBy": log['ExecutedBy']
        })
        
    if is_mock:
        db['stations'].db_store.save()
        
    conn.close()
