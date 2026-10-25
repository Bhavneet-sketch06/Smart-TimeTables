// Applies supabase/migrations to an in-process Postgres (PGlite) with a minimal stand-in for Supabase's `auth`
// schema and roles, then checks the Row Level Security policies, guard triggers and functions as each role.
// Nothing here talks to a hosted Supabase project.
import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.resolve(__dirname, '..')
const U = {
  admin: '11111111-1111-1111-1111-111111111111',
  hod: '22222222-2222-2222-2222-222222222222',
  fac: '33333333-3333-3333-3333-333333333333',
  stu: '44444444-4444-4444-4444-444444444444',
  pend: '55555555-5555-5555-5555-555555555555',
  hodEce: '66666666-6666-6666-6666-666666666666',
}

let db
const bootstrap = fs.readFileSync(path.join(DIR, 'manual/first_admin.sql'), 'utf8')

/** Runs a query as a signed-in user (or anonymously when `user` is null), like a PostgREST request. */
async function as(user, sql, params) {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`)
  try {
    return await db.query(sql, params)
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}
const rows = async (user, sql, params) => (await as(user, sql, params)).rows
const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const assign = (id, f) =>
  as(U.admin, `update profiles set role=$2, dept_id=$3, teacher_id=$4, section_id=$5, semester=$6, active=true where user_id=$1`, [
    id, f.role, f.dept ?? null, f.teacher ?? null, f.section ?? null, f.semester ?? null,
  ])
const booking = (id, room, extra = {}) => ({
  id, status: 'confirmed', title: 'Extra', eventType: 'Meeting', roomId: room, date: '2026-11-02', start: '10:00',
  duration: 60, setup: 0, cleanup: 0, deptId: 'ece', organizerId: 't2', ...extra,
})
const request = (id, extra = {}) => ({
  id, status: 'approved', title: 'Club', eventType: 'Club meeting', roomId: 'r2', date: '2026-11-03', start: '17:00',
  duration: 60, requester: { role: 'admin', name: 'Fake', sectionId: 's2' }, deptId: 'ece', ...extra,
})

const COLLEGE = {
  time: { days: ['Mon', 'Tue'], periodsPerDay: 4, startTime: '09:00', periodMinutes: 60, breaks: [] },
  meta: { name: 'Test', note: 'Sample' },
  departments: [{ id: 'cse', short: 'CSE', name: 'Computer' }, { id: 'ece', short: 'ECE', name: 'Electronics' }],
  roomTypes: [{ id: 'classroom', name: 'Classroom', kind: 'lecture' }],
  rooms: [
    { id: 'r1', name: 'CSE-101', capacity: 60, type: 'classroom', deptId: 'cse' },
    { id: 'r2', name: 'Hall', capacity: 200, type: 'classroom' },
    { id: 'r3', name: 'ECE-1', capacity: 60, type: 'classroom', deptId: 'ece' },
  ],
  subjects: [{ id: 'sub1', name: 'Maths', code: 'M1', lectureHours: 2, labHours: 0 }],
  teachers: [
    { id: 't1', name: 'Dr One', deptId: 'cse', subjectIds: ['sub1'], maxHours: 10, unavailable: ['Mon-1'] },
    { id: 't2', name: 'Dr Two', deptId: 'ece', subjectIds: ['sub1'], maxHours: 8, unavailable: [] },
  ],
  sections: [
    { id: 's1', name: 'CSE A', deptId: 'cse', batch: '3rd Sem', students: 50, assignments: [] },
    { id: 's2', name: 'ECE A', deptId: 'ece', batch: '3rd Sem', students: 50, assignments: [] },
  ],
  timetable: {
    generatedAt: '2026-10-25T10:00:00.000Z',
    stats: { placed: 3 },
    entries: [
      { sectionId: 's1', subjectId: 'sub1', teacherId: 't1', roomId: 'r1', day: 0, period: 0, length: 1, kind: 'lecture' },
      { sectionId: 's2', subjectId: 'sub1', teacherId: 't2', roomId: 'r2', day: 0, period: 1, length: 1, kind: 'lecture' },
      { sectionId: 's2', subjectId: 'sub1', teacherId: 't1', roomId: 'r3', day: 1, period: 0, length: 1, kind: 'lecture' },
    ],
  },
  addBookings: [booking('BK-DEMO', 'r2', { title: 'Demo', setup: 15, cleanup: 15, createdBy: { role: 'faculty', teacherId: 't2' } })],
}

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } })
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema extensions;
    grant usage on schema extensions to anon, authenticated;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    -- Supabase grants everything in public to the API roles by default; the migrations must revoke it.
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
    insert into auth.users values ('${U.pend}', 'early@x.test');
  `)
  for (const f of fs.readdirSync(path.join(DIR, 'migrations')).sort()) {
    await db.exec(fs.readFileSync(path.join(DIR, 'migrations', f), 'utf8'))
  }
  for (const [k, id] of Object.entries(U)) if (k !== 'pend') await db.query(`insert into auth.users values ($1, $2)`, [id, `${k}@x.test`])
}, 60_000)

