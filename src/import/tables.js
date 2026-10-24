// What Import College Data accepts: one table per CSV file (or per sheet of one .xlsx workbook), the columns of
// each, and a small sample college used for the downloadable templates and the "try the sample" demo.
//
// Values that hold several items (can_teach, unavailable, facilities, needs, group_names, days, breaks...) are
// separated by ";". Records refer to each other by code or name, never by internal id: a teacher's can_teach lists
// subject codes, an assignment names a section, a subject code and a teacher.

export const LIST_HINT = 'separate several with ;'

const f = (key, { required = false, synonyms = [], hint = '' } = {}) => ({ key, label: key, required, synonyms, hint })

/** Tables in the order they are read (each may refer to the ones before it). */
export const TABLES = {
  time: {
    label: 'Time structure',
    file: 'time',
    optional: true,
    about: 'Working days and the shape of the day (periods, breaks, short days, no-class slots), as setting / value pairs.',
    keywords: ['time', 'setting', 'period', 'schedule'],
    fields: [
      f('setting', { required: true, synonyms: ['key', 'name', 'parameter', 'option'] }),
      f('value', { required: true, synonyms: ['val', 'setting value'] }),
    ],
  },
  departments: {
    label: 'Departments',
    file: 'departments',
    optional: true,
    about: 'Department codes used by the other files. If left out, departments are created from the codes used.',
    keywords: ['department', 'dept', 'branch', 'faculty of'],
    fields: [
      f('code', { required: true, synonyms: ['short', 'short name', 'dept code', 'department code', 'abbreviation', 'id'] }),
      f('name', { required: true, synonyms: ['department', 'department name', 'full name', 'title'] }),
    ],
  },
  room_types: {
    label: 'Room types',
    file: 'room_types',
    optional: true,
    about: 'Your own kinds of rooms (Computer lab, Drawing hall...). Types used by rooms but not listed here are created automatically.',
    keywords: ['room type', 'roomtype', 'types'],
    fields: [
      f('name', { required: true, synonyms: ['type', 'room type', 'type name'] }),
      f('used_for', { synonyms: ['kind', 'use', 'for'], hint: 'lectures or labs (default: guessed from the name)' }),
    ],
  },
  rooms: {
    label: 'Rooms',
    file: 'rooms',
    about: 'Classrooms, labs and halls. Rooms are shared by the whole college.',
    keywords: ['room', 'venue', 'space', 'hall'],
    fields: [
      f('name', { required: true, synonyms: ['room', 'room name', 'room no', 'room number', 'venue'] }),
      f('capacity', { required: true, synonyms: ['seats', 'size', 'strength', 'max students'], hint: 'whole number of seats' }),
      f('type', { required: true, synonyms: ['room type', 'kind', 'category'], hint: 'classroom, lab, seminar or your own type' }),
      f('department', { synonyms: ['dept', 'home department', 'department code'], hint: 'code; blank = shared' }),
      f('facilities', { synonyms: ['equipment', 'features', 'amenities'], hint: LIST_HINT }),
      f('events_only', { synonyms: ['events', 'bookings only', 'events only', 'not for classes'], hint: 'yes = never used for classes' }),
    ],
  },
  subjects: {
    label: 'Subjects',
    file: 'subjects',
    about: 'Each subject: weekly lectures, tutorials and labs, and the rooms they need.',
    keywords: ['subject', 'course', 'paper', 'module'],
    fields: [
      f('code', { required: true, synonyms: ['subject code', 'course code', 'paper code', 'id'] }),
      f('name', { required: true, synonyms: ['subject', 'subject name', 'course', 'course name', 'title'] }),
      f('lecture_hours', { required: true, synonyms: ['lectures', 'lecture', 'theory hours', 'l', 'lectures per week', 'hours'], hint: 'periods a week' }),
      f('lecture_block', { synonyms: ['lecture length', 'double periods', 'block'], hint: '1 = single periods, 2 = double periods' }),
      f('tutorial_hours', { synonyms: ['tutorials', 't', 'tutorial'], hint: 'periods a week, per lab group' }),
      f('lab_hours', { synonyms: ['lab', 'lab block', 'practical hours', 'p', 'lab periods'], hint: 'length of ONE lab block in periods; 0 = no lab' }),
      f('lab_sessions', { synonyms: ['labs per week', 'practical sessions', 'lab sessions per week'], hint: 'lab blocks per group per week (default 1)' }),
      f('department', { synonyms: ['dept', 'department code', 'offered by'], hint: 'code; blank = any department' }),
      f('lecture_room_type', { synonyms: ['lecture room', 'classroom type'], hint: 'blank = any classroom' }),
      f('lecture_needs', { synonyms: ['lecture facilities', 'lecture equipment'], hint: `facilities, ${LIST_HINT}` }),
      f('lab_room_type', { synonyms: ['lab room', 'lab type'], hint: 'blank = any lab' }),
      f('lab_needs', { synonyms: ['lab facilities', 'lab equipment'], hint: `facilities, ${LIST_HINT}` }),
    ],
  },
  teachers: {
    label: 'Teachers',
    file: 'teachers',
    about: 'Faculty, the subjects each can teach, their limits, and when they are unavailable.',
    keywords: ['teacher', 'faculty', 'staff', 'lecturer', 'professor'],
    fields: [
      f('name', { required: true, synonyms: ['teacher', 'teacher name', 'faculty', 'faculty name', 'staff name'] }),
      f('department', { synonyms: ['dept', 'home department', 'department code'], hint: 'code; blank = service department' }),
      f('max_hours', { required: true, synonyms: ['max hours', 'max load', 'workload', 'maximum hours', 'max periods'], hint: 'periods a week' }),
      f('max_per_day', { synonyms: ['max per day', 'daily limit', 'max daily'], hint: 'most periods a day (blank = no limit)' }),
      f('can_teach', { synonyms: ['subjects', 'subject codes', 'can teach', 'teaches'], hint: `subject codes, ${LIST_HINT}` }),
      f('unavailable', { synonyms: ['not available', 'unavailable slots', 'busy', 'blocked'], hint: `e.g. Mon-1 (day-period), ${LIST_HINT}` }),
    ],
  },
  sections: {
    label: 'Sections',
    file: 'sections',
    about: 'Classes of students, with their department, semester, lab groups and daily limit.',
    keywords: ['section', 'batch', 'class', 'group'],
    fields: [
      f('name', { required: true, synonyms: ['section', 'section name', 'class', 'class name'] }),
      f('department', { required: true, synonyms: ['dept', 'department code', 'branch'], hint: 'code' }),
      f('semester', { synonyms: ['batch', 'sem', 'year', 'semester / class', 'grade'], hint: 'e.g. 3rd Sem' }),
      f('students', { required: true, synonyms: ['strength', 'size', 'enrolment', 'enrollment', 'number of students'] }),
      f('lab_groups', { synonyms: ['groups', 'lab groups', 'practical groups'], hint: '1 to 10 (default 1)' }),
      f('group_names', { synonyms: ['group names', 'groups names'], hint: `e.g. A1;A2, ${LIST_HINT}` }),
      f('max_per_day', { synonyms: ['max per day', 'daily limit'], hint: 'most periods a day (blank = no limit)' }),
    ],
  },
  assignments: {
    label: 'Assignments',
    file: 'assignments',
    about: 'Who teaches which subject to which section (one row per section and subject).',
    keywords: ['assign', 'allot', 'load', 'mapping', 'teaching'],
    fields: [
      f('section', { required: true, synonyms: ['section name', 'class'] }),
      f('subject', { required: true, synonyms: ['subject code', 'course', 'course code'], hint: 'subject code' }),
      f('teacher', { required: true, synonyms: ['faculty', 'lecture teacher', 'teacher name', 'theory teacher'], hint: 'teacher name' }),
      f('lab_teacher', { synonyms: ['lab faculty', 'practical teacher', 'lab teacher'], hint: 'blank = same teacher' }),
    ],
  },
}

