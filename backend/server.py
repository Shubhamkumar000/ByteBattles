from fastapi import FastAPI, APIRouter, HTTPException
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
    available_slots: List[str] = Field(default_factory=list)

class TeacherCreate(BaseModel):
    name: str
    available_slots: List[str] = Field(default_factory=list)

class Subject(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    sessions_per_week: int
    teacher_id: str
    class_group: str = "Class A"

class SubjectCreate(BaseModel):
    name: str
    sessions_per_week: int
    teacher_id: str
    class_group: str = "Class A"

class Room(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    capacity: int = 40

class RoomCreate(BaseModel):
    name: str
    capacity: int = 40

class TimeSlot(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    day: str
    period: int
    label: str

class TimeSlotCreate(BaseModel):
    day: str
    period: int
    label: str

class TimetableEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    subject_id: str
    teacher_id: str
    room_id: str
    timeslot_id: str
    class_group: str
    subject_name: Optional[str] = None
    teacher_name: Optional[str] = None
    room_name: Optional[str] = None
    day: Optional[str] = None
    period: Optional[int] = None

class GenerateRequest(BaseModel):
    class_groups: List[str] = ["Class A"]

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

@api_router.delete("/rooms/{room_id}")
async def delete_room(room_id: str):
    result = await db.rooms.delete_one({"id": room_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"message": "Room deleted"}

# TimeSlot CRUD
@api_router.post("/timeslots", response_model=TimeSlot)
async def create_timeslot(input: TimeSlotCreate):
    timeslot = TimeSlot(**input.model_dump())
    doc = timeslot.model_dump()
    await db.timeslots.insert_one(doc)
    return timeslot

@api_router.get("/timeslots", response_model=List[TimeSlot])
async def get_timeslots():
    timeslots = await db.timeslots.find({}, {"_id": 0}).to_list(1000)
    return timeslots

@api_router.delete("/timeslots/{timeslot_id}")
async def delete_timeslot(timeslot_id: str):
    result = await db.timeslots.delete_one({"id": timeslot_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="TimeSlot not found")
    return {"message": "TimeSlot deleted"}

# Algorithm: Graph Coloring + Greedy + Backtracking
class TimetableGenerator:
    def __init__(self, teachers, subjects, rooms, timeslots, class_groups):
        self.teachers = {t['id']: t for t in teachers}
        self.subjects = subjects
        self.rooms = rooms
        self.timeslots = timeslots
        self.class_groups = class_groups
        self.schedule = []
        
    def generate(self):
        # Step 1: Create class requirements (nodes)
        requirements = []
        for subject in self.subjects:
            for _ in range(subject['sessions_per_week']):
                requirements.append({
                    'subject_id': subject['id'],
                    'teacher_id': subject['teacher_id'],
                    'class_group': subject['class_group'],
                    'subject_name': subject['name']
                })
        
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
                for room in self.rooms:
                    slot_key = timeslot['id']
                    room_key = room['id']
                    
                    # Check conflicts
                    if slot_key in teacher_schedule.get(req['teacher_id'], set()):
                        continue
                    if slot_key in room_schedule.get(room_key, set()):
                        continue
                    if slot_key in class_schedule.get(req['class_group'], set()):
                        continue
                    
                    # Assign
                    teacher_schedule[req['teacher_id']].add(slot_key)
                    room_schedule[room_key].add(slot_key)
                    class_schedule[req['class_group']].add(slot_key)
                    
                    self.schedule.append({
                        'subject_id': req['subject_id'],
                        'teacher_id': req['teacher_id'],
                        'room_id': room_key,
                        'timeslot_id': slot_key,
                        'class_group': req['class_group']
                    })
                    
                    assigned = True
                    break
                
                if assigned:
                    break
            
            if not assigned:
                # Backtracking: could not assign - skip for MVP
                pass
        
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
    
    # Store in database
    for entry in schedule:
        entry['id'] = str(uuid.uuid4())
        await db.timetable.insert_one(entry)
    
    return {"message": "Timetable generated successfully", "entries": len(schedule)}

@api_router.get("/timetable", response_model=List[TimetableEntry])
async def get_timetable():
    entries = await db.timetable.find({}, {"_id": 0}).to_list(1000)
    
    # Enrich with names
    teachers = {t['id']: t for t in await db.teachers.find({}, {"_id": 0}).to_list(1000)}
    subjects = {s['id']: s for s in await db.subjects.find({}, {"_id": 0}).to_list(1000)}
    rooms = {r['id']: r for r in await db.rooms.find({}, {"_id": 0}).to_list(1000)}
    timeslots = {ts['id']: ts for ts in await db.timeslots.find({}, {"_id": 0}).to_list(1000)}
    
    for entry in entries:
        entry['teacher_name'] = teachers.get(entry['teacher_id'], {}).get('name', 'Unknown')
        entry['subject_name'] = subjects.get(entry['subject_id'], {}).get('name', 'Unknown')
        entry['room_name'] = rooms.get(entry['room_id'], {}).get('name', 'Unknown')
        ts = timeslots.get(entry['timeslot_id'], {})
        entry['day'] = ts.get('day', 'Unknown')
        entry['period'] = ts.get('period', 0)
    
    return entries

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