describe('accounts and first administrator', () => {
  it('gives every Auth user, including existing ones, a pending profile with no access', async () => {
    expect((await one(`select count(*)::int n from profiles where role = 'pending' and not active`)).n).toBe(6)
  })

  it('bootstraps exactly one named administrator', async () => {
    await expect(db.exec(bootstrap)).rejects.toThrow(/Set target_email/)
    await db.exec(bootstrap.replace("'REPLACE_WITH_ADMIN_EMAIL';", "'ADMIN@x.test';"))
    expect(await one(`select role, active from profiles where user_id = $1`, [U.admin])).toEqual({ role: 'admin', active: true })
    await expect(db.exec(bootstrap.replace("'REPLACE_WITH_ADMIN_EMAIL';", "'hod@x.test';"))).rejects.toThrow(/already exists/)
  })

  it('lets only an administrator save college data', async () => {
    await expect(as(U.hod, `select public.save_college('{"departments":[]}')`)).rejects.toThrow(/Only administrators/)
    await as(U.admin, `select public.save_college($1)`, [COLLEGE])
    expect((await one(`select count(*)::int n from timetable_entries`)).n).toBe(3)
    expect((await one(`select data from teachers where id='t1'`)).data.maxHours).toBeUndefined()
    expect((await one(`select data from teacher_private where teacher_id='t1'`)).data).toEqual({ maxHours: 10, unavailable: ['Mon-1'] })
    expect((await one(`select dept_id from timetable_entries where data->>'sectionId'='s2' limit 1`)).dept_id).toBe('ece')
  })

  it('assigns roles with a scope that exists', async () => {
    await assign(U.hod, { role: 'hod', dept: 'cse' })
    await assign(U.hodEce, { role: 'hod', dept: 'ece' })
    await assign(U.fac, { role: 'faculty', dept: 'cse', teacher: 't1' })
    await assign(U.stu, { role: 'student', dept: 'cse', section: 's1', semester: '3rd Sem' })
    expect((await one(`select count(*)::int n from profiles where active`)).n).toBe(5)
    await expect(assign(U.pend, { role: 'student', dept: 'ece', section: 's1', semester: 'x' })).rejects.toThrow(/not exist in the chosen department/)
    await expect(assign(U.pend, { role: 'faculty', dept: 'cse', teacher: 'nope' })).rejects.toThrow(/faculty member does not exist/)
    await expect(assign(U.pend, { role: 'faculty', dept: 'cse', teacher: 't1' })).rejects.toThrow(/unique/)
    await expect(as(U.admin, `update profiles set active=false where user_id=$1`, [U.admin])).rejects.toThrow(/own administrator access/)
  })

  it('never lets users change their own role or scope', async () => {
    expect((await as(U.stu, `update profiles set role='admin', section_id=null where user_id=$1`, [U.stu])).affectedRows).toBe(0)
    expect((await as(U.pend, `update profiles set role='admin', active=true where user_id=$1`, [U.pend])).affectedRows).toBe(0)
    await expect(as(U.stu, `update profiles set email='x' where user_id=$1`, [U.stu])).rejects.toThrow(/permission denied/)
    await expect(as(U.stu, `insert into profiles (user_id, role, active) values (gen_random_uuid(), 'admin', true)`)).rejects.toThrow(/permission denied/)
    expect(await rows(U.stu, `select * from profiles`)).toHaveLength(1)
    expect(await rows(U.admin, `select * from profiles`)).toHaveLength(6)
  })
})