export const TABLE_KEYS = Object.keys(TABLES)

/** Settings accepted in the time table. */
export const TIME_SETTINGS = [
  { key: 'days', hint: `working days in week order, ${LIST_HINT} (e.g. Sun;Mon;Tue;Wed;Thu)` },
  { key: 'periods_per_day', hint: 'periods on the longest day (1-14)' },
  { key: 'start_time', hint: 'first period starts, HH:MM' },
  { key: 'period_minutes', hint: 'length of a period' },
  { key: 'breaks', hint: `after-period:minutes:name, ${LIST_HINT} (e.g. 2:15:Tea break;4:45:Lunch)` },
  { key: 'day_periods', hint: `shorter days as day:periods, ${LIST_HINT} (e.g. Sat:4)` },
  { key: 'blocked', hint: `no-class slots as day-period:reason, ${LIST_HINT} (e.g. Wed-7:Sports)` },
  { key: 'break_after', hint: 'single break: periods before it (older style; use breaks for more)' },
  { key: 'break_minutes', hint: 'single break: its length' },
]

// ---------- sample college (templates and demo) ----------

export const SAMPLE_NAME = 'Sample Institute of Technology'

const rows = (keys, list) => list.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])))

const SAMPLE = {
  time: rows(['setting', 'value'], [
    ['days', 'Mon;Tue;Wed;Thu;Fri'],
    ['periods_per_day', 7],
    ['start_time', '09:00'],
    ['period_minutes', 60],
    ['breaks', '2:15:Tea break;4:45:Lunch'],
    ['blocked', 'Wed-7:Sports'],
  ]),
  departments: rows(['code', 'name'], [
    ['CSE', 'Computer Science & Engineering'],
    ['ECE', 'Electronics & Communication Engineering'],
    ['AS', 'Applied Sciences'],
  ]),
  room_types: rows(['name', 'used_for'], [
    ['Classroom', 'lectures'],
    ['Computer lab', 'labs'],
    ['Electronics lab', 'labs'],
    ['Seminar hall', 'lectures'],
  ]),
  rooms: rows(['name', 'capacity', 'type', 'department', 'facilities', 'events_only'], [
    ['A-101', 70, 'Classroom', 'CSE', 'Projector', 'no'],
    ['A-102', 70, 'Classroom', 'CSE', 'Projector', 'no'],
    ['B-101', 70, 'Classroom', 'ECE', 'Projector', 'no'],
    ['B-102', 70, 'Classroom', 'ECE', '', 'no'],
    ['Lecture Theatre 1', 120, 'Classroom', '', 'Projector;Sound system', 'no'],
    ['Tutorial Room', 40, 'Classroom', '', 'Whiteboard', 'no'],
    ['Computer Lab 1', 35, 'Computer lab', 'CSE', 'Computers;Projector', 'no'],
    ['Computer Lab 2', 35, 'Computer lab', 'CSE', 'Computers', 'no'],
    ['Electronics Lab', 35, 'Electronics lab', 'ECE', 'Oscilloscopes', 'no'],
    ['Communication Lab', 35, 'Electronics lab', 'ECE', 'Signal generators', 'no'],
    ['Seminar Hall', 150, 'Seminar hall', '', 'Projector;Sound system;Stage', 'yes'],
  ]),
  subjects: rows(
    ['code', 'name', 'lecture_hours', 'lecture_block', 'tutorial_hours', 'lab_hours', 'lab_sessions', 'department', 'lecture_room_type', 'lecture_needs', 'lab_room_type', 'lab_needs'],
    [
      ['CS201', 'Data Structures', 3, 1, 0, 2, 1, 'CSE', '', '', 'Computer lab', 'Computers'],
      ['CS202', 'Database Systems', 3, 1, 0, 2, 1, 'CSE', '', '', 'Computer lab', ''],
      ['CS203', 'Operating Systems', 3, 2, 0, 0, '', 'CSE', '', 'Projector', '', ''],
      ['EC201', 'Digital Electronics', 3, 1, 0, 2, 1, 'ECE', '', '', 'Electronics lab', ''],
      ['EC202', 'Signals & Systems', 3, 1, 0, 0, '', 'ECE', '', '', '', ''],
      ['EC203', 'Analog Circuits', 3, 1, 0, 2, 1, 'ECE', '', '', 'Electronics lab', ''],
      ['MA201', 'Engineering Mathematics', 3, 1, 1, 0, '', 'AS', '', '', '', ''],
      ['HU201', 'Professional Communication', 2, 1, 0, 0, '', '', '', '', '', ''],
    ],
  ),
  teachers: rows(['name', 'department', 'max_hours', 'max_per_day', 'can_teach', 'unavailable'], [
    ['Dr. Asha Mehta', 'CSE', 16, '', 'CS201;CS203', 'Mon-1;Mon-2'],
    ['Prof. Vikram Singh', 'CSE', 16, '', 'CS201;CS202', ''],
    ['Ms. Ritu Kapoor', 'CSE', 18, '', 'CS202;CS203', ''],
    ['Dr. Karan Bedi', 'ECE', 16, '', 'EC201;EC203', ''],
    ['Prof. Nisha Rao', 'ECE', 16, '', 'EC202;EC203', ''],
    ['Mr. Arjun Das', 'ECE', 18, 4, 'EC201;EC203', ''],
    ['Dr. Pooja Arora', 'AS', 22, 5, 'MA201', 'Fri-7'],
    ['Ms. Sana Khan', 'AS', 16, '', 'HU201', ''],
  ]),
  sections: rows(['name', 'department', 'semester', 'students', 'lab_groups', 'group_names', 'max_per_day'], [
    ['CSE-3A', 'CSE', '3rd Sem', 60, 2, 'A1;A2', 6],
    ['CSE-3B', 'CSE', '3rd Sem', 60, 2, 'B1;B2', 6],
    ['ECE-3A', 'ECE', '3rd Sem', 60, 2, 'A1;A2', ''],
    ['ECE-3B', 'ECE', '3rd Sem', 60, 2, 'B1;B2', ''],
  ]),
  assignments: rows(['section', 'subject', 'teacher', 'lab_teacher'], [
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
  ]),
}

