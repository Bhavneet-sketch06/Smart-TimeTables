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

function buildSections() {
  const sections = []
  for (const [year, subjects] of Object.entries(ALLOTMENT)) {
    'ABCDEF'.split('').forEach((letter, i) => {
      sections.push({
        id: `${year.toLowerCase()}-${letter.toLowerCase()}`,
        name: `${year} CS ${letter}`,
        department: DEPARTMENT[year],
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

const ROOMS = [
  // Classrooms seen in the published timetable; S-218, G-17, G-18 capacities from the infrastructure list.
  ...['G12', 'G13', 'G14', 'G15', 'G16', 'G17', 'G18', 'S213', 'S214', 'S218'].map((name) => ({
    id: name.toLowerCase(),
    name,
    capacity: 75,
    type: 'classroom',
  })),
  { id: 'sl1', name: 'Software Lab-I', capacity: 35, type: 'lab' },
  { id: 'sl2', name: 'Software Lab-II', capacity: 34, type: 'lab' },
  { id: 'sl3', name: 'Software Lab-III', capacity: 35, type: 'lab' },
  { id: 'sl4', name: 'Software Lab-IV', capacity: 30, type: 'lab' },
  { id: 'pl', name: 'Project Lab', capacity: 35, type: 'lab' },
  { id: 'rlab', name: 'Research Lab', capacity: 28, type: 'lab' },
  { id: 'oslab', name: 'Operating Systems Lab', capacity: 25, type: 'lab' },
  // DBMS and Hardware lab capacities are not published; 30 is assumed.
  { id: 'dbmslab', name: 'DBMS Lab', capacity: 30, type: 'lab' },
  { id: 'hwlab', name: 'Hardware Lab', capacity: 30, type: 'lab' },
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
    rooms: ROOMS,
    teachers: TEACHERS.map((t) => ({ ...t, subjectIds: [...(teaches.get(t.id) || [])], maxHours: 24, unavailable: [] })),
    subjects: SUBJECTS,
    sections,
    timetable: null,
  })
}
