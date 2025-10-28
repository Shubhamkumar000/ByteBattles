from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
from collections import defaultdict
import heapq
import io
import csv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Models
class Teacher(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: Optional[str] = None
    department: Optional[str] = None
    available_slots: List[str] = Field(default_factory=list)

class TeacherCreate(BaseModel):
    name: str
    email: Optional[str] = None
    department: Optional[str] = None
    available_slots: List[str] = Field(default_factory=list)

class Subject(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    code: Optional[str] = None
    sessions_per_week: int
    teacher_id: str
    class_group: str = "Class A"
    duration_minutes: int = 60

class SubjectCreate(BaseModel):
    name: str
    code: Optional[str] = None
    sessions_per_week: int
    teacher_id: str
    class_group: str = "Class A"
    duration_minutes: int = 60

class Room(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    capacity: int = 40
    room_type: Optional[str] = "Classroom"
    has_projector: bool = True

class RoomCreate(BaseModel):
    name: str
    capacity: int = 40
    room_type: Optional[str] = "Classroom"
    has_projector: bool = True

class TimeSlot(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    day: str
    period: int
    start_time: str = "N/A"
    end_time: str = "N/A"
    label: str = ""

class TimeSlotCreate(BaseModel):
    day: str
    period: int
    start_time: str
    end_time: str
    label: Optional[str] = None

class TimetableEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    subject_id: str
    teacher_id: str
    room_id: str
    timeslot_id: str
    class_group: str
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    teacher_name: Optional[str] = None
    room_name: Optional[str] = None
    day: Optional[str] = None
    period: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None

class GenerateRequest(BaseModel):
    class_groups: List[str] = ["Class A"]

class AnalyticsResponse(BaseModel):
    total_classes: int
    teacher_workload: Dict[str, int]
    room_utilization: Dict[str, int]
    peak_hours: Dict[str, int]
    free_slots: int

# Teacher CRUD
@api_router.post("/teachers", response_model=Teacher)
async def create_teacher(input: TeacherCreate):
    teacher = Teacher(**input.model_dump())
    doc = teacher.model_dump()
    await db.teachers.insert_one(doc)
    return teacher

@api_router.get("/teachers", response_model=List[Teacher])
async def get_teachers():
    teachers = await db.teachers.find({}, {"_id": 0}).to_list(1000)
    return teachers

@api_router.put("/teachers/{teacher_id}", response_model=Teacher)
async def update_teacher(teacher_id: str, input: TeacherCreate):
    teacher = Teacher(id=teacher_id, **input.model_dump())
    doc = teacher.model_dump()
    result = await db.teachers.replace_one({"id": teacher_id}, doc)
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return teacher

@api_router.delete("/teachers/{teacher_id}")
async def delete_teacher(teacher_id: str):
    result = await db.teachers.delete_one({"id": teacher_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return {"message": "Teacher deleted"}

# Subject CRUD
@api_router.post("/subjects", response_model=Subject)
async def create_subject(input: SubjectCreate):
    subject = Subject(**input.model_dump())
    doc = subject.model_dump()
    await db.subjects.insert_one(doc)
    return subject

@api_router.get("/subjects", response_model=List[Subject])
async def get_subjects():
    subjects = await db.subjects.find({}, {"_id": 0}).to_list(1000)
    return subjects

@api_router.put("/subjects/{subject_id}", response_model=Subject)
async def update_subject(subject_id: str, input: SubjectCreate):
    subject = Subject(id=subject_id, **input.model_dump())
    doc = subject.model_dump()
    result = await db.subjects.replace_one({"id": subject_id}, doc)
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject

@api_router.delete("/subjects/{subject_id}")
async def delete_subject(subject_id: str):
    result = await db.subjects.delete_one({"id": subject_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Subject not found")
    return {"message": "Subject deleted"}

# Room CRUD
@api_router.post("/rooms", response_model=Room)
async def create_room(input: RoomCreate):
    room = Room(**input.model_dump())
    doc = room.model_dump()
    await db.rooms.insert_one(doc)
    return room

@api_router.get("/rooms", response_model=List[Room])
async def get_rooms():
    rooms = await db.rooms.find({}, {"_id": 0}).to_list(1000)
    return rooms

@api_router.put("/rooms/{room_id}", response_model=Room)
async def update_room(room_id: str, input: RoomCreate):
    room = Room(id=room_id, **input.model_dump())
    doc = room.model_dump()
    result = await db.rooms.replace_one({"id": room_id}, doc)
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    return room

@api_router.delete("/rooms/{room_id}")
async def delete_room(room_id: str):
    result = await db.rooms.delete_one({"id": room_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"message": "Room deleted"}

# TimeSlot CRUD
@api_router.post("/timeslots", response_model=TimeSlot)
async def create_timeslot(input: TimeSlotCreate):
    label = input.label or f"{input.start_time} - {input.end_time}"
    timeslot = TimeSlot(**input.model_dump(), label=label)
    doc = timeslot.model_dump()
    await db.timeslots.insert_one(doc)
    return timeslot

@api_router.get("/timeslots", response_model=List[TimeSlot])
async def get_timeslots():
    timeslots = await db.timeslots.find({}, {"_id": 0}).to_list(1000)
    # Sort by day and period
    day_order = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4}
    timeslots.sort(key=lambda x: (day_order.get(x.get('day', ''), 5), x.get('period', 0)))
    return timeslots

@api_router.delete("/timeslots/{timeslot_id}")
async def delete_timeslot(timeslot_id: str):
    result = await db.timeslots.delete_one({"id": timeslot_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="TimeSlot not found")
    return {"message": "TimeSlot deleted"}

@api_router.post("/timeslots/generate-default")
async def generate_default_timeslots():
    """Generate standard school timetable slots"""
    await db.timeslots.delete_many({})
    
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    time_slots = [
        {"period": 1, "start_time": "09:00 AM", "end_time": "10:00 AM"},
        {"period": 2, "start_time": "10:00 AM", "end_time": "11:00 AM"},
        {"period": 3, "start_time": "11:15 AM", "end_time": "12:15 PM"},
        {"period": 4, "start_time": "12:15 PM", "end_time": "01:15 PM"},
        {"period": 5, "start_time": "02:00 PM", "end_time": "03:00 PM"},
        {"period": 6, "start_time": "03:00 PM", "end_time": "04:00 PM"},
    ]
    
    created_count = 0
    for day in days:
        for slot in time_slots:
            timeslot = TimeSlot(
                day=day,
                period=slot["period"],
                start_time=slot["start_time"],
                end_time=slot["end_time"],
                label=f"{slot['start_time']} - {slot['end_time']}"
            )
            await db.timeslots.insert_one(timeslot.model_dump())
            created_count += 1
    
    return {"message": f"Generated {created_count} default time slots", "count": created_count}

# Algorithm: Graph Coloring + Greedy + Backtracking
class TimetableGenerator:
    def __init__(self, teachers, subjects, rooms, timeslots, class_groups):
        self.teachers = {t['id']: t for t in teachers}
        self.subjects = {s['id']: s for s in subjects}
        self.rooms = {r['id']: r for r in rooms}
        self.timeslots = timeslots
        self.class_groups = class_groups
        self.schedule = []
        
    def generate(self):
        # Step 1: Create class requirements (nodes)
        requirements = []
        for subject_id, subject in self.subjects.items():
            for session_num in range(subject['sessions_per_week']):
                requirements.append({
                    'subject_id': subject_id,
                    'teacher_id': subject['teacher_id'],
                    'class_group': subject['class_group'],
                    'subject_name': subject['name'],
                    'session_num': session_num + 1
                })
        
        if not requirements:
            return []
        
        # Step 2: Build conflict graph
        conflicts = self._build_conflict_graph(requirements)
        
        # Step 3: Sort by constraint degree (greedy priority)
        priority_queue = []
        for i, req in enumerate(requirements):
            degree = len(conflicts.get(i, []))
            heapq.heappush(priority_queue, (-degree, i, req))
        
        # Step 4: Assign time slots using greedy + backtracking
        slot_assignments = {}
        teacher_schedule = defaultdict(set)
        room_schedule = defaultdict(set)
        class_schedule = defaultdict(set)
        
        while priority_queue:
            _, idx, req = heapq.heappop(priority_queue)
            
            assigned = False
            for timeslot in self.timeslots:
                for room_id, room in self.rooms.items():
                    slot_key = timeslot['id']
                    
                    # Check conflicts
                    if slot_key in teacher_schedule.get(req['teacher_id'], set()):
                        continue
                    if slot_key in room_schedule.get(room_id, set()):
                        continue
                    if slot_key in class_schedule.get(req['class_group'], set()):
                        continue
                    
                    # Assign
                    teacher_schedule[req['teacher_id']].add(slot_key)
                    room_schedule[room_id].add(slot_key)
                    class_schedule[req['class_group']].add(slot_key)
                    
                    self.schedule.append({
                        'subject_id': req['subject_id'],
                        'teacher_id': req['teacher_id'],
                        'room_id': room_id,
                        'timeslot_id': slot_key,
                        'class_group': req['class_group']
                    })
                    
                    assigned = True
                    break
                
                if assigned:
                    break
        
        return self.schedule
    
    def _build_conflict_graph(self, requirements):
        conflicts = defaultdict(list)
        for i in range(len(requirements)):
            for j in range(i + 1, len(requirements)):
                r1, r2 = requirements[i], requirements[j]
                # Conflict if same teacher or same class group
                if r1['teacher_id'] == r2['teacher_id'] or r1['class_group'] == r2['class_group']:
                    conflicts[i].append(j)
                    conflicts[j].append(i)
        return conflicts

@api_router.post("/timetable/generate")
async def generate_timetable(request: GenerateRequest):
    # Clear existing timetable
    await db.timetable.delete_many({})
    
    # Fetch all data
    teachers = await db.teachers.find({}, {"_id": 0}).to_list(1000)
    subjects = await db.subjects.find({}, {"_id": 0}).to_list(1000)
    rooms = await db.rooms.find({}, {"_id": 0}).to_list(1000)
    timeslots = await db.timeslots.find({}, {"_id": 0}).to_list(1000)
    
    if not teachers or not subjects or not rooms or not timeslots:
        raise HTTPException(status_code=400, detail="Please add teachers, subjects, rooms, and timeslots first")
    
    # Generate timetable
    generator = TimetableGenerator(teachers, subjects, rooms, timeslots, request.class_groups)
    schedule = generator.generate()
    
    if not schedule:
        raise HTTPException(status_code=400, detail="Could not generate timetable. Please ensure you have subjects configured.")
    
    # Store in database
    for entry in schedule:
        entry['id'] = str(uuid.uuid4())
        await db.timetable.insert_one(entry)
    
    return {"message": "Timetable generated successfully", "entries": len(schedule)}

@api_router.get("/timetable", response_model=List[TimetableEntry])
async def get_timetable():
    entries = await db.timetable.find({}, {"_id": 0}).to_list(1000)
    
    if not entries:
        return []
    
    # Enrich with names and details
    teachers = {t['id']: t for t in await db.teachers.find({}, {"_id": 0}).to_list(1000)}
    subjects = {s['id']: s for s in await db.subjects.find({}, {"_id": 0}).to_list(1000)}
    rooms = {r['id']: r for r in await db.rooms.find({}, {"_id": 0}).to_list(1000)}
    timeslots = {ts['id']: ts for ts in await db.timeslots.find({}, {"_id": 0}).to_list(1000)}
    
    for entry in entries:
        teacher = teachers.get(entry.get('teacher_id'), {})
        subject = subjects.get(entry.get('subject_id'), {})
        room = rooms.get(entry.get('room_id'), {})
        timeslot = timeslots.get(entry.get('timeslot_id'), {})
        
        entry['teacher_name'] = teacher.get('name', 'N/A')
        entry['subject_name'] = subject.get('name', 'N/A')
        entry['subject_code'] = subject.get('code', '')
        entry['room_name'] = room.get('name', 'N/A')
        entry['day'] = timeslot.get('day', 'N/A')
        entry['period'] = timeslot.get('period', 0)
        entry['start_time'] = timeslot.get('start_time', 'N/A')
        entry['end_time'] = timeslot.get('end_time', 'N/A')
    
    return entries

@api_router.get("/timetable/export/csv")
async def export_timetable_csv():
    entries = await db.timetable.find({}, {"_id": 0}).to_list(1000)
    
    if not entries:
        raise HTTPException(status_code=404, detail="No timetable to export")
    
    # Enrich data
    teachers = {t['id']: t for t in await db.teachers.find({}, {"_id": 0}).to_list(1000)}
    subjects = {s['id']: s for s in await db.subjects.find({}, {"_id": 0}).to_list(1000)}
    rooms = {r['id']: r for r in await db.rooms.find({}, {"_id": 0}).to_list(1000)}
    timeslots = {ts['id']: ts for ts in await db.timeslots.find({}, {"_id": 0}).to_list(1000)}
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Day', 'Period', 'Time', 'Subject', 'Teacher', 'Room', 'Class'])
    
    for entry in entries:
        teacher = teachers.get(entry.get('teacher_id'), {})
        subject = subjects.get(entry.get('subject_id'), {})
        room = rooms.get(entry.get('room_id'), {})
        timeslot = timeslots.get(entry.get('timeslot_id'), {})
        
        writer.writerow([
            timeslot.get('day', 'N/A'),
            timeslot.get('period', 'N/A'),
            f"{timeslot.get('start_time', '')} - {timeslot.get('end_time', '')}",
            subject.get('name', 'N/A'),
            teacher.get('name', 'N/A'),
            room.get('name', 'N/A'),
            entry.get('class_group', 'N/A')
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=timetable.csv"}
    )

@api_router.get("/analytics", response_model=AnalyticsResponse)
async def get_analytics():
    entries = await db.timetable.find({}, {"_id": 0}).to_list(1000)
    teachers = {t['id']: t for t in await db.teachers.find({}, {"_id": 0}).to_list(1000)}
    rooms = {r['id']: r for r in await db.rooms.find({}, {"_id": 0}).to_list(1000)}
    timeslots = await db.timeslots.find({}, {"_id": 0}).to_list(1000)
    
    # Calculate statistics
    teacher_workload = defaultdict(int)
    room_utilization = defaultdict(int)
    peak_hours = defaultdict(int)
    
    for entry in entries:
        teacher_id = entry.get('teacher_id')
        room_id = entry.get('room_id')
        timeslot_id = entry.get('timeslot_id')
        
        if teacher_id in teachers:
            teacher_workload[teachers[teacher_id]['name']] += 1
        
        if room_id in rooms:
            room_utilization[rooms[room_id]['name']] += 1
        
        # Find timeslot for peak hours
        ts = next((t for t in timeslots if t['id'] == timeslot_id), None)
        if ts:
            peak_hours[ts['start_time']] += 1
    
    total_possible_slots = len(timeslots)
    total_scheduled = len(entries)
    free_slots = total_possible_slots - total_scheduled if total_possible_slots > 0 else 0
    
    return AnalyticsResponse(
        total_classes=len(entries),
        teacher_workload=dict(teacher_workload),
        room_utilization=dict(room_utilization),
        peak_hours=dict(peak_hours),
        free_slots=free_slots
    )

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()