/** Header row plus rows for one table, from records keyed by column (missing columns are left blank). */
export const tableRows = (key, records) => [TABLES[key].fields.map((x) => x.key), ...records.map((r) => TABLES[key].fields.map((x) => r[x.key] ?? ''))]

/** Header row plus the sample rows for one table. */
export const templateRows = (key) => tableRows(key, SAMPLE[key])

/** Every template table, in order, plus a short Instructions sheet for the workbook. */
export function templateSheets() {
  const instructions = [
    ['Smart TimeTables: college data template'],
    ['Each sheet is one table. Keep the header row (row 1); one record per row below it.'],
    ['Records refer to each other by department code, room type name, subject code, section name and teacher name.'],
    ['Several values in one cell are separated by ; (for example can_teach = CS201;CS203).'],
    ['Optional columns can be left blank or removed; optional sheets can be removed.'],
    [''],
    ['Sheet', 'Required', 'What it holds', 'Columns (* = required)'],
    ...TABLE_KEYS.map((k) => [
      TABLES[k].label,
      TABLES[k].optional ? 'optional' : 'yes',
      TABLES[k].about,
      TABLES[k].fields.map((x) => `${x.key}${x.required ? '*' : ''}${x.hint ? ` (${x.hint})` : ''}`).join(', '),
    ]),
    [''],
    ['Time structure settings'],
    ...TIME_SETTINGS.map((s) => [s.key, s.hint]),
    [''],
    ['The example rows describe a small made-up college that imports and generates a timetable as-is.'],
    ['This Instructions sheet is ignored when importing.'],
  ]
  return [...TABLE_KEYS.map((k) => ({ name: TABLES[k].label, rows: templateRows(k) })), { name: 'Instructions', rows: instructions }]
}
