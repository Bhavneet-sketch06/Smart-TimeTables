// What Import College Data accepts: one table per CSV file (or per sheet of one .xlsx workbook), the columns of
// each, and a small sample college used for the downloadable templates and the "try the sample" demo.
//
// Values that hold several items (can_teach, unavailable, facilities, group_names, days) are separated by ";".
// Records refer to each other by code or name, never by internal id: a teacher's can_teach lists subject codes,
// an assignment names a section, a subject code and a teacher.

export const LIST_HINT = 'separate several with ;'

const f = (key, label, { required = false, synonyms = [], hint = '' } = {}) => ({ key, label, required, synonyms, hint })

/** Tables in the order they are read (each may refer to the ones before it). */
export const TABLES = {
  time: {
    label: 'Time structure',
    file: 'time',
    optional: true,
    about: 'Working days and the shape of the day, as setting / value pairs.',
    keywords: ['time', 'setting', 'period', 'schedule'],
    fields: [
      f('setting', 'setting', { required: true, synonyms: ['key', 'name', 'parameter', 'option'] }),
      f('value', 'value', { required: true, synonyms: ['val', 'setting value'] }),
    ],
  },
  departments: {
    label: 'Departments',
    file: 'departments',
    optional: true,
    about: 'Department codes used by the other files. If left out, departments are created from the codes used.',
    keywords: ['department', 'dept', 'branch'],
    fields: [
      f('code', 'code', { required: true, synonyms: ['short', 'short name', 'dept code', 'department code', 'abbreviation', 'id'] }),
      f('name', 'name', { required: true, synonyms: ['department', 'department name', 'full name', 'title'] }),
    ],
  },
  rooms: {
    label: 'Rooms',
    file: 'rooms',
    about: 'Classrooms, labs and halls. Rooms are shared by the whole college.',
    keywords: ['room', 'venue', 'space', 'hall'],
    fields: [
      f('name', 'name', { required: true, synonyms: ['room', 'room name', 'room no', 'room number', 'venue'] }),
      f('capacity', 'capacity', { required: true, synonyms: ['seats', 'size', 'strength', 'max students'], hint: 'whole number of seats' }),
      f('type', 'type', { required: true, synonyms: ['room type', 'kind', 'category'], hint: 'classroom, lab or seminar' }),
      f('department', 'department', { synonyms: ['dept', 'home department', 'department code'], hint: 'code; blank = shared' }),
      f('facilities', 'facilities', { synonyms: ['equipment', 'features', 'amenities'], hint: LIST_HINT }),
      f('events_only', 'events_only', { synonyms: ['events', 'bookings only', 'events only', 'not for classes'], hint: 'yes = never used for classes' }),
    ],
  },
  subjects: {
    label: 'Subjects',
    file: 'subjects',
    about: 'Each subject with its weekly lecture hours and lab block.',
    keywords: ['subject', 'course', 'paper', 'module'],
    fields: [
      f('code', 'code', { required: true, synonyms: ['subject code', 'course code', 'paper code', 'id'] }),
      f('name', 'name', { required: true, synonyms: ['subject', 'subject name', 'course', 'course name', 'title'] }),
      f('lecture_hours', 'lecture_hours', { required: true, synonyms: ['lectures', 'lecture', 'theory hours', 'l', 'lectures per week', 'hours'], hint: 'periods a week' }),
      f('lab_hours', 'lab_hours', { synonyms: ['lab', 'lab block', 'practical hours', 'p', 'lab periods'], hint: 'length of ONE lab block in periods; 0 = no lab' }),
      f('lab_sessions', 'lab_sessions', { synonyms: ['labs per week', 'practical sessions', 'lab sessions per week'], hint: 'lab blocks per group per week (default 1)' }),
      f('department', 'department', { synonyms: ['dept', 'department code', 'offered by'], hint: 'code; blank = any department' }),
    ],
  },
  teachers: {
    label: 'Teachers',
    file: 'teachers',
    about: 'Faculty, the subjects each can teach, and when they are unavailable.',
    keywords: ['teacher', 'faculty', 'staff', 'lecturer', 'professor'],
    fields: [
      f('name', 'name', { required: true, synonyms: ['teacher', 'teacher name', 'faculty', 'faculty name', 'staff name'] }),
      f('department', 'department', { synonyms: ['dept', 'home department', 'department code'], hint: 'code; blank = service department' }),
      f('max_hours', 'max_hours', { required: true, synonyms: ['max hours', 'max load', 'workload', 'maximum hours', 'max periods'], hint: 'periods a week' }),
      f('can_teach', 'can_teach', { synonyms: ['subjects', 'subject codes', 'can teach', 'teaches'], hint: `subject codes, ${LIST_HINT}` }),
      f('unavailable', 'unavailable', { synonyms: ['not available', 'unavailable slots', 'busy', 'blocked'], hint: `e.g. Mon-1 (day-period), ${LIST_HINT}` }),
    ],
  },
  sections: {
    label: 'Sections',
    file: 'sections',
    about: 'Classes of students, with their department, semester and lab groups.',
    keywords: ['section', 'batch', 'class', 'group'],
    fields: [
      f('name', 'name', { required: true, synonyms: ['section', 'section name', 'class', 'class name'] }),
      f('department', 'department', { required: true, synonyms: ['dept', 'department code', 'branch'], hint: 'code' }),
      f('semester', 'semester', { synonyms: ['batch', 'sem', 'year', 'semester / class'], hint: 'e.g. 3rd Sem' }),
      f('students', 'students', { required: true, synonyms: ['strength', 'size', 'enrolment', 'enrollment', 'number of students'] }),
      f('lab_groups', 'lab_groups', { synonyms: ['groups', 'lab groups', 'practical groups'], hint: '1 to 4 (default 1)' }),
      f('group_names', 'group_names', { synonyms: ['group names', 'groups names'], hint: `e.g. A1;A2, ${LIST_HINT}` }),
    ],
  },
  assignments: {
    label: 'Assignments',
    file: 'assignments',
    about: 'Who teaches which subject to which section (one row per section and subject).',
    keywords: ['assign', 'allot', 'load', 'mapping', 'teaching'],
    fields: [
      f('section', 'section', { required: true, synonyms: ['section name', 'class'] }),
      f('subject', 'subject', { required: true, synonyms: ['subject code', 'course', 'course code'], hint: 'subject code' }),
      f('teacher', 'teacher', { required: true, synonyms: ['faculty', 'lecture teacher', 'teacher name', 'theory teacher'], hint: 'teacher name' }),
      f('lab_teacher', 'lab_teacher', { synonyms: ['lab faculty', 'practical teacher', 'lab teacher'], hint: 'blank = same teacher' }),
    ],
  },
}

