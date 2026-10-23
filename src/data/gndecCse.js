// GNDEC Ludhiana, CSE department, session July-Dec 2026: B.Tech 3rd semester (D2) and 5th semester (D3).
//
// Sources (public, cse.gndec.ac.in):
//   - "Section wise List of Subjects Allotment (Session July Dec 2026)": subjects and teachers per section
//   - Published FET timetable (w.e.f. 19/08/2026): day/time structure, weekly hours per subject, lab
//     group split (A1/A2), rooms in use
//   - "Class Rooms 2025" / "Laboratories 2025": room and lab capacities
//
// Simplifications: tutorials are counted as section lectures; 5th-sem electives (run across sections)
// are left out; the D2 lunch slot (11:30) is unified with D3 (12:30); DBMS/Hardware lab capacities
// and classrooms not in the infrastructure list are assumed (marked "assumed"). Generated timetables
// are NOT the official GNDEC timetable.

const T = (id, name, department = 'CSE') => ({ id, name, department })

const TEACHERS = [
  T('vivek', 'Dr. Vivek Thapar'),
  T('kamaldeep', 'Dr. Kamaldeep Kaur'),
  T('inderjit', 'Dr. Inderjit Singh'),
  T('shailja', 'Pf. Shailja'),
  T('khushi', 'Pf. Khushi'),
  T('jagdeep', 'Pf. Jagdeep Kaur'),
  T('diksha', 'Pf. Diksha Sharma'),
  T('kajal', 'Pf. Kajal'),
  T('lovejit', 'Dr. Lovejit'),
  T('gagneet', 'Pf. Gagneet Kaur'),
  T('harman', 'Pf. Harman'),
  T('honey', 'Pf. Honey Rawat'),
  T('priyanka', 'Dr. Priyanka Arora'),
  T('kawaljeet', 'Pf. Kawaljeet Kaur'),
  T('harminder', 'Pf. Harminder Kaur'),
  T('amitjain', 'Dr. Amit Jain'),
  T('nancy', 'Pf. Nancy'),
  T('pragya', 'Pf. Pragya', 'Applied Sciences'),
  T('shreya', 'Pf. Shreya', 'Applied Sciences'),
  T('pathania', 'Dr. D S Pathania', 'Applied Sciences'),
  T('harmanpreet', 'Pf. Harmanpreet Kaur'),
  T('kapil', 'Dr. Kapil Sharma'),
  T('lakhvir', 'Pf. Lakhvir'),
  T('amanpreet', 'Pf. Amanpreet Brar'),
  T('palak', 'Pf. Palak Sood'),
  T('aastik', 'Pf. Aastik', 'Applied Sciences'),
  T('upkarjit', 'Pf. Upkarjit Kaur', 'Applied Sciences'),
  T('kuljit', 'Pf. Kuljit Kaur'),
  T('parminder', 'Dr. Parminder Singh'),
  T('maninder', 'Pf. Maninder Kaur'),
  T('satinderpal', 'Dr. Satinderpal Singh'),
  T('sitarani', 'Dr. Sita Rani'),
  T('daljit', 'Dr. Daljit Singh'),
  T('harkomal', 'Pf. Harkomalpreet Kaur'),
  T('hardeep', 'Dr. Hardeep Singh'),
  T('kiranjyoti', 'Dr. Kiran Jyoti'),
  T('manjot', 'Pf. Manjot Kaur'),
  T('jasdeep', 'Pf. Jasdeep Kaur'),
  T('bedi', 'Pf. Manjot Singh Bedi', 'MPE'),
  T('sahni', 'Pf. Kawalpreet Sahni', 'MPE'),
  T('jasmine', 'Pf. Jasmine Kaur'),
  T('goldendeep', 'Pf. Goldendeep Kaur'),
  T('manpreet', 'Dr. Manpreet Kaur'),
  T('meetali', 'Pf. Meetali'),
  T('karan', 'Pf. Karan Bhalla', 'Applied Sciences'),
  T('rajvir', 'Pf. Rajvir Kaur', 'Applied Sciences'),
  T('sukhwinder', 'Pf. Sukhwinder Pal Singh', 'Civil'),
  T('balihar', 'Pf. Balihar Singh', 'Civil'),
  T('jashandeep', 'Pf. Jashandeep Singh', 'Civil'),
  T('sandeep', 'Pf. Sandeep Kaur', 'Civil'),
  T('prabhjot', 'Pf. Prabhjot Singh', 'Civil'),
]

