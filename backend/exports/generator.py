import os
import pandas as pd
from datetime import datetime

# ReportLab imports for PDF generation
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

def generate_csv(records, filepath):
    """Generates a CSV report using Pandas"""
    # Flatten records for DataFrame conversion
    flat_records = []
    for r in records:
        flat_records.append({
            "RecordID": str(r.get("_id")),
            "StationName": r.get("stationName", "Unknown"),
            "City": r.get("city", "Unknown"),
            "Timestamp": r.get("timestamp"),
            "PM2.5": r.get("pollutants", {}).get("pm25"),
            "PM10": r.get("pollutants", {}).get("pm10"),
            "CO": r.get("pollutants", {}).get("co"),
            "NO2": r.get("pollutants", {}).get("no2"),
            "SO2": r.get("pollutants", {}).get("so2"),
            "O3": r.get("pollutants", {}).get("o3"),
            "AQI": r.get("aqi"),
            "Category": r.get("aqiCategory")
        })
    df = pd.DataFrame(flat_records)
    df.to_csv(filepath, index=False)
    return True

def generate_excel(records, filepath):
    """Generates an Excel report using Pandas"""
    flat_records = []
    for r in records:
        flat_records.append({
            "Record ID": str(r.get("_id")),
            "Station Name": r.get("stationName", "Unknown"),
            "City": r.get("city", "Unknown"),
            "Timestamp": r.get("timestamp"),
            "PM2.5 (ug/m3)": r.get("pollutants", {}).get("pm25"),
            "PM10 (ug/m3)": r.get("pollutants", {}).get("pm10"),
            "CO (mg/m3)": r.get("pollutants", {}).get("co"),
            "NO2 (ug/m3)": r.get("pollutants", {}).get("no2"),
            "SO2 (ug/m3)": r.get("pollutants", {}).get("so2"),
            "O3 (ug/m3)": r.get("pollutants", {}).get("o3"),
            "AQI": r.get("aqi"),
            "AQI Category": r.get("aqiCategory")
        })
    df = pd.DataFrame(flat_records)
    df.to_excel(filepath, index=False, sheet_name="Pollution Logs")
    return True

def generate_pdf(records, stats, filepath):
    """Generates a highly-styled PDF report using ReportLab"""
    # Create target directories if they don't exist
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    doc = SimpleDocTemplate(filepath, pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    story = []
    styles = getSampleStyleSheet()

    # Define custom styles
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor('#0f172a'),
        spaceAfter=15
    )
    
    subtitle_style = ParagraphStyle(
        'SubtitleStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        textColor=colors.HexColor('#64748b'),
        spaceAfter=25
    )

    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=colors.HexColor('#3b82f6'),
        spaceBefore=15,
        spaceAfter=10
    )

    body_style = ParagraphStyle(
        'BodyStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor('#334155')
    )

    # 1. Header / Title Section
    story.append(Paragraph("AirPulse Environmental Report", title_style))
    story.append(Paragraph(f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Platform Version 2.0", subtitle_style))
    story.append(Spacer(1, 10))

    # 2. Executive Averages Section
    story.append(Paragraph("City Averages Summary", section_heading))
    
    stats_data = [["City Name", "Average AQI", "Total Readings", "Peak AQI"]]
    for s in stats:
        stats_data.append([
            s.get("City", s.get("_id", "Unknown")),
            f"{s.get('AvgAQI', 0):.1f}",
            str(s.get("RecordCount", s.get("count", 0))),
            str(s.get("MaxAQI", "--"))
        ])
    
    stats_table = Table(stats_data, colWidths=[150, 100, 100, 100])
    stats_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#3b82f6')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f8fafc'), colors.white]),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('FONTSIZE', (0,0), (-1,-1), 9),
    ]))
    story.append(stats_table)
    story.append(Spacer(1, 20))

    # 3. Measurement Records Section
    story.append(Paragraph("Detailed Measurement Logs", section_heading))
    
    records_data = [["Station", "City", "Time", "PM2.5", "PM10", "CO", "O3", "AQI", "Category"]]
    
    # Cap at top 25 records to prevent layout overflows
    for r in records[:25]:
        # Shorten timestamp for space
        t_short = r.get("timestamp", "")
        if len(t_short) > 16:
            t_short = t_short[:16]
            
        records_data.append([
            r.get("stationName", "Unknown")[:15],
            r.get("city", "Unknown"),
            t_short,
            str(r.get("pollutants", {}).get("pm25", 0)),
            str(r.get("pollutants", {}).get("pm10", 0)),
            str(r.get("pollutants", {}).get("co", 0)),
            str(r.get("pollutants", {}).get("o3", 0)),
            str(r.get("aqi", 0)),
            r.get("aqiCategory", "")
        ])

    records_table = Table(records_data, colWidths=[90, 50, 80, 40, 40, 35, 35, 30, 60])
    records_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0,0), (-1,0), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f8fafc'), colors.white]),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ('FONTSIZE', (0,0), (-1,-1), 7.5),
    ]))
    story.append(records_table)
    
    if len(records) > 25:
        story.append(Spacer(1, 10))
        story.append(Paragraph(f"* Note: Showing only the latest 25 readings in PDF out of {len(records)} total records.", subtitle_style))
        
    doc.build(story)
    return True