export const TABLE_KEYS = Object.keys(TABLES)

/** Settings accepted in the time table. */
export const TIME_SETTINGS = [
  { key: 'days', hint: `working days, ${LIST_HINT}` },
  { key: 'periods_per_day', hint: 'periods in a day (1-12)' },
  { key: 'break_after', hint: 'periods before the break (0 = no break)' },
  { key: 'start_time', hint: 'first period starts, HH:MM' },
  { key: 'period_minutes', hint: 'length of a period' },
  { key: 'break_minutes', hint: 'length of the break' },
]

// ---------- sample college (templates and demo) ----------

export const SAMPLE_NAME = 'Sample Institute of Technology'

const SAMPLE = {
  time: [
    ['days', 'Mon;Tue;Wed;Thu;Fri'],
    ['periods_per_day', 7],
    ['break_after', 4],
    ['start_time', '09:00'],
    ['period_minutes', 60],
    ['break_minutes', 45],
  ],
  departments: [
    ['CSE', 'Computer Science & Engineering'],
    ['ECE', 'Electronics & Communication Engineering'],
    ['AS', 'Applied Sciences'],
  ],
  rooms: [
    ['A-101', 70, 'classroom', 'CSE', 'Projector', 'no'],
    ['A-102', 70, 'classroom', 'CSE', 'Projector', 'no'],
    ['B-101', 70, 'classroom', 'ECE', 'Projector', 'no'],
    ['B-102', 70, 'classroom', 'ECE', '', 'no'],
    ['Lecture Theatre 1', 120, 'classroom', '', 'Projector;Sound system', 'no'],
    ['Computer Lab 1', 35, 'lab', 'CSE', 'Computers;Projector', 'no'],
    ['Computer Lab 2', 35, 'lab', 'CSE', 'Computers', 'no'],
    ['Electronics Lab', 35, 'lab', 'ECE', 'Oscilloscopes', 'no'],
    ['Communication Lab', 35, 'lab', 'ECE', 'Signal generators', 'no'],
    ['Seminar Hall', 150, 'seminar', '', 'Projector;Sound system;Stage', 'yes'],
  ],
  subjects: [
    ['CS201', 'Data Structures', 3, 2, 1, 'CSE'],
    ['CS202', 'Database Systems', 3, 2, 1, 'CSE'],
    ['CS203', 'Operating Systems', 3, 0, '', 'CSE'],
    ['EC201', 'Digital Electronics', 3, 2, 1, 'ECE'],
    ['EC202', 'Signals & Systems', 3, 0, '', 'ECE'],
    ['EC203', 'Analog Circuits', 3, 2, 1, 'ECE'],
    ['MA201', 'Engineering Mathematics', 4, 0, '', ''],
    ['HU201', 'Professional Communication', 2, 0, '', ''],
  ],
  teachers: [
    ['Dr. Asha Mehta', 'CSE', 16, 'CS201;CS203', 'Mon-1;Mon-2'],
    ['Prof. Vikram Singh', 'CSE', 16, 'CS201;CS202', ''],
    ['Ms. Ritu Kapoor', 'CSE', 18, 'CS202;CS203', ''],
    ['Dr. Karan Bedi', 'ECE', 16, 'EC201;EC203', ''],
    ['Prof. Nisha Rao', 'ECE', 16, 'EC202;EC203', 'Wed-7'],
    ['Mr. Arjun Das', 'ECE', 18, 'EC201;EC203', ''],
    ['Dr. Pooja Arora', 'AS', 20, 'MA201', 'Fri-7'],
    ['Ms. Sana Khan', 'AS', 16, 'HU201', ''],
  ],
  sections: [
    ['CSE-3A', 'CSE', '3rd Sem', 60, 2, 'A1;A2'],
    ['CSE-3B', 'CSE', '3rd Sem', 60, 2, 'B1;B2'],
    ['ECE-3A', 'ECE', '3rd Sem', 60, 2, 'A1;A2'],
    ['ECE-3B', 'ECE', '3rd Sem', 60, 2, 'B1;B2'],
  ],
  assignments: [
    ['CSE-3A', 'CS201', 'Dr. Asha Mehta', ''],
    ['CSE-3A', 'CS202', 'Prof. Vikram Singh', 'Ms. Ritu Kapoor'],
    ['CSE-3A', 'CS203', 'Ms. Ritu Kapoor', ''],
    ['CSE-3A', 'MA201', 'Dr. Pooja Arora', ''],
    ['CSE-3A', 'HU201', 'Ms. Sana Khan', ''],
    ['CSE-3B', 'CS201', 'Prof. Vikram Singh', ''],
    ['CSE-3B', 'CS202', 'Ms. Ritu Kapoor', ''],
    ['CSE-3B', 'CS203', 'Dr. Asha Mehta', ''],
    ['CSE-3B', 'MA201', 'Dr. Pooja Arora', ''],
    ['CSE-3B', 'HU201', 'Ms. Sana Khan', ''],
    ['ECE-3A', 'EC201', 'Dr. Karan Bedi', 'Mr. Arjun Das'],
    ['ECE-3A', 'EC202', 'Prof. Nisha Rao', ''],
    ['ECE-3A', 'EC203', 'Dr. Karan Bedi', 'Mr. Arjun Das'],
    ['ECE-3A', 'MA201', 'Dr. Pooja Arora', ''],
    ['ECE-3A', 'HU201', 'Ms. Sana Khan', ''],
    ['ECE-3B', 'EC201', 'Dr. Karan Bedi', 'Mr. Arjun Das'],
    ['ECE-3B', 'EC202', 'Prof. Nisha Rao', ''],
    ['ECE-3B', 'EC203', 'Prof. Nisha Rao', 'Mr. Arjun Das'],
    ['ECE-3B', 'MA201', 'Dr. Pooja Arora', ''],
    ['ECE-3B', 'HU201', 'Ms. Sana Khan', ''],
  ],
}