// lectureHours includes tutorials; labHours = one lab block; labSessions = blocks per lab group per week.
const S = (id, code, name, lectureHours, labHours = 0, labSessions = 1) => ({ id, code, name, lectureHours, labHours, labSessions })

const SUBJECTS = [
  // 3rd semester (D2)
  S('oop', 'CCS101', 'Object Oriented Programming', 2, 2, 2),
  S('ds', 'CCS102', 'Data Structures', 4, 2, 2),
  S('de', 'ESCS101', 'Digital Electronics', 3, 2, 1),
  S('am', 'BSCS101', 'Applied Mathematics', 4),
  S('ca', 'CCS103', 'Computer Architecture', 4),
  S('strw', 'SMCS101', 'Seminar & Technical Report Writing', 0, 2, 1),
  S('ic', 'MC101', 'Indian Constitution', 2),
  // 5th semester (D3)
  S('toc', 'CCS110', 'Theory of Computation', 4),
  S('cys', 'CCS111', 'Cyber Security', 3, 2, 1),
  S('se', 'CCS112', 'Software Engineering', 3, 2, 1),
  S('eas', 'ESC106', 'Entrepreneurship and Startups', 3),
  S('daa', 'CCS113', 'Design and Analysis of Algorithms', 3, 2, 1),
  S('dt', 'ESCS102', 'Design Thinking', 0, 2, 1),
  S('iks', 'MCS102', 'Essence of Indian Knowledge System', 2),
  S('dmg', 'MCS103', 'Disaster Management', 2),
]

// Teacher per section A-F, straight from the allotment table. [lecture, lab] when they differ.
const ALLOTMENT = {
  D2: {
    oop: ['vivek', 'kamaldeep', 'inderjit', 'shailja', 'khushi', 'jagdeep'],
    ds: ['diksha', 'kajal', 'lovejit', 'gagneet', 'harman', 'honey'],
    de: ['priyanka', 'kawaljeet', 'harminder', 'amitjain', ['shailja', 'nancy'], 'nancy'],
    am: ['pragya', 'pragya', 'pragya', 'shreya', 'pathania', 'shreya'],
    ca: ['harmanpreet', 'kapil', 'lakhvir', 'kapil', 'amanpreet', 'lakhvir'],
    strw: ['kapil', 'palak', 'amanpreet', 'palak', 'palak', 'palak'],
    ic: ['aastik', 'aastik', 'aastik', 'aastik', 'aastik', 'upkarjit'],
  },
  D3: {
    toc: ['kamaldeep', 'kuljit', 'parminder', 'parminder', 'maninder', 'kuljit'],
    cys: ['satinderpal', 'sitarani', 'daljit', 'sitarani', 'harkomal', 'palak'],
    se: ['hardeep', 'kiranjyoti', 'manjot', 'inderjit', 'honey', 'jasdeep'],
    eas: ['bedi', 'bedi', 'bedi', 'sahni', 'sahni', 'sahni'],
    daa: ['jasmine', 'goldendeep', 'manpreet', 'harkomal', 'jasmine', 'meetali'],
    dt: ['kuljit', 'lakhvir', 'maninder', 'harminder', 'lovejit', 'gagneet'],
    iks: ['karan', 'karan', 'karan', 'rajvir', 'rajvir', 'upkarjit'],
    dmg: ['sukhwinder', 'balihar', 'balihar', 'jashandeep', 'sandeep', 'prabhjot'],
  },
}

const DEPARTMENT = { D2: 'CSE - 3rd Sem (D2)', D3: 'CSE - 5th Sem (D3)' }
const BATCH = { D2: '3rd Sem (D2)', D3: '5th Sem (D3)' }

export const CSE_DEPARTMENT = {
  id: 'cse',
  short: 'CSE',
  name: 'Computer Science & Engineering',
  source: 'gndec',
  note: 'From the public CSE subject allotment and timetable on cse.gndec.ac.in.',
}
// Home departments of the teachers in the CSE allotment (Applied Sciences is a service department with no sections).
const TEACHER_DEPT = { CSE: 'cse', MPE: 'me', Civil: 'civil' }

