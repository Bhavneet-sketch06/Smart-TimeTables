// GNDEC multi-department demo: the real CSE data (gndecCse.js) plus SAMPLE departments (ECE, Mechanical, Civil)
// with made-up faculty, subjects and sections, so switching departments shows genuinely different timetables.
// Electrical is listed but deliberately not set up, to demonstrate the "set up this department" prompt.
//
// Shared resources across departments: two lecture theatres (LT-1, LT-2), the events-only WS Seminar Hall, and
// Applied Sciences / Humanities teachers who teach in several departments.

import { gndecCse } from './gndecCse.js'

const SAMPLE_NOTE = 'Sample department for the demo: faculty, subjects and sections are made up (not GNDEC data).'
const DEPARTMENTS = [
  { id: 'ece', short: 'ECE', name: 'Electronics & Communication Engineering', source: 'sample', note: SAMPLE_NOTE },
  { id: 'me', short: 'ME', name: 'Mechanical Engineering', source: 'sample', note: SAMPLE_NOTE },
  { id: 'civil', short: 'Civil', name: 'Civil Engineering', source: 'sample', note: SAMPLE_NOTE },
  { id: 'ee', short: 'EE', name: 'Electrical Engineering', source: 'sample', note: 'Not set up yet: no sections or subjects.' },
]

const room = (id, name, capacity, type, deptId, facilities = []) => ({ id, name, capacity, type, deptId, facilities })
const ROOMS = [
  // Shared by every department (no home department).
  room('lt1', 'Lecture Theatre LT-1', 120, 'classroom', null, ['Projector', 'Sound system']),
  room('lt2', 'Lecture Theatre LT-2', 120, 'classroom', null, ['Projector', 'Sound system']),
  room('lt3', 'Lecture Theatre LT-3', 90, 'classroom', null, ['Projector']),
  room('e101', 'E-101', 70, 'classroom', 'ece', ['Projector']),
  room('elab', 'Electronics Lab', 35, 'lab', 'ece', ['Oscilloscopes', 'Projector']),
  room('clab', 'Communication Lab', 35, 'lab', 'ece', ['Computers', 'Signal generators']),
  room('m101', 'M-101', 70, 'classroom', 'me', ['Projector']),
  room('tlab', 'Thermal Engineering Lab', 35, 'lab', 'me', ['Projector']),
  room('shop', 'Machine Shop', 40, 'lab', 'me', ['Lathes', 'CNC machine']),
  room('c101', 'C-101', 70, 'classroom', 'civil', ['Projector']),
  room('svlab', 'Surveying Lab', 35, 'lab', 'civil', ['Total station']),
  room('ctlab', 'Concrete Technology Lab', 35, 'lab', 'civil', ['Compression testing machine']),
]

const teacher = (id, name, department, deptId) => ({ id, name, department, deptId, maxHours: 24, unavailable: [] })
const TEACHERS = [
  // Shared service-department teachers (teach in ECE, ME and Civil).
  teacher('s-math1', 'Dr. Neha Malhotra', 'Applied Sciences', null),
  teacher('s-math2', 'Dr. Rajiv Khanna', 'Applied Sciences', null),
  teacher('s-hum', 'Pf. Simran Gill', 'Humanities', null),
  teacher('s-env', 'Dr. Meera Kaul', 'Applied Sciences', null),
  // ECE
  teacher('e1', 'Dr. Arvind Sethi', 'ECE', 'ece'),
  teacher('e2', 'Pf. Kavita Bhatia', 'ECE', 'ece'),
  teacher('e3', 'Dr. Sandeep Walia', 'ECE', 'ece'),
  teacher('e4', 'Pf. Neelam Chawla', 'ECE', 'ece'),
  teacher('e5', 'Dr. Harjot Sandhu', 'ECE', 'ece'),
  teacher('e6', 'Pf. Pooja Mehra', 'ECE', 'ece'),
  // Mechanical
  teacher('m1', 'Dr. Gurpreet Dhillon', 'ME', 'me'),
  teacher('m2', 'Pf. Anil Saini', 'ME', 'me'),
  teacher('m3', 'Dr. Ramandeep Grewal', 'ME', 'me'),
  teacher('m4', 'Pf. Sukhdev Rana', 'ME', 'me'),
  teacher('m5', 'Dr. Vikas Taneja', 'ME', 'me'),
  teacher('m6', 'Pf. Jaspreet Virk', 'ME', 'me'),
  // Civil
  teacher('c1', 'Dr. Harpreet Bains', 'Civil', 'civil'),
  teacher('c2', 'Pf. Mandeep Sidhu', 'Civil', 'civil'),
  teacher('c3', 'Dr. Rohit Goyal', 'Civil', 'civil'),
  teacher('c4', 'Pf. Navneet Cheema', 'Civil', 'civil'),
  teacher('c5', 'Dr. Amarjit Ghuman', 'Civil', 'civil'),
  teacher('c6', 'Pf. Simranjit Toor', 'Civil', 'civil'),
]

