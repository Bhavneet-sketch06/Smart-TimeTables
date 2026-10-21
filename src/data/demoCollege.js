// Sample college: 3 departments, 6 sections, 12 teachers, 8 rooms (2 labs).
// Mon-Fri, 7 periods, break after period 4. Each section has 21 hours/week.

const subjects = [
  // CSE
  { id: 'ds', name: 'Data Structures', code: 'CS201', lectureHours: 3, labHours: 2 },
  { id: 'dbms', name: 'Database Systems', code: 'CS202', lectureHours: 3, labHours: 2 },
  { id: 'os', name: 'Operating Systems', code: 'CS203', lectureHours: 3, labHours: 0 },
  { id: 'dm', name: 'Discrete Mathematics', code: 'CS204', lectureHours: 3, labHours: 0 },
  // ECE
  { id: 'ss', name: 'Signals & Systems', code: 'EC201', lectureHours: 3, labHours: 0 },
  { id: 'de', name: 'Digital Electronics', code: 'EC202', lectureHours: 3, labHours: 2 },
  { id: 'ac', name: 'Analog Circuits', code: 'EC203', lectureHours: 3, labHours: 2 },
  { id: 'cs', name: 'Communication Systems', code: 'EC204', lectureHours: 3, labHours: 0 },
  // ME
  { id: 'th', name: 'Thermodynamics', code: 'ME201', lectureHours: 3, labHours: 0 },
  { id: 'fm', name: 'Fluid Mechanics', code: 'ME202', lectureHours: 3, labHours: 2 },
  { id: 'md', name: 'Machine Design', code: 'ME203', lectureHours: 3, labHours: 0 },
  { id: 'mp', name: 'Manufacturing Processes', code: 'ME204', lectureHours: 3, labHours: 2 },
  // Common
  { id: 'em', name: 'Engineering Mathematics', code: 'MA201', lectureHours: 3, labHours: 0 },
  { id: 'pc', name: 'Professional Communication', code: 'HU201', lectureHours: 2, labHours: 0 },
]

const teachers = [
  { id: 't1', name: 'Dr. Anita Sharma', department: 'CSE', subjectIds: ['ds'], maxHours: 14, unavailable: ['Mon-1', 'Mon-2'] },
  { id: 't2', name: 'Prof. Rahul Verma', department: 'CSE', subjectIds: ['dbms'], maxHours: 14, unavailable: [] },
  { id: 't3', name: 'Dr. Meera Iyer', department: 'CSE', subjectIds: ['os', 'dm'], maxHours: 16, unavailable: ['Thu-7'] },
  { id: 't4', name: 'Dr. Suresh Rao', department: 'ECE', subjectIds: ['ss', 'cs'], maxHours: 16, unavailable: ['Fri-6', 'Fri-7'] },
  { id: 't5', name: 'Prof. Kavita Nair', department: 'ECE', subjectIds: ['de'], maxHours: 14, unavailable: [] },
  { id: 't6', name: 'Dr. Arjun Mehta', department: 'ECE', subjectIds: ['ac'], maxHours: 14, unavailable: ['Tue-1'] },
  { id: 't7', name: 'Dr. Vikram Singh', department: 'ME', subjectIds: ['th', 'md'], maxHours: 16, unavailable: ['Tue-1'] },
  { id: 't8', name: 'Prof. Neha Gupta', department: 'ME', subjectIds: ['fm'], maxHours: 14, unavailable: [] },
  { id: 't9', name: 'Dr. Rohan Das', department: 'ME', subjectIds: ['mp'], maxHours: 14, unavailable: ['Wed-7'] },
  { id: 't10', name: 'Dr. Priya Kapoor', department: 'Mathematics', subjectIds: ['em', 'dm'], maxHours: 12, unavailable: ['Wed-5', 'Wed-6', 'Wed-7'] },
  { id: 't11', name: 'Prof. Amit Joshi', department: 'Mathematics', subjectIds: ['em'], maxHours: 14, unavailable: [] },
  { id: 't12', name: 'Ms. Sara Thomas', department: 'Humanities', subjectIds: ['pc'], maxHours: 14, unavailable: ['Mon-7'] },
]

const rooms = [
  { id: 'r101', name: 'Room 101', capacity: 60, type: 'classroom' },
  { id: 'r102', name: 'Room 102', capacity: 60, type: 'classroom' },
  { id: 'r103', name: 'Room 103', capacity: 65, type: 'classroom' },
  { id: 'r104', name: 'Room 104', capacity: 70, type: 'classroom' },
  { id: 'r105', name: 'Room 105', capacity: 70, type: 'classroom' },
  { id: 'sh1', name: 'Seminar Hall', capacity: 120, type: 'seminar' },
  { id: 'lab1', name: 'Computer Lab', capacity: 65, type: 'lab' },
  { id: 'lab2', name: 'Engineering Lab', capacity: 65, type: 'lab' },
]

const sec = (id, name, department, students, pairs) => ({
  id,
  name,
  department,
  students,
  assignments: pairs.map(([subjectId, teacherId]) => ({ subjectId, teacherId })),
})

const sections = [
  sec('cse-a', 'CSE-A', 'CSE', 60, [['ds', 't1'], ['dbms', 't2'], ['os', 't3'], ['dm', 't3'], ['em', 't10'], ['pc', 't12']]),
  sec('cse-b', 'CSE-B', 'CSE', 58, [['ds', 't1'], ['dbms', 't2'], ['os', 't3'], ['dm', 't10'], ['em', 't10'], ['pc', 't12']]),
  sec('ece-a', 'ECE-A', 'ECE', 62, [['ss', 't4'], ['de', 't5'], ['ac', 't6'], ['cs', 't4'], ['em', 't11'], ['pc', 't12']]),
  sec('ece-b', 'ECE-B', 'ECE', 55, [['ss', 't4'], ['de', 't5'], ['ac', 't6'], ['cs', 't4'], ['em', 't11'], ['pc', 't12']]),
  sec('me-a', 'ME-A', 'ME', 64, [['th', 't7'], ['fm', 't8'], ['md', 't7'], ['mp', 't9'], ['em', 't11'], ['pc', 't12']]),
  sec('me-b', 'ME-B', 'ME', 52, [['th', 't7'], ['fm', 't8'], ['md', 't7'], ['mp', 't9'], ['em', 't11'], ['pc', 't12']]),
]

export function demoCollege() {
  // Deep copy so edits in the UI never mutate these module constants.
  return structuredClone({
    time: {
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      periodsPerDay: 7,
      breakAfter: 4,
      startTime: '09:00',
      periodMinutes: 55,
      breakMinutes: 40,
    },
    rooms,
    teachers,
    subjects,
    sections,
    timetable: null,
  })
}