describe('reading college data', () => {
  it('denies anonymous and pending users', async () => {
    await expect(as(null, `select * from departments`)).rejects.toThrow(/permission denied/)
    await expect(as(null, `select * from room_busy()`)).rejects.toThrow(/permission denied/)
    expect(await rows(U.pend, `select * from departments`)).toHaveLength(0)
    expect(await rows(U.pend, `select * from timetable_entries`)).toHaveLength(0)
    expect(await rows(U.pend, `select * from room_busy()`)).toHaveLength(0)
  })

  it('shows a student only their own section, plus free/busy without details', async () => {
    expect((await rows(U.stu, `select section_id from timetable_entries`)).map((r) => r.section_id)).toEqual(['s1'])
    expect(await rows(U.stu, `select * from timetable_meta`)).toHaveLength(0)
    expect((await rows(U.stu, `select timetable_generated_at() t`))[0].t).not.toBeNull()
    expect(await rows(U.stu, `select * from teacher_private`)).toHaveLength(0)
    expect(await rows(U.stu, `select * from bookings`)).toHaveLength(0)
    expect(await rows(U.stu, `select * from room_busy()`)).toHaveLength(3)
    expect(await rows(U.stu, `select * from section_busy()`)).toHaveLength(0)
    const holds = await rows(U.stu, `select * from booking_holds('2026-10-01')`)
    expect(holds).toHaveLength(1)
    expect(Object.keys(holds[0]).sort()).toEqual(['cleanup', 'date', 'duration', 'room_id', 'setup', 'start'])
  })

  it('scopes HODs and faculty to their department', async () => {
    expect(await rows(U.hod, `select * from timetable_entries`)).toHaveLength(1)
    expect(await rows(U.hod, `select * from section_busy()`)).toHaveLength(3)
    expect((await rows(U.hod, `select teacher_id from teacher_private`)).map((r) => r.teacher_id)).toEqual(['t1'])
    // Faculty: their department's classes plus their own class in ECE.
    expect(await rows(U.fac, `select * from timetable_entries`)).toHaveLength(2)
    expect((await rows(U.fac, `select teacher_id from teacher_private`)).map((r) => r.teacher_id)).toEqual(['t1'])
    expect(await rows(U.fac, `select * from section_busy()`)).toHaveLength(0)
    expect(await rows(U.fac, `select * from bookings`)).toHaveLength(0)
    expect(await rows(U.hodEce, `select * from bookings`)).toHaveLength(1)
  })
})