/** Header row plus the sample rows for one table. */
export const templateRows = (key) => [TABLES[key].fields.map((x) => x.key), ...SAMPLE[key]]

/** Every template table, in order, plus a short Instructions sheet for the workbook. */
export function templateSheets() {
  const instructions = [
    ['Smart TimeTables: college data template'],
    ['Each sheet is one table. Keep the header row (row 1); one record per row below it.'],
    ['Records refer to each other by department code, subject code, section name and teacher name.'],
    ['Several values in one cell are separated by ; (for example can_teach = CS201;CS203).'],
    [''],
    ['Sheet', 'Required', 'What it holds', 'Columns (* = required)'],
    ...TABLE_KEYS.map((k) => [
      TABLES[k].label,
      TABLES[k].optional ? 'optional' : 'yes',
      TABLES[k].about,
      TABLES[k].fields.map((x) => `${x.key}${x.required ? '*' : ''}${x.hint ? ` (${x.hint})` : ''}`).join(', '),
    ]),
    [''],
    ['The example rows describe a small made-up college that imports and generates a timetable as-is.'],
    ['This Instructions sheet is ignored when importing.'],
  ]
  return [...TABLE_KEYS.map((k) => ({ name: TABLES[k].label, rows: templateRows(k) })), { name: 'Instructions', rows: instructions }]
}