// [id, code, name, lectureHours, labHours, deptId]
const S = (id, code, name, lectureHours, labHours, deptId) => ({ id, code, name, lectureHours, labHours, labSessions: 1, deptId })
const SUBJECTS = [
  S('ma3', 'BSC201', 'Engineering Mathematics III', 4, 0, null),
  S('hu-ic', 'MC201', 'Indian Constitution', 2, 0, null),
  S('hu-evs', 'MC301', 'Environmental Science', 2, 0, null),
  S('ec-na', 'EC201', 'Network Analysis', 4, 0, 'ece'),
  S('ec-ae', 'EC202', 'Analog Electronics', 3, 2, 'ece'),
  S('ec-dsd', 'EC203', 'Digital System Design', 3, 2, 'ece'),
  S('ec-ss', 'EC204', 'Signals & Systems', 4, 0, 'ece'),
  S('ec-com', 'EC301', 'Communication Systems', 3, 2, 'ece'),
  S('ec-mp', 'EC302', 'Microprocessors & Interfacing', 3, 2, 'ece'),
  S('ec-emw', 'EC303', 'Electromagnetic Waves', 4, 0, 'ece'),
  S('ec-ctl', 'EC304', 'Control Systems', 4, 0, 'ece'),
  S('me-td', 'ME201', 'Engineering Thermodynamics', 4, 0, 'me'),
  S('me-som', 'ME202', 'Strength of Materials', 3, 2, 'me'),
  S('me-mfg', 'ME203', 'Manufacturing Processes', 3, 2, 'me'),
  S('me-kom', 'ME204', 'Kinematics of Machines', 4, 0, 'me'),
  S('me-ht', 'ME301', 'Heat Transfer', 3, 2, 'me'),
  S('me-dom', 'ME302', 'Dynamics of Machines', 3, 2, 'me'),
  S('me-fmc', 'ME303', 'Fluid Machinery', 4, 0, 'me'),
  S('me-ie', 'ME304', 'Industrial Engineering', 4, 0, 'me'),
  S('ce-sm', 'CE201', 'Solid Mechanics', 4, 0, 'civil'),
  S('ce-sur', 'CE202', 'Surveying', 3, 2, 'civil'),
  S('ce-fm', 'CE203', 'Fluid Mechanics', 3, 2, 'civil'),
  S('ce-bmc', 'CE204', 'Building Materials & Construction', 4, 0, 'civil'),
  S('ce-sa', 'CE301', 'Structural Analysis', 4, 0, 'civil'),
  S('ce-ct', 'CE302', 'Concrete Technology', 3, 2, 'civil'),
  S('ce-ge', 'CE303', 'Geotechnical Engineering', 3, 2, 'civil'),
  S('ce-te', 'CE304', 'Transportation Engineering', 4, 0, 'civil'),
]

// Department -> { code used in section names, 3rd and 5th semester subjects with their teacher }
const PLAN = {
  ece: {
    code: 'EC',
    D2: [['ec-na', 'e1'], ['ec-ae', 'e2'], ['ec-dsd', 'e3'], ['ec-ss', 'e4'], ['ma3', 's-math1'], ['hu-ic', 's-hum']],
    D3: [['ec-com', 'e5'], ['ec-mp', 'e6'], ['ec-emw', 'e1'], ['ec-ctl', 'e4'], ['hu-evs', 's-env']],
  },
  me: {
    code: 'ME',
    D2: [['me-td', 'm1'], ['me-som', 'm2'], ['me-mfg', 'm3'], ['me-kom', 'm4'], ['ma3', 's-math1'], ['hu-ic', 's-hum']],
    D3: [['me-ht', 'm5'], ['me-dom', 'm6'], ['me-fmc', 'm1'], ['me-ie', 'm3'], ['hu-evs', 's-env']],
  },
  civil: {
    code: 'CE',
    D2: [['ce-sm', 'c1'], ['ce-sur', 'c2'], ['ce-fm', 'c3'], ['ce-bmc', 'c4'], ['ma3', 's-math2'], ['hu-ic', 's-hum']],
    D3: [['ce-sa', 'c1'], ['ce-ct', 'c5'], ['ce-ge', 'c6'], ['ce-te', 'c4'], ['hu-evs', 's-env']],
  },
}
const BATCH = { D2: '3rd Sem (D2)', D3: '5th Sem (D3)' }
const SHORT = { ece: 'ECE', me: 'ME', civil: 'Civil' }

function sampleSections() {
  const sections = []
  for (const [deptId, plan] of Object.entries(PLAN)) {
    for (const year of ['D2', 'D3']) {
      for (const letter of ['A', 'B']) {
        sections.push({
          id: `${deptId}-${year.toLowerCase()}-${letter.toLowerCase()}`,
          name: `${year} ${plan.code} ${letter}`,
          department: `${SHORT[deptId]} - ${BATCH[year]}`,
          deptId,
          batch: BATCH[year],
          students: 60,
          labGroups: 2,
          groupNames: [`${letter}1`, `${letter}2`],
          assignments: plan[year].map(([subjectId, teacherId]) => ({ subjectId, teacherId })),
        })
      }
    }
  }
  return sections
}

export function gndecCollege() {
  const cse = gndecCse()
  const sections = sampleSections()
  const teaches = new Map()
  for (const sec of sections) {
    for (const a of sec.assignments) {
      if (!teaches.has(a.teacherId)) teaches.set(a.teacherId, new Set())
      teaches.get(a.teacherId).add(a.subjectId)
    }
  }
  return structuredClone({
    ...cse,
    meta: {
      name: 'GNDEC Ludhiana (multi-department demo, July-Dec 2026)',
      note: 'CSE is built from public GNDEC documents; ECE, Mechanical and Civil are sample departments with made-up faculty and subjects. Generated by this app, not an official GNDEC timetable.',
    },
    departments: [...cse.departments, ...DEPARTMENTS],
    rooms: [...cse.rooms, ...ROOMS],
    teachers: [...cse.teachers, ...TEACHERS.map((t) => ({ ...t, subjectIds: [...(teaches.get(t.id) || [])] }))],
    subjects: [...cse.subjects, ...SUBJECTS],
    sections: [...cse.sections, ...sections],
  })
}