describe('writes by non-administrators', () => {
  it('blocks catalogue and timetable changes', async () => {
    await expect(as(U.hod, `insert into departments (id, data) values ('x', '{"id":"x"}')`)).rejects.toThrow(/row-level security/)
    expect((await as(U.fac, `delete from timetable_entries where true`)).affectedRows).toBe(0)
    await expect(as(U.fac, `select public.save_college('{"timetable":null}')`)).rejects.toThrow(/Only administrators/)
    expect((await one(`select count(*)::int n from timetable_entries`)).n).toBe(3)
  })

  it("lets staff book only their department's rooms, with trusted fields, and never double-books", async () => {
    await as(U.fac, `insert into bookings (id, data) values ($1, $2)`, ['BK-F1', booking('BK-F1', 'r1')])
    const b = await one(`select * from bookings where id='BK-F1'`)
    expect([b.dept_id, b.organizer_teacher_id, b.created_by, b.data.organizerName]).toEqual(['cse', 't1', U.fac, 'Dr One'])
    await expect(as(U.fac, `insert into bookings (id, data) values ($1, $2)`, ['BK-F2', booking('BK-F2', 'r2', { start: '15:00' })])).rejects.toThrow(/row-level security/)
    await expect(as(U.fac, `insert into bookings (id, data) values ($1, $2)`, ['BK-F3', booking('BK-F3', 'r3', { start: '15:00' })])).rejects.toThrow(/row-level security/)
    await expect(as(U.hod, `insert into bookings (id, data) values ($1, $2)`, ['BK-H1', booking('BK-H1', 'r1', { start: '10:30' })])).rejects.toThrow(/bookings_no_overlap/)
    await as(U.hod, `insert into bookings (id, data) values ($1, $2)`, ['BK-H2', booking('BK-H2', 'r1', { start: '11:00' })])
    await expect(as(U.stu, `insert into bookings (id, data) values ($1, $2)`, ['BK-S1', booking('BK-S1', 'r1', { start: '16:00' })])).rejects.toThrow(/cannot book/)
  })

  it('lets staff only cancel bookings in their scope', async () => {
    await expect(as(U.fac, `update bookings set data = data || '{"title":"Hacked"}' where id='BK-F1'`)).rejects.toThrow(/only cancel/)
    expect((await as(U.fac, `update bookings set data = data || '{"status":"cancelled","cancelledAt":"2026-10-25"}' where id='BK-F1'`)).affectedRows).toBe(1)
    expect((await as(U.fac, `update bookings set data = data || '{"status":"cancelled"}' where id='BK-DEMO'`)).affectedRows).toBe(0)
  })

  it('takes the requester from the profile and lets only administrators decide', async () => {
    await as(U.stu, `insert into requests (id, data) values ($1, $2)`, ['RQ-1', request('RQ-1')])
    const rq = await one(`select * from requests where id='RQ-1'`)
    expect([rq.status, rq.data.requester.role, rq.data.requester.sectionId, rq.dept_id, rq.user_id]).toEqual(['pending', 'student', 's1', 'cse', U.stu])
    expect(await rows(U.fac, `select * from requests`)).toHaveLength(0)
    expect(await rows(U.hod, `select * from requests`)).toHaveLength(0)
    await expect(as(U.stu, `update requests set data = data || '{"status":"approved"}' where id='RQ-1'`)).rejects.toThrow(/only withdraw/)
    await as(U.fac, `insert into requests (id, data) values ($1, $2)`, ['RQ-2', request('RQ-2', { start: '18:00' })])
    expect((await rows(U.hod, `select id from requests`)).map((r) => r.id)).toEqual(['RQ-2'])
    await expect(as(U.stu, `select public.decide_request('RQ-1', 'approve', '', $1)`, [booking('BK-X', 'r2')])).rejects.toThrow(/Only administrators/)

    await as(U.admin, `select public.decide_request('RQ-1', 'approve', 'ok', $1)`, [booking('BK-RQ1', 'r2', { date: '2026-11-03', start: '17:00' })])
    expect((await one(`select status from requests where id='RQ-1'`)).status).toBe('approved')
    await expect(
      as(U.admin, `select public.decide_request('RQ-2', 'approve', '', $1)`, [booking('BK-RQ2', 'r2', { date: '2026-11-03', start: '17:30' })]),
    ).rejects.toThrow(/bookings_no_overlap/)
    expect((await one(`select status from requests where id='RQ-2'`)).status).toBe('pending')
    expect((await as(U.fac, `update requests set data = data || '{"status":"withdrawn","decidedAt":"x"}' where id='RQ-2'`)).affectedRows).toBe(1)
  })
})

