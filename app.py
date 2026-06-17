from flask import Flask, render_template, jsonify, request
import sqlite3
import os
import json
from datetime import datetime
from database import get_db_connection, init_db, calculate_aqi_category

app = Flask(__name__)
app.config['SECRET_KEY'] = 'airpulse-secret-key-for-dbms-project'

def calculate_aqi_values(pm25, pm10, co, no2, so2, o3):
    """
    Calculates AQI based on the critical pollutant method (max sub-index).
    """
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

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard_data():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # 1. Fetch all stations
        cursor.execute("SELECT * FROM Stations ORDER BY City, Name")
        stations = [dict(row) for row in cursor.fetchall()]
        
        # 2. Fetch latest pollution records for each station
        cursor.execute("""
            SELECT d1.* FROM DetailedPollutionDashboard d1
            INNER JOIN (
                SELECT StationID, MAX(Timestamp) as MaxTime 
                FROM PollutionRecords 
                GROUP BY StationID
            ) d2 ON d1.StationID = d2.StationID AND d1.Timestamp = d2.MaxTime
        """)
        latest_records = [dict(row) for row in cursor.fetchall()]
        
        # 3. Fetch active system alerts
        cursor.execute("""
            SELECT sa.*, s.Name as StationName, s.City 
            FROM SystemAlerts sa
            JOIN Stations s ON sa.StationID = s.StationID
            WHERE sa.Status = 'Active'
            ORDER BY sa.AlertTimestamp DESC
        """)
        alerts = [dict(row) for row in cursor.fetchall()]
        
        # 4. Fetch city averages (Aggregate, Group By)
        cursor.execute("""
            SELECT City, 
                   ROUND(AVG(AQI), 1) as AvgAQI, 
                   COUNT(RecordID) as RecordCount,
                   MAX(AQI) as MaxAQI
            FROM DetailedPollutionDashboard
            GROUP BY City
            ORDER BY AvgAQI DESC
        """)
        city_stats = [dict(row) for row in cursor.fetchall()]

        # 5. Fetch recent audit logs (up to 15)
        cursor.execute("""
            SELECT * FROM AuditLog 
            ORDER BY ActionTimestamp DESC, LogID DESC 
            LIMIT 15
        """)
        audit_logs = [dict(row) for row in cursor.fetchall()]
        
        return jsonify({
            'success': True,
            'stations': stations,
            'latest_records': latest_records,
            'alerts': alerts,
            'city_stats': city_stats,
            'audit_logs': audit_logs
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/trends', methods=['GET'])
def get_trends_data():
    station_id = request.args.get('station_id', type=int)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if station_id:
            cursor.execute("""
                SELECT Timestamp, AQI, PM25, PM10, CO, NO2, SO2, O3
                FROM PollutionRecords
                WHERE StationID = ?
                ORDER BY Timestamp ASC
            """, (station_id,))
        else:
            # Aggregate dashboard trends: Average AQI by date across all stations
            cursor.execute("""
                SELECT SUBSTR(Timestamp, 1, 10) as Date, 
                       ROUND(AVG(AQI), 1) as AvgAQI
                FROM PollutionRecords
                GROUP BY Date
                ORDER BY Date ASC
            """)
        
        trends = [dict(row) for row in cursor.fetchall()]
        return jsonify({'success': True, 'trends': trends})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/stations', methods=['POST'])
def add_station():
    data = request.json
    name = data.get('name')
    city = data.get('city')
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    status = data.get('status', 'Active')
    established_date = data.get('established_date', datetime.now().strftime('%Y-%m-%d'))
    
    if not name or not city or latitude is None or longitude is None:
        return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO Stations (Name, City, Latitude, Longitude, Status, EstablishedDate)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (name, city, latitude, longitude, status, established_date))
        conn.commit()
        station_id = cursor.lastrowid
        return jsonify({'success': True, 'message': 'Station added successfully!', 'station_id': station_id})
    except sqlite3.IntegrityError as e:
        return jsonify({'success': False, 'error': f'Database Integrity Violation: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/records', methods=['GET', 'POST'])
def manage_records():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'GET':
        try:
            # Join query to fetch complete records details
            cursor.execute("""
                SELECT pr.*, s.Name as StationName, s.City 
                FROM PollutionRecords pr
                JOIN Stations s ON pr.StationID = s.StationID
                ORDER BY pr.Timestamp DESC, pr.RecordID DESC
                LIMIT 50
            """)
            records = [dict(row) for row in cursor.fetchall()]
            return jsonify({'success': True, 'records': records})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
        finally:
            conn.close()
            
    elif request.method == 'POST':
        data = request.json
        station_id = data.get('station_id')
        timestamp = data.get('timestamp', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        pm25 = data.get('pm25')
        pm10 = data.get('pm10')
        co = data.get('co')
        no2 = data.get('no2')
        so2 = data.get('so2')
        o3 = data.get('o3')
        
        if not station_id or pm25 is None or pm10 is None or co is None or no2 is None or so2 is None or o3 is None:
            return jsonify({'success': False, 'error': 'Missing required pollutant concentrations'}), 400
            
        try:
            # Calculate AQI and AQI Category in backend
            aqi, category = calculate_aqi_values(pm25, pm10, co, no2, so2, o3)
            
            cursor.execute("""
                INSERT INTO PollutionRecords (StationID, Timestamp, PM25, PM10, CO, NO2, SO2, O3, AQI, AQI_Category)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (station_id, timestamp, pm25, pm10, co, no2, so2, o3, aqi, category))
            conn.commit()
            record_id = cursor.lastrowid
            return jsonify({
                'success': True, 
                'message': 'Pollution record inserted successfully!', 
                'record_id': record_id,
                'calculated_aqi': aqi,
                'calculated_category': category
            })
        except sqlite3.IntegrityError as e:
            return jsonify({'success': False, 'error': f'Database Constraint Failed: {str(e)}'}), 400
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
        finally:
            conn.close()

@app.route('/api/records/<int:record_id>', methods=['PUT', 'DELETE'])
def mutate_record(record_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if request.method == 'PUT':
        data = request.json
        pm25 = data.get('pm25')
        pm10 = data.get('pm10')
        co = data.get('co')
        no2 = data.get('no2')
        so2 = data.get('so2')
        o3 = data.get('o3')
        
        if pm25 is None or pm10 is None or co is None or no2 is None or so2 is None or o3 is None:
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
            
        try:
            aqi, category = calculate_aqi_values(pm25, pm10, co, no2, so2, o3)
            cursor.execute("""
                UPDATE PollutionRecords
                SET PM25 = ?, PM10 = ?, CO = ?, NO2 = ?, SO2 = ?, O3 = ?, AQI = ?, AQI_Category = ?
                WHERE RecordID = ?
            """, (pm25, pm10, co, no2, so2, o3, aqi, category, record_id))
            conn.commit()
            return jsonify({'success': True, 'message': 'Record updated successfully!', 'aqi': aqi, 'category': category})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
        finally:
            conn.close()
            
    elif request.method == 'DELETE':
        try:
            cursor.execute("DELETE FROM PollutionRecords WHERE RecordID = ?", (record_id,))
            conn.commit()
            return jsonify({'success': True, 'message': f'Record {record_id} deleted successfully!'})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
        finally:
            conn.close()

@app.route('/api/sql-console', methods=['POST'])
def run_sql():
    data = request.json
    query = data.get('query', '').strip()
    
    if not query:
        return jsonify({'success': False, 'error': 'SQL query cannot be empty.'}), 400
        
    # Block extremely destructive administrative database commands for security (demo safety)
    blocked_commands = ['DROP DATABASE', 'ATTACH', 'DETACH']
    for cmd in blocked_commands:
        if cmd in query.upper():
            return jsonify({'success': False, 'error': f'Query blocked: command "{cmd}" is disabled in the web console.'}), 403
            
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(query)
        
        # Check if the query is a SELECT statement (or PRAGMA/EXPLAIN)
        is_select = query.upper().startswith(('SELECT', 'EXPLAIN', 'PRAGMA', 'WITH'))
        
        if is_select:
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            rows = cursor.fetchall()
            row_list = []
            for row in rows:
                row_list.append(list(row))
                
            return jsonify({
                'success': True,
                'type': 'select',
                'columns': columns,
                'rows': row_list,
                'row_count': len(row_list)
            })
        else:
            conn.commit()
            affected = cursor.rowcount
            return jsonify({
                'success': True,
                'type': 'mutation',
                'affected_rows': affected,
                'message': f'Query executed successfully. Affected rows: {affected}'
            })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    finally:
        conn.close()

@app.route('/api/reset-db', methods=['POST'])
def reset_db():
    try:
        init_db(force=True)
        return jsonify({'success': True, 'message': 'Database re-seeded successfully!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    # Ensure database is set up
    if not os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'airpulse.db')):
        init_db()
    # Run server
    app.run(debug=True, port=5000)
