import requests
import sys
import json
from datetime import datetime

class TimetableAPITester:
    def __init__(self, base_url="https://timetable-genius-19.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Store created entities for cleanup and testing
        self.created_teachers = []
        self.created_subjects = []
        self.created_rooms = []
        self.created_timeslots = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def run_api_test(self, method, endpoint, expected_status, data=None, description=""):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)
            
            success = response.status_code == expected_status
            if success:
                return True, response.json() if response.content else {}
            else:
                return False, f"Expected {expected_status}, got {response.status_code}: {response.text}"
                
        except Exception as e:
            return False, f"Request failed: {str(e)}"

    def test_teachers_crud(self):
        """Test Teachers CRUD operations with enhanced fields"""
        print("\n🔍 Testing Teachers CRUD...")
        
        # Test GET empty teachers
        success, result = self.run_api_test('GET', 'teachers', 200)
        self.log_test("GET /teachers (empty)", success, result if not success else "")
        
        # Test POST teacher with enhanced fields (email and department)
        teacher_data = {
            "name": "Dr. Smith", 
            "email": "dr.smith@school.edu",
            "department": "Mathematics"
        }
        success, result = self.run_api_test('POST', 'teachers', 200, teacher_data)
        if success:
            self.created_teachers.append(result)
            # Verify enhanced fields are saved
            if result.get('email') == teacher_data['email'] and result.get('department') == teacher_data['department']:
                self.log_test("POST /teachers (with email & department)", True)
            else:
                self.log_test("POST /teachers (enhanced fields validation)", False, "Email or department not saved correctly")
        else:
            self.log_test("POST /teachers", False, result)
            return False
        
        # Test GET teachers with data
        success, result = self.run_api_test('GET', 'teachers', 200)
        if success and len(result) > 0:
            self.log_test("GET /teachers (with data)", True)
        else:
            self.log_test("GET /teachers (with data)", False, "No teachers returned")
        
        # Test DELETE teacher
        if self.created_teachers:
            teacher_id = self.created_teachers[0]['id']
            success, result = self.run_api_test('DELETE', f'teachers/{teacher_id}', 200)
            self.log_test("DELETE /teachers/{id}", success, result if not success else "")
            if success:
                self.created_teachers.pop(0)
        
        return True

    def test_subjects_crud(self):
        """Test Subjects CRUD operations"""
        print("\n🔍 Testing Subjects CRUD...")
        
        # First create a teacher for subject assignment
        teacher_data = {"name": "Prof. Johnson"}
        success, teacher = self.run_api_test('POST', 'teachers', 200, teacher_data)
        if not success:
            self.log_test("Setup teacher for subjects", False, teacher)
            return False
        self.created_teachers.append(teacher)
        
        # Test GET empty subjects
        success, result = self.run_api_test('GET', 'subjects', 200)
        self.log_test("GET /subjects (empty)", success, result if not success else "")
        
        # Test POST subject with subject code
        subject_data = {
            "name": "Mathematics",
            "code": "MATH101",
            "sessions_per_week": 5,
            "teacher_id": teacher['id'],
            "class_group": "Class A"
        }
        success, result = self.run_api_test('POST', 'subjects', 200, subject_data)
        if success:
            self.created_subjects.append(result)
            # Verify subject code is saved
            if result.get('code') == subject_data['code']:
                self.log_test("POST /subjects (with subject code)", True)
            else:
                self.log_test("POST /subjects (subject code validation)", False, "Subject code not saved correctly")
        else:
            self.log_test("POST /subjects", False, result)
            return False
        
        # Test GET subjects with data
        success, result = self.run_api_test('GET', 'subjects', 200)
        if success and len(result) > 0:
            self.log_test("GET /subjects (with data)", True)
        else:
            self.log_test("GET /subjects (with data)", False, "No subjects returned")
        
        # Test DELETE subject
        if self.created_subjects:
            subject_id = self.created_subjects[0]['id']
            success, result = self.run_api_test('DELETE', f'subjects/{subject_id}', 200)
            self.log_test("DELETE /subjects/{id}", success, result if not success else "")
            if success:
                self.created_subjects.pop(0)
        
        return True

    def test_rooms_crud(self):
        """Test Rooms CRUD operations"""
        print("\n🔍 Testing Rooms CRUD...")
        
        # Test GET empty rooms
        success, result = self.run_api_test('GET', 'rooms', 200)
        self.log_test("GET /rooms (empty)", success, result if not success else "")
        
        # Test POST room with room type
        room_data = {
            "name": "Room 101", 
            "capacity": 40,
            "room_type": "Laboratory"
        }
        success, result = self.run_api_test('POST', 'rooms', 200, room_data)
        if success:
            self.created_rooms.append(result)
            # Verify room type is saved
            if result.get('room_type') == room_data['room_type']:
                self.log_test("POST /rooms (with room type)", True)
            else:
                self.log_test("POST /rooms (room type validation)", False, "Room type not saved correctly")
        else:
            self.log_test("POST /rooms", False, result)
            return False
        
        # Test GET rooms with data
        success, result = self.run_api_test('GET', 'rooms', 200)
        if success and len(result) > 0:
            self.log_test("GET /rooms (with data)", True)
        else:
            self.log_test("GET /rooms (with data)", False, "No rooms returned")
        
        # Test DELETE room
        if self.created_rooms:
            room_id = self.created_rooms[0]['id']
            success, result = self.run_api_test('DELETE', f'rooms/{room_id}', 200)
            self.log_test("DELETE /rooms/{id}", success, result if not success else "")
            if success:
                self.created_rooms.pop(0)
        
        return True

    def test_timeslots_crud(self):
        """Test TimeSlots CRUD operations"""
        print("\n🔍 Testing TimeSlots CRUD...")
        
        # Test GET empty timeslots
        success, result = self.run_api_test('GET', 'timeslots', 200)
        self.log_test("GET /timeslots (empty)", success, result if not success else "")
        
        # Test POST timeslot with start_time and end_time
        timeslot_data = {
            "day": "Monday", 
            "period": 1, 
            "start_time": "09:00 AM",
            "end_time": "10:00 AM"
        }
        success, result = self.run_api_test('POST', 'timeslots', 200, timeslot_data)
        if success:
            self.created_timeslots.append(result)
            # Verify start_time and end_time are saved
            if result.get('start_time') == timeslot_data['start_time'] and result.get('end_time') == timeslot_data['end_time']:
                self.log_test("POST /timeslots (with start/end times)", True)
            else:
                self.log_test("POST /timeslots (time validation)", False, "Start/end times not saved correctly")
        else:
            self.log_test("POST /timeslots", False, result)
            return False
        
        # Test GET timeslots with data
        success, result = self.run_api_test('GET', 'timeslots', 200)
        if success and len(result) > 0:
            self.log_test("GET /timeslots (with data)", True)
        else:
            self.log_test("GET /timeslots (with data)", False, "No timeslots returned")
        
        # Test DELETE timeslot
        if self.created_timeslots:
            timeslot_id = self.created_timeslots[0]['id']
            success, result = self.run_api_test('DELETE', f'timeslots/{timeslot_id}', 200)
            self.log_test("DELETE /timeslots/{id}", success, result if not success else "")
            if success:
                self.created_timeslots.pop(0)
        
        return True

    def test_default_timeslots_generation(self):
        """Test default timeslots generation"""
        print("\n🔍 Testing Default TimeSlots Generation...")
        
        # Test generate default timeslots
        success, result = self.run_api_test('POST', 'timeslots/generate-default', 200)
        if success:
            expected_count = 30  # 5 days × 6 periods
            actual_count = result.get('count', 0)
            if actual_count == expected_count:
                self.log_test("POST /timeslots/generate-default", True, f"Generated {actual_count} slots")
            else:
                self.log_test("POST /timeslots/generate-default (count validation)", False, f"Expected {expected_count}, got {actual_count}")
        else:
            self.log_test("POST /timeslots/generate-default", False, result)
            return False
        
        # Verify timeslots were created with proper time ranges
        success, timeslots = self.run_api_test('GET', 'timeslots', 200)
        if success and len(timeslots) > 0:
            # Check if first timeslot has proper time format
            first_slot = timeslots[0]
            if first_slot.get('start_time') and first_slot.get('end_time'):
                self.log_test("Default timeslots time format validation", True)
            else:
                self.log_test("Default timeslots time format validation", False, "Missing start_time or end_time")
        
        return True

    def test_analytics_endpoint(self):
        """Test analytics endpoint"""
        print("\n🔍 Testing Analytics Endpoint...")
        
        success, result = self.run_api_test('GET', 'analytics', 200)
        if success:
            # Verify analytics structure
            required_fields = ['total_classes', 'teacher_workload', 'room_utilization', 'peak_hours', 'free_slots']
            missing_fields = [field for field in required_fields if field not in result]
            if missing_fields:
                self.log_test("GET /analytics (structure validation)", False, f"Missing fields: {missing_fields}")
            else:
                self.log_test("GET /analytics", True, f"Analytics data retrieved successfully")
        else:
            self.log_test("GET /analytics", False, result)
        
        return True

    def test_csv_export(self):
        """Test CSV export functionality"""
        print("\n🔍 Testing CSV Export...")
        
        # First ensure we have some timetable data
        success, timetable = self.run_api_test('GET', 'timetable', 200)
        if not success or len(timetable) == 0:
            self.log_test("CSV Export (no data)", True, "No timetable data to export - skipping CSV test")
            return True
        
        # Test CSV export
        try:
            import requests
            url = f"{self.api_url}/timetable/export/csv"
            response = requests.get(url, timeout=10)
            
            if response.status_code == 200:
                # Check if response is CSV format
                content_type = response.headers.get('content-type', '')
                if 'csv' in content_type.lower():
                    self.log_test("GET /timetable/export/csv", True, "CSV export successful")
                else:
                    self.log_test("GET /timetable/export/csv (content-type)", False, f"Expected CSV, got {content_type}")
            else:
                self.log_test("GET /timetable/export/csv", False, f"Status {response.status_code}")
        except Exception as e:
            self.log_test("GET /timetable/export/csv", False, f"Request failed: {str(e)}")
        
        return True

    def test_timetable_generation(self):
        """Test timetable generation with complete data"""
        print("\n🔍 Testing Timetable Generation...")
        
        # Setup complete data for timetable generation
        print("Setting up test data for timetable generation...")
        
        # Create teachers with enhanced fields
        teachers_data = [
            {"name": "Dr. Smith", "email": "smith@school.edu", "department": "Mathematics"},
            {"name": "Prof. Johnson", "email": "johnson@school.edu", "department": "Physics"},
            {"name": "Ms. Davis", "email": "davis@school.edu", "department": "Chemistry"}
        ]
        
        for teacher_data in teachers_data:
            success, teacher = self.run_api_test('POST', 'teachers', 200, teacher_data)
            if success:
                self.created_teachers.append(teacher)
        
        # Create rooms with room types
        rooms_data = [
            {"name": "Room 101", "capacity": 40, "room_type": "Classroom"},
            {"name": "Room 102", "capacity": 35, "room_type": "Classroom"},
            {"name": "Lab A", "capacity": 30, "room_type": "Laboratory"}
        ]
        
        for room_data in rooms_data:
            success, room = self.run_api_test('POST', 'rooms', 200, room_data)
            if success:
                self.created_rooms.append(room)
        
        # Create timeslots with proper start/end times
        timeslots_data = [
            {"day": "Monday", "period": 1, "start_time": "09:00 AM", "end_time": "10:00 AM"},
            {"day": "Monday", "period": 2, "start_time": "10:00 AM", "end_time": "11:00 AM"},
            {"day": "Tuesday", "period": 1, "start_time": "09:00 AM", "end_time": "10:00 AM"},
            {"day": "Tuesday", "period": 2, "start_time": "10:00 AM", "end_time": "11:00 AM"},
            {"day": "Wednesday", "period": 1, "start_time": "09:00 AM", "end_time": "10:00 AM"}
        ]
        
        for timeslot_data in timeslots_data:
            success, timeslot = self.run_api_test('POST', 'timeslots', 200, timeslot_data)
            if success:
                self.created_timeslots.append(timeslot)
        
        # Create subjects with subject codes
        if self.created_teachers:
            subjects_data = [
                {"name": "Mathematics", "code": "MATH101", "sessions_per_week": 3, "teacher_id": self.created_teachers[0]['id'], "class_group": "Class A"},
                {"name": "Physics", "code": "PHYS101", "sessions_per_week": 2, "teacher_id": self.created_teachers[1]['id'], "class_group": "Class A"},
                {"name": "Chemistry", "code": "CHEM101", "sessions_per_week": 2, "teacher_id": self.created_teachers[2]['id'], "class_group": "Class A"}
            ]
            
            for subject_data in subjects_data:
                success, subject = self.run_api_test('POST', 'subjects', 200, subject_data)
                if success:
                    self.created_subjects.append(subject)
        
        # Test timetable generation
        generate_data = {"class_groups": ["Class A"]}
        success, result = self.run_api_test('POST', 'timetable/generate', 200, generate_data)
        if success:
            self.log_test("POST /timetable/generate", True, f"Generated {result.get('entries', 0)} entries")
        else:
            self.log_test("POST /timetable/generate", False, result)
            return False
        
        # Test GET timetable
        success, result = self.run_api_test('GET', 'timetable', 200)
        if success and len(result) > 0:
            self.log_test("GET /timetable", True, f"Retrieved {len(result)} timetable entries")
            # Verify timetable entries have required fields
            entry = result[0]
            required_fields = ['subject_name', 'teacher_name', 'room_name', 'day', 'period']
            missing_fields = [field for field in required_fields if field not in entry or entry[field] is None]
            if missing_fields:
                self.log_test("Timetable entry validation", False, f"Missing fields: {missing_fields}")
            else:
                self.log_test("Timetable entry validation", True)
        else:
            self.log_test("GET /timetable", False, "No timetable entries returned")
        
        return True

    def cleanup(self):
        """Clean up created test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete subjects first (they reference teachers)
        for subject in self.created_subjects:
            self.run_api_test('DELETE', f'subjects/{subject["id"]}', 200)
        
        # Delete teachers
        for teacher in self.created_teachers:
            self.run_api_test('DELETE', f'teachers/{teacher["id"]}', 200)
        
        # Delete rooms
        for room in self.created_rooms:
            self.run_api_test('DELETE', f'rooms/{room["id"]}', 200)
        
        # Delete timeslots
        for timeslot in self.created_timeslots:
            self.run_api_test('DELETE', f'timeslots/{timeslot["id"]}', 200)

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Amdraipt Timetable API Tests")
        print(f"Testing against: {self.base_url}")
        
        try:
            # Test basic CRUD operations
            self.test_teachers_crud()
            self.test_subjects_crud()
            self.test_rooms_crud()
            self.test_timeslots_crud()
            
            # Test timetable generation
            self.test_timetable_generation()
            
        except Exception as e:
            print(f"❌ Test suite failed with error: {str(e)}")
        finally:
            # Always cleanup
            self.cleanup()
        
        # Print summary
        print(f"\n📊 Test Results: {self.tests_passed}/{self.tests_run} tests passed")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"Success Rate: {success_rate:.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    tester = TimetableAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())