describe('administrator saves', () => {
  it('clears the timetable and replaces lists', async () => {
    await as(U.admin, `select public.save_college('{"timetable": null}')`)
    expect((await one(`select count(*)::int n from timetable_entries`)).n).toBe(0)
    await as(U.admin, `select public.save_college($1)`, [{ teachers: [{ id: 't1', name: 'Dr One', deptId: 'cse', subjectIds: [], maxHours: 12, unavailable: [] }] }])
    expect((await one(`select count(*)::int n from teachers`)).n).toBe(1)
    expect((await one(`select count(*)::int n from teacher_private`)).n).toBe(1)
  })
})

describe('access requests', () => {
  it('shows pending users the names to choose from, and nobody else', async () => {
    await as(U.admin, `select public.save_college($1)`, [{
      teachers: [
        { id: 't1', name: 'Dr One', deptId: 'cse', subjectIds: [], maxHours: 12, unavailable: [] },
        { id: 't3', name: 'Dr Three', deptId: 'cse', subjectIds: [], maxHours: 9, unavailable: ['Tue-2'] },
      ],
    }])
    const options = (await rows(U.pend, `select public.access_options() o`))[0].o
    expect(options.departments.map((d) => d.id)).toEqual(['cse', 'ece'])
    // Dr One already has an active faculty account; limits are never included.
    expect(options.teachers).toEqual([{ id: 't3', name: 'Dr Three', deptId: 'cse' }])
    expect(options.sections.map((s) => s.id)).toEqual(['s1', 's2'])
    expect((await rows(U.stu, `select public.access_options() o`))[0].o).toBeNull()
    await expect(as(null, `select public.access_options()`)).rejects.toThrow(/permission denied/)
  })

  it('records a request that grants nothing', async () => {
    await expect(as(U.pend, `select public.request_access('admin', 'cse')`)).rejects.toThrow(/Choose HOD/)
    await expect(as(U.pend, `select public.request_access('faculty', 'cse', 't1')`)).rejects.toThrow(/already has an account/)
    await expect(as(U.pend, `select public.request_access('student', 'ece', null, 's1', '3rd')`)).rejects.toThrow(/Choose your section/)
    await as(U.pend, `select public.request_access('faculty', 'cse', 't3', null, null, 'Employee 42')`)
    const p = await one(`select * from profiles where user_id = $1`, [U.pend])
    expect([p.role, p.active, p.requested_role, p.requested_teacher_id, p.requested_note]).toEqual(['pending', false, 'faculty', 't3', 'Employee 42'])
    expect(await rows(U.pend, `select * from departments`)).toHaveLength(0)
    expect(await rows(U.pend, `select * from timetable_entries`)).toHaveLength(0)
  })

  it('never lets users write requests or access directly', async () => {
    expect((await as(U.pend, `update profiles set requested_role='hod' where user_id=$1`, [U.pend])).affectedRows).toBe(0)
    await expect(as(U.stu, `select public.request_access('hod', 'cse')`)).rejects.toThrow(/managed by an administrator/)
    await expect(as(U.pend, `update profiles set role='faculty' where user_id=$1`, [U.pend])).resolves.toMatchObject({ affectedRows: 0 })
  })

  it('lets an administrator decline, and approving settles the request', async () => {
    await as(U.admin, `update profiles set requested_role=null, requested_dept_id=null, requested_teacher_id=null, requested_note=null, requested_at=null, request_declined_at=now() where user_id=$1`, [U.pend])
    expect((await one(`select request_declined_at from profiles where user_id = $1`, [U.pend])).request_declined_at).not.toBeNull()
    await as(U.pend, `select public.request_access('faculty', 'cse', 't3')`)
    expect((await one(`select request_declined_at from profiles where user_id = $1`, [U.pend])).request_declined_at).toBeNull()
    await assign(U.pend, { role: 'faculty', dept: 'cse', teacher: 't3' })
    const p = await one(`select * from profiles where user_id = $1`, [U.pend])
    expect([p.role, p.active, p.teacher_id, p.requested_role, p.requested_at]).toEqual(['faculty', true, 't3', null, null])
    await expect(as(U.pend, `select public.request_access('hod', 'cse')`)).rejects.toThrow(/managed by an administrator/)
  })
})
