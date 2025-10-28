import { useState, useEffect } from "react";
import axios from "axios";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Users, BookOpen, Building2, Clock, Calendar, Sparkles, Download, BarChart3, RefreshCw } from "lucide-react";
import TimetableGrid from "@/components/TimetableGrid";
import AnalyticsPanel from "@/components/AnalyticsPanel";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
const useMockIfBackendDown = process.env.REACT_APP_MOCK === "true";

function generateId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readLocal(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function generateLocalTimetable({ teachers, subjects, rooms, timeslots }) {
  // Ensure arrays
  const subjectsList = Array.isArray(subjects) ? subjects : [];
  const timeslotsList = Array.isArray(timeslots) ? timeslots : [];
  const roomsList = Array.isArray(rooms) ? rooms : [];

  // Index helpers
  const timeslotById = new Map(timeslotsList.map((ts) => [ts.id, ts]));
  const days = [...new Set(timeslotsList.map((ts) => ts.day))];

  // Schedules and usage trackers
  const teacherTs = new Map(); // teacherId -> Set(timeslotId)
  const classTs = new Map(); // classGroup -> Set(timeslotId)
  const roomTs = new Map(); // roomId -> Set(timeslotId)
  const teacherDayPeriods = new Map(); // teacherId -> day -> Set(period)
  const teacherDayLoad = new Map(); // teacherId -> day -> count
  const teacherPeriodLoad = new Map(); // teacherId -> period -> count (across all days)
  const subjectDayLoad = new Map(); // subjectId -> day -> count
  const roomUsage = new Map(); // roomId -> overall count

  const ensureSet = (map, key) => {
    if (!map.has(key)) map.set(key, new Set());
    return map.get(key);
  };
  const ensureMap = (map, key) => {
    if (!map.has(key)) map.set(key, new Map());
    return map.get(key);
  };

  const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);

  // Sort subjects by sessions per week desc, then randomize slight order
  const sortedSubjects = [...subjectsList]
    .sort((a, b) => (b.sessions_per_week || 0) - (a.sessions_per_week || 0))
    .map((s) => ({ s, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map(({ s }) => s);

  const schedule = [];

  for (const subject of sortedSubjects) {
    const sessions = Math.max(1, Number(subject.sessions_per_week || 1));
    const teacherId = subject.teacher_id;
    const classGroup = subject.class_group || "Class A";

    for (let sIdx = 0; sIdx < sessions; sIdx += 1) {
      // Rank timeslots by a score that spreads across days and avoids consecutive periods
      // Shuffle timeslots to avoid deterministic patterns
      const shuffledTs = [...timeslotsList]
        .map((ts) => ({ ts, r: Math.random() }))
        .sort((a, b) => a.r - b.r)
        .map(({ ts }) => ts);

      const scoredTs = shuffledTs
        .map((ts) => {
          const tSet = ensureSet(teacherTs, teacherId);
          const cSet = ensureSet(classTs, classGroup);
          const tDayPeriods = ensureMap(teacherDayPeriods, teacherId);
          const dayPeriods = ensureSet(tDayPeriods, ts.day);
          const tDayLoads = ensureMap(teacherDayLoad, teacherId);
          const tDayCount = tDayLoads.get(ts.day) || 0;
          const subjDayLoads = ensureMap(subjectDayLoad, subject.id);
          const subjDayCount = subjDayLoads.get(ts.day) || 0;
          const tPeriodLoad = ensureMap(teacherPeriodLoad, teacherId);
          const periodCount = tPeriodLoad.get(ts.period) || 0;

          // Hard conflicts
          const hardConflict = tSet.has(ts.id) || cSet.has(ts.id);

          // Soft constraint: avoid consecutive periods for teacher
          const consecutive = dayPeriods.has((ts.period || 0) - 1) || dayPeriods.has((ts.period || 0) + 1);

          // Score components: lower is better
          let score = 0;
          score += subjDayCount * 5; // spread subject across days
          score += tDayCount * 3; // spread teacher load across days
          score += consecutive ? 20 : 0; // avoid consecutive teaching
          score += periodCount * 6; // avoid same period every day for a teacher
          score += Math.random(); // small jitter to diversify choices

          return { ts, score, hardConflict };
        })
        .filter((x) => !x.hardConflict)
        .sort((a, b) => a.score - b.score);

      let chosen = null;
      let chosenRoom = null;

      for (const candidate of scoredTs) {
        const { ts } = candidate;
        // Pick a room with minimal overall usage that is free at this timeslot
        const availableRooms = roomsList.filter((room) => !ensureSet(roomTs, room.id).has(ts.id));
        if (availableRooms.length === 0) continue;
        availableRooms.sort((ra, rb) => (roomUsage.get(ra.id) || 0) - (roomUsage.get(rb.id) || 0));
        const room = availableRooms[0];

        chosen = ts;
        chosenRoom = room;
        break;
      }

      if (chosen && chosenRoom) {
        // Commit assignment
        ensureSet(teacherTs, teacherId).add(chosen.id);
        ensureSet(classTs, classGroup).add(chosen.id);
        ensureSet(roomTs, chosenRoom.id).add(chosen.id);

        const tDayPeriods = ensureMap(teacherDayPeriods, teacherId);
        ensureSet(tDayPeriods, chosen.day).add(chosen.period);
        inc(ensureMap(teacherDayLoad, teacherId), chosen.day);
        inc(ensureMap(teacherPeriodLoad, teacherId), chosen.period);
        inc(ensureMap(subjectDayLoad, subject.id), chosen.day);
        inc(roomUsage, chosenRoom.id);

        schedule.push({
          id: generateId(),
          subject_id: subject.id,
          teacher_id: teacherId,
          room_id: chosenRoom.id,
          timeslot_id: chosen.id,
          class_group: classGroup,
        });
      }
      // If no slot found, skip; user can add more rooms/timeslots
    }
  }

  return schedule;
}

function enrichSchedule(schedule, { teachers, subjects, rooms, timeslots }) {
  const teacherById = new Map((teachers || []).map((t) => [t.id, t]));
  const subjectById = new Map((subjects || []).map((s) => [s.id, s]));
  const roomById = new Map((rooms || []).map((r) => [r.id, r]));
  const tsById = new Map((timeslots || []).map((ts) => [ts.id, ts]));

  return (schedule || []).map((e) => {
    const t = teacherById.get(e.teacher_id) || {};
    const s = subjectById.get(e.subject_id) || {};
    const r = roomById.get(e.room_id) || {};
    const ts = tsById.get(e.timeslot_id) || {};
    return {
      ...e,
      teacher_name: t.name || "N/A",
      subject_name: s.name || "N/A",
      subject_code: s.code || "",
      room_name: r.name || "N/A",
      day: ts.day || "N/A",
      period: ts.period || 0,
      start_time: ts.start_time || "N/A",
      end_time: ts.end_time || "N/A",
    };
  });
}
const API = `${BACKEND_URL}/api`;

export default function Dashboard() {
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [timeslots, setTimeslots] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const [teacherForm, setTeacherForm] = useState({ name: "", email: "", department: "" });
  const [subjectForm, setSubjectForm] = useState({ 
    name: "", 
    code: "",
    sessions_per_week: 3, 
    teacher_id: "", 
    class_group: "Class A",
    duration_minutes: 60 
  });
  const [roomForm, setRoomForm] = useState({ name: "", capacity: 40, room_type: "Classroom" });
  const [timeslotForm, setTimeslotForm] = useState({ 
    day: "Monday", 
    period: 1, 
    start_time: "09:00 AM",
    end_time: "10:00 AM" 
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [t, s, r, ts] = await Promise.all([
        axios.get(`${API}/teachers`),
        axios.get(`${API}/subjects`),
        axios.get(`${API}/rooms`),
        axios.get(`${API}/timeslots`)
      ]);
      setTeachers(t.data);
      setSubjects(s.data);
      setRooms(r.data);
      setTimeslots(ts.data);
    } catch (e) {
      // Fallback to localStorage for frontend-only usage
      const t = readLocal("teachers");
      const s = readLocal("subjects");
      const r = readLocal("rooms");
      const ts = readLocal("timeslots");
      setTeachers(t);
      setSubjects(s);
      setRooms(r);
      setTimeslots(ts);
      if (!useMockIfBackendDown) {
        toast.error("Backend unavailable. Using local data.");
      }
    }
  };

  const fetchTimetable = async () => {
    try {
      const res = await axios.get(`${API}/timetable`);
      setTimetable(res.data);
    } catch (e) {
      // No backend: show empty timetable
      const raw = readLocal("timetable", []);
      const enriched = enrichSchedule(raw, { teachers, subjects, rooms, timeslots });
      setTimetable(enriched);
      if (!useMockIfBackendDown) {
        toast.error("Backend unavailable. Timetable not generated");
      }
    }
  };

  const generateDefaultSlots = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API}/timeslots/generate-default`);
      toast.success(res.data.message);
      await fetchAll();
    } catch (e) {
      // Fallback: generate default locally
      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
      const base = [
        { period: 1, start_time: "09:00 AM", end_time: "10:00 AM" },
        { period: 2, start_time: "10:00 AM", end_time: "11:00 AM" },
        { period: 3, start_time: "11:15 AM", end_time: "12:15 PM" },
        { period: 4, start_time: "12:15 PM", end_time: "01:15 PM" },
        { period: 5, start_time: "02:00 PM", end_time: "03:00 PM" },
        { period: 6, start_time: "03:00 PM", end_time: "04:00 PM" },
      ];
      const generated = [];
      days.forEach((day) => {
        base.forEach((slot) => {
          generated.push({
            id: generateId(),
            day,
            period: slot.period,
            start_time: slot.start_time,
            end_time: slot.end_time,
            label: `${slot.start_time} - ${slot.end_time}`,
          });
        });
      });
      writeLocal("timeslots", generated);
      setTimeslots(generated);
      toast.success(`Generated ${generated.length} default time slots (local)`);
    } finally {
      setLoading(false);
    }
  };

  const addTeacher = async (e) => {
    e.preventDefault();
    if (!teacherForm.name.trim()) {
      toast.error("Teacher name is required");
      return;
    }
    try {
      await axios.post(`${API}/teachers`, teacherForm);
      toast.success("Teacher added successfully");
      setTeacherForm({ name: "", email: "", department: "" });
      fetchAll();
    } catch (e) {
      const current = readLocal("teachers");
      const newTeacher = { id: generateId(), ...teacherForm, available_slots: [] };
      const next = [...current, newTeacher];
      writeLocal("teachers", next);
      setTeachers(next);
      setTeacherForm({ name: "", email: "", department: "" });
      toast.success("Teacher added locally");
    }
  };

  const addSubject = async (e) => {
    e.preventDefault();
    if (!subjectForm.name.trim() || !subjectForm.teacher_id) {
      toast.error("Subject name and teacher are required");
      return;
    }
    try {
      await axios.post(`${API}/subjects`, subjectForm);
      toast.success("Subject added successfully");
      setSubjectForm({ 
        name: "", 
        code: "",
        sessions_per_week: 3, 
        teacher_id: "", 
        class_group: "Class A",
        duration_minutes: 60 
      });
      fetchAll();
    } catch (e) {
      const current = readLocal("subjects");
      const next = [...current, { id: generateId(), ...subjectForm }];
      writeLocal("subjects", next);
      setSubjects(next);
      setSubjectForm({ 
        name: "", 
        code: "",
        sessions_per_week: 3, 
        teacher_id: "", 
        class_group: "Class A",
        duration_minutes: 60 
      });
      toast.success("Subject added locally");
    }
  };

  const addRoom = async (e) => {
    e.preventDefault();
    if (!roomForm.name.trim()) {
      toast.error("Room name is required");
      return;
    }
    try {
      await axios.post(`${API}/rooms`, roomForm);
      toast.success("Room added successfully");
      setRoomForm({ name: "", capacity: 40, room_type: "Classroom" });
      fetchAll();
    } catch (e) {
      const current = readLocal("rooms");
      const next = [...current, { id: generateId(), ...roomForm }];
      writeLocal("rooms", next);
      setRooms(next);
      setRoomForm({ name: "", capacity: 40, room_type: "Classroom" });
      toast.success("Room added locally");
    }
  };

  const addTimeslot = async (e) => {
    e.preventDefault();
    if (!timeslotForm.start_time || !timeslotForm.end_time) {
      toast.error("Start time and end time are required");
      return;
    }
    try {
      await axios.post(`${API}/timeslots`, timeslotForm);
      toast.success("Time slot added successfully");
      setTimeslotForm({ 
        day: "Monday", 
        period: 1, 
        start_time: "09:00 AM",
        end_time: "10:00 AM" 
      });
      fetchAll();
    } catch (e) {
      const current = readLocal("timeslots");
      const next = [...current, { id: generateId(), label: `${timeslotForm.start_time} - ${timeslotForm.end_time}`, ...timeslotForm }];
      writeLocal("timeslots", next);
      setTimeslots(next);
      setTimeslotForm({ 
        day: "Monday", 
        period: 1, 
        start_time: "09:00 AM",
        end_time: "10:00 AM" 
      });
      toast.success("Time slot added locally");
    }
  };

  const deleteTeacher = async (id) => {
    try {
      await axios.delete(`${API}/teachers/${id}`);
      toast.success("Teacher deleted");
      fetchAll();
    } catch (e) {
      const next = readLocal("teachers").filter((x) => x.id !== id);
      writeLocal("teachers", next);
      setTeachers(next);
      toast.success("Teacher deleted locally");
    }
  };

  const deleteSubject = async (id) => {
    try {
      await axios.delete(`${API}/subjects/${id}`);
      toast.success("Subject deleted");
      fetchAll();
    } catch (e) {
      const next = readLocal("subjects").filter((x) => x.id !== id);
      writeLocal("subjects", next);
      setSubjects(next);
      toast.success("Subject deleted locally");
    }
  };

  const deleteRoom = async (id) => {
    try {
      await axios.delete(`${API}/rooms/${id}`);
      toast.success("Room deleted");
      fetchAll();
    } catch (e) {
      const next = readLocal("rooms").filter((x) => x.id !== id);
      writeLocal("rooms", next);
      setRooms(next);
      toast.success("Room deleted locally");
    }
  };

  const deleteTimeslot = async (id) => {
    try {
      await axios.delete(`${API}/timeslots/${id}`);
      toast.success("Time slot deleted");
      fetchAll();
    } catch (e) {
      const next = readLocal("timeslots").filter((x) => x.id !== id);
      writeLocal("timeslots", next);
      setTimeslots(next);
      toast.success("Time slot deleted locally");
    }
  };

  const generateTimetable = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API}/timetable/generate`, { class_groups: ["Class A"] });
      toast.success(res.data.message);
      await fetchTimetable();
    } catch (e) {
      // Frontend-only generation as a fallback
      const localSchedule = generateLocalTimetable({
        teachers,
        subjects,
        rooms,
        timeslots,
      });
      const enriched = enrichSchedule(localSchedule, { teachers, subjects, rooms, timeslots });
      writeLocal("timetable", enriched);
      setTimetable(enriched);
      if (localSchedule.length === 0) {
        toast.error("Add teachers, subjects, rooms, and timeslots to generate a timetable.");
      } else {
        toast.success(`Generated ${enriched.length} timetable entries locally`);
      }
    } finally {
      setLoading(false);
    }
  };

  const exportTimetable = async () => {
    try {
      const response = await axios.get(`${API}/timetable/export/csv`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'timetable.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Timetable exported successfully");
    } catch (e) {
      toast.error("Export requires backend");
    }
  };

  return (
    <div data-testid="dashboard" className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-blue-600 mb-2">
            Amdraipt
          </h1>
          <p className="text-base lg:text-lg text-slate-600">
            Adaptive Multi-Dimensional Resource Allocation and Intelligent Planning Tool
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-cyan-600" />
              <div>
                <p className="text-sm text-slate-500">Teachers</p>
                <p className="text-2xl font-bold text-slate-800">{teachers.length}</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-slate-500">Subjects</p>
                <p className="text-2xl font-bold text-slate-800">{subjects.length}</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-teal-600" />
              <div>
                <p className="text-sm text-slate-500">Rooms</p>
                <p className="text-2xl font-bold text-slate-800">{rooms.length}</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-sky-600" />
              <div>
                <p className="text-sm text-slate-500">Time Slots</p>
                <p className="text-2xl font-bold text-slate-800">{timeslots.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-xl p-6 mb-8">
          <Tabs defaultValue="teachers" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="teachers" data-testid="tab-teachers">Teachers</TabsTrigger>
              <TabsTrigger value="subjects" data-testid="tab-subjects">Subjects</TabsTrigger>
              <TabsTrigger value="rooms" data-testid="tab-rooms">Rooms</TabsTrigger>
              <TabsTrigger value="timeslots" data-testid="tab-timeslots">Time Slots</TabsTrigger>
            </TabsList>

            <TabsContent value="teachers" data-testid="teachers-panel">
              <Card>
                <CardHeader>
                  <CardTitle>Add Teacher</CardTitle>
                  <CardDescription>Manage your teaching staff with detailed information</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={addTeacher} className="space-y-4">
                    <div>
                      <Label htmlFor="teacher-name">Teacher Name *</Label>
                      <Input
                        id="teacher-name"
                        data-testid="teacher-name-input"
                        value={teacherForm.name}
                        onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })}
                        placeholder="e.g., Dr. Sarah Smith"
                      />
                    </div>
                    <div>
                      <Label htmlFor="teacher-email">Email (Optional)</Label>
                      <Input
                        id="teacher-email"
                        data-testid="teacher-email-input"
                        type="email"
                        value={teacherForm.email}
                        onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })}
                        placeholder="sarah.smith@school.edu"
                      />
                    </div>
                    <div>
                      <Label htmlFor="teacher-department">Department (Optional)</Label>
                      <Input
                        id="teacher-department"
                        data-testid="teacher-department-input"
                        value={teacherForm.department}
                        onChange={(e) => setTeacherForm({ ...teacherForm, department: e.target.value })}
                        placeholder="e.g., Mathematics"
                      />
                    </div>
                    <Button type="submit" data-testid="add-teacher-btn" className="w-full">Add Teacher</Button>
                  </form>

                  <div className="mt-6 space-y-2">
                    <h3 className="font-semibold text-sm text-slate-700">Teachers List</h3>
                    {teachers.length === 0 ? (
                      <p className="text-sm text-slate-500">No teachers added yet</p>
                    ) : (
                      teachers.map((t) => (
                        <div key={t.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                          <div>
                            <span className="font-medium">{t.name}</span>
                            {t.department && <span className="text-sm text-slate-500 ml-2">• {t.department}</span>}
                            {t.email && <div className="text-xs text-slate-400">{t.email}</div>}
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteTeacher(t.id)}
                            data-testid={`delete-teacher-${t.id}`}
                          >
                            Delete
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="subjects" data-testid="subjects-panel">
              <Card>
                <CardHeader>
                  <CardTitle>Add Subject</CardTitle>
                  <CardDescription>Define subjects with codes and weekly sessions</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={addSubject} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="subject-name">Subject Name *</Label>
                        <Input
                          id="subject-name"
                          data-testid="subject-name-input"
                          value={subjectForm.name}
                          onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                          placeholder="e.g., Mathematics"
                        />
                      </div>
                      <div>
                        <Label htmlFor="subject-code">Subject Code</Label>
                        <Input
                          id="subject-code"
                          data-testid="subject-code-input"
                          value={subjectForm.code}
                          onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })}
                          placeholder="e.g., MATH101"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="sessions-per-week">Sessions Per Week</Label>
                        <Input
                          id="sessions-per-week"
                          data-testid="sessions-input"
                          type="number"
                          min="1"
                          max="10"
                          value={subjectForm.sessions_per_week}
                          onChange={(e) => setSubjectForm({ ...subjectForm, sessions_per_week: parseInt(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="duration">Duration (minutes)</Label>
                        <Input
                          id="duration"
                          data-testid="duration-input"
                          type="number"
                          value={subjectForm.duration_minutes}
                          onChange={(e) => setSubjectForm({ ...subjectForm, duration_minutes: parseInt(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="teacher-select">Assign Teacher *</Label>
                      <select
                        id="teacher-select"
                        data-testid="teacher-select"
                        className="input-field"
                        value={subjectForm.teacher_id}
                        onChange={(e) => setSubjectForm({ ...subjectForm, teacher_id: e.target.value })}
                      >
                        <option value="">Select a teacher</option>
                        {teachers.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                    <Button type="submit" data-testid="add-subject-btn" className="w-full">Add Subject</Button>
                  </form>

                  <div className="mt-6 space-y-2">
                    <h3 className="font-semibold text-sm text-slate-700">Subjects List</h3>
                    {subjects.length === 0 ? (
                      <p className="text-sm text-slate-500">No subjects added yet</p>
                    ) : (
                      subjects.map((s) => (
                        <div key={s.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{s.name}</span>
                              {s.code && <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{s.code}</span>}
                            </div>
                            <span className="text-sm text-slate-500">
                              {s.sessions_per_week} sessions/week • {s.duration_minutes} min each
                            </span>
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteSubject(s.id)}
                            data-testid={`delete-subject-${s.id}`}
                          >
                            Delete
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="rooms" data-testid="rooms-panel">
              <Card>
                <CardHeader>
                  <CardTitle>Add Room</CardTitle>
                  <CardDescription>Configure classroom details and facilities</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={addRoom} className="space-y-4">
                    <div>
                      <Label htmlFor="room-name">Room Name *</Label>
                      <Input
                        id="room-name"
                        data-testid="room-name-input"
                        value={roomForm.name}
                        onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                        placeholder="e.g., Room 101 / Science Lab"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="room-capacity">Capacity</Label>
                        <Input
                          id="room-capacity"
                          data-testid="room-capacity-input"
                          type="number"
                          min="1"
                          value={roomForm.capacity}
                          onChange={(e) => setRoomForm({ ...roomForm, capacity: parseInt(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="room-type">Room Type</Label>
                        <select
                          id="room-type"
                          data-testid="room-type-select"
                          className="input-field"
                          value={roomForm.room_type}
                          onChange={(e) => setRoomForm({ ...roomForm, room_type: e.target.value })}
                        >
                          <option>Classroom</option>
                          <option>Laboratory</option>
                          <option>Auditorium</option>
                          <option>Computer Lab</option>
                          <option>Library</option>
                        </select>
                      </div>
                    </div>
                    <Button type="submit" data-testid="add-room-btn" className="w-full">Add Room</Button>
                  </form>

                  <div className="mt-6 space-y-2">
                    <h3 className="font-semibold text-sm text-slate-700">Rooms List</h3>
                    {rooms.length === 0 ? (
                      <p className="text-sm text-slate-500">No rooms added yet</p>
                    ) : (
                      rooms.map((r) => (
                        <div key={r.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{r.name}</span>
                              {r.room_type && <span className="text-xs px-2 py-0.5 bg-teal-100 text-teal-700 rounded">{r.room_type}</span>}
                            </div>
                            <span className="text-sm text-slate-500">Capacity: {r.capacity} students</span>
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteRoom(r.id)}
                            data-testid={`delete-room-${r.id}`}
                          >
                            Delete
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="timeslots" data-testid="timeslots-panel">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Add Time Slot</CardTitle>
                      <CardDescription>Define your scheduling periods with exact times</CardDescription>
                    </div>
                    <Button 
                      onClick={generateDefaultSlots}
                      disabled={loading}
                      variant="outline"
                      data-testid="generate-default-slots-btn"
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Generate Default
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <form onSubmit={addTimeslot} className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="day-select">Day</Label>
                        <select
                          id="day-select"
                          data-testid="day-select"
                          className="input-field"
                          value={timeslotForm.day}
                          onChange={(e) => setTimeslotForm({ ...timeslotForm, day: e.target.value })}
                        >
                          <option>Monday</option>
                          <option>Tuesday</option>
                          <option>Wednesday</option>
                          <option>Thursday</option>
                          <option>Friday</option>
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="period-input">Period</Label>
                        <Input
                          id="period-input"
                          data-testid="period-input"
                          type="number"
                          min="1"
                          max="10"
                          value={timeslotForm.period}
                          onChange={(e) => setTimeslotForm({ ...timeslotForm, period: parseInt(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="start-time">Start Time</Label>
                        <Input
                          id="start-time"
                          data-testid="start-time-input"
                          value={timeslotForm.start_time}
                          onChange={(e) => setTimeslotForm({ ...timeslotForm, start_time: e.target.value })}
                          placeholder="09:00 AM"
                        />
                      </div>
                      <div>
                        <Label htmlFor="end-time">End Time</Label>
                        <Input
                          id="end-time"
                          data-testid="end-time-input"
                          value={timeslotForm.end_time}
                          onChange={(e) => setTimeslotForm({ ...timeslotForm, end_time: e.target.value })}
                          placeholder="10:00 AM"
                        />
                      </div>
                    </div>
                    <Button type="submit" data-testid="add-timeslot-btn" className="w-full">Add Time Slot</Button>
                  </form>

                  <div className="mt-6 space-y-2">
                    <h3 className="font-semibold text-sm text-slate-700">Time Slots List ({timeslots.length} slots)</h3>
                    {timeslots.length === 0 ? (
                      <p className="text-sm text-slate-500">No time slots added yet. Click "Generate Default" for quick setup.</p>
                    ) : (
                      <div className="max-h-96 overflow-y-auto space-y-2">
                        {timeslots.map((ts) => (
                          <div key={ts.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                            <div>
                              <div className="font-medium">{ts.day} - Period {ts.period}</div>
                              <span className="text-sm text-slate-500">{ts.start_time} - {ts.end_time}</span>
                            </div>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteTimeslot(ts.id)}
                              data-testid={`delete-timeslot-${ts.id}`}
                            >
                              Delete
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="glass-card rounded-xl p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-cyan-600" />
              <h2 className="text-2xl font-bold text-slate-800">Generated Timetable</h2>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => setShowAnalytics(!showAnalytics)}
                variant="outline"
                data-testid="toggle-analytics-btn"
                className="flex items-center gap-2"
              >
                <BarChart3 className="w-5 h-5" />
                {showAnalytics ? "Hide" : "Show"} Analytics
              </Button>
              {timetable.length > 0 && (
                <Button
                  onClick={exportTimetable}
                  variant="outline"
                  data-testid="export-timetable-btn"
                  className="flex items-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Export CSV
                </Button>
              )}
              <Button
                onClick={generateTimetable}
                disabled={loading}
                data-testid="generate-timetable-btn"
                className="flex items-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                {loading ? "Generating..." : "Generate Timetable"}
              </Button>
            </div>
          </div>
          
          {showAnalytics && <AnalyticsPanel />}
          
          <TimetableGrid timetable={timetable} timeslots={timeslots} />
        </div>
      </div>
    </div>
  );
}