function buildSections() {
  const sections = []
  for (const [year, subjects] of Object.entries(ALLOTMENT)) {
    'ABCDEF'.split('').forEach((letter, i) => {
      sections.push({
        id: `${year.toLowerCase()}-${letter.toLowerCase()}`,
        name: `${year} CS ${letter}`,
        department: DEPARTMENT[year],
        deptId: 'cse',
        batch: BATCH[year],
        students: 56,
        labGroups: 2,
        groupNames: [`${letter}1`, `${letter}2`],
        assignments: Object.entries(subjects).map(([subjectId, who]) => {
          const [teacherId, labTeacherId] = Array.isArray(who[i]) ? who[i] : [who[i]]
          return labTeacherId ? { subjectId, teacherId, labTeacherId } : { subjectId, teacherId }
        }),
      })
    })
  }
  return sections
}

// Facilities follow the infrastructure lists (every classroom and lab has a projector; labs have computers and ACs).
const LAB = ['Computers', 'Projector', 'Air conditioning']

const ROOMS = [
  // Classrooms seen in the published timetable; S-218, G-17, G-18 capacities from the infrastructure list.
  ...['G12', 'G13', 'G14', 'G15', 'G16', 'G17', 'G18', 'S213', 'S214', 'S218'].map((name) => ({
    id: name.toLowerCase(),
    name,
    capacity: 75,
    type: 'classroom',
    deptId: 'cse',
    facilities: ['Projector'],
  })),
  { id: 'sl1', deptId: 'cse', name: 'Software Lab-I', capacity: 35, type: 'lab', facilities: LAB },
  { id: 'sl2', deptId: 'cse', name: 'Software Lab-II', capacity: 34, type: 'lab', facilities: LAB },
  { id: 'sl3', deptId: 'cse', name: 'Software Lab-III', capacity: 35, type: 'lab', facilities: LAB },
  { id: 'sl4', deptId: 'cse', name: 'Software Lab-IV', capacity: 30, type: 'lab', facilities: LAB },
  { id: 'pl', deptId: 'cse', name: 'Project Lab', capacity: 35, type: 'lab', facilities: LAB },
  { id: 'rlab', deptId: 'cse', name: 'Research Lab', capacity: 28, type: 'lab', facilities: LAB },
  { id: 'oslab', deptId: 'cse', name: 'Operating Systems Lab', capacity: 25, type: 'lab', facilities: LAB },
  // DBMS and Hardware lab capacities and equipment are not published; 30 seats is assumed.
  { id: 'dbmslab', deptId: 'cse', name: 'DBMS Lab', capacity: 30, type: 'lab', facilities: ['Computers'] },
  { id: 'hwlab', deptId: 'cse', name: 'Hardware Lab', capacity: 30, type: 'lab', facilities: [] },
  // Kept for events only (Book a Space), never for regular classes. The hall appears in the published
  // timetable (capacity and equipment assumed); the library's 15 seats and projector are from the infrastructure list.
  { id: 'wshall', name: 'WS Seminar Hall', capacity: 150, type: 'seminar', eventsOnly: true, facilities: ['Projector', 'Sound system', 'Air conditioning'] },
  { id: 'deptlib', deptId: 'cse', name: 'Departmental Library', capacity: 15, type: 'seminar', eventsOnly: true, facilities: ['Projector'] },
]

export function gndecCse() {
  const sections = buildSections()
  // Each teacher "can teach" exactly what the allotment gives them.
  const teaches = new Map()
  for (const sec of sections) {
    for (const a of sec.assignments) {
      for (const id of [a.teacherId, a.labTeacherId].filter(Boolean)) {
        if (!teaches.has(id)) teaches.set(id, new Set())
        teaches.get(id).add(a.subjectId)
      }
    }
  }
  return structuredClone({
    meta: {
      name: 'GNDEC Ludhiana - CSE (July-Dec 2026)',
      note: 'Built from the public subject allotment and timetable on cse.gndec.ac.in. Generated by this app, not the official GNDEC timetable.',
    },
    time: {
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      periodsPerDay: 8,
      breakAfter: 4,
      startTime: '08:30',
      periodMinutes: 60,
      breakMinutes: 60,
    },
    departments: [CSE_DEPARTMENT],
    rooms: ROOMS,
    teachers: TEACHERS.map((t) => ({
      ...t,
      deptId: TEACHER_DEPT[t.department] ?? null,
      subjectIds: [...(teaches.get(t.id) || [])],
      maxHours: 24,
      unavailable: [],
    })),
    subjects: SUBJECTS.map((s) => ({ ...s, deptId: s.id === 'am' || s.id === 'ic' || s.id === 'iks' || s.id === 'dmg' ? null : 'cse' })),
    sections,
    timetable: null,
  })
}
