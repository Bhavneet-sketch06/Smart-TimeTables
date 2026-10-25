import { blockedOf, periodTimes, periodsOn, roomTypeName } from '../data/schema.js'
import { formatDate, timeRange, upcomingBookings } from '../booking.js'

/** Upcoming one-off room bookings (Book a Space), soonest first. */
function bookingLines(data) {
  const rooms = new Map(data.rooms.map((r) => [r.id, r]))
  const upcoming = upcomingBookings(data.bookings ?? [])
  if (!upcoming.length) return ['', 'ROOM BOOKINGS: none upcoming.']
  return [
    '',
    'ROOM BOOKINGS (one-off events booked with Book a Space; the room is taken for that time on that date only)',
    ...upcoming.map(
      (b) =>
        `- ${formatDate(b.date)} ${timeRange(b)}${b.setup || b.cleanup ? ` (+${b.setup} min setup, +${b.cleanup} min cleanup)` : ''}: ${b.title} [${b.eventType}] in ${rooms.get(b.roomId)?.name ?? 'removed room'}, organizer ${b.organizerName}, ${b.attendance} people, ID ${b.id}`,
    ),
  ]
}

/**
 * Compact plain-text description of the college data and generated timetable, sent to the assistant.
 * Must be deterministic (no timestamps) so the server-side prompt cache is reused across turns.
 */
export function buildTimetableContext(data) {
  const byId = (list) => new Map(list.map((x) => [x.id, x]))
  const subjects = byId(data.subjects)
  const teachers = byId(data.teachers)
  const rooms = byId(data.rooms)
  const { periods, breaks } = periodTimes(data.time)
  const lines = []

  lines.push(`College: ${data.meta?.name ?? 'Custom college data'}`)
  if (data.meta?.note) lines.push(`Note: ${data.meta.note}`)
  lines.push(`Working days: ${data.time.days.join(', ')}`)
  lines.push(`Periods: ${periods.map((p, i) => `P${i + 1} ${p.label}`).join('; ')}`)
  for (const b of breaks) lines.push(`Break: ${b.label} (${b.name}, after P${b.after})`)
  const short = data.time.days.filter((d) => periodsOn(data.time, d) < data.time.periodsPerDay)
  if (short.length) lines.push(`Shorter days: ${short.map((d) => `${d} ends after P${periodsOn(data.time, d)}`).join('; ')}`)
  const blocked = Object.entries(blockedOf(data.time))
  if (blocked.length) lines.push(`No classes (college-wide): ${blocked.map(([slot, why]) => `${slot}${why ? ` ${why}` : ''}`).join('; ')}`)

  if (data.departments?.length) {
    lines.push('', 'DEPARTMENTS (rooms are shared college-wide; some teachers teach in several departments)')
    for (const d of data.departments) {
      const n = data.sections.filter((s) => s.deptId === d.id).length
      lines.push(`- ${d.short}: ${d.name}; ${n} section${n === 1 ? '' : 's'}${d.source === 'sample' ? ' (sample data)' : ''}`)
    }
  }

  lines.push('', 'ROOMS')
  for (const r of data.rooms) {
    const extras = [r.facilities?.length ? `facilities: ${r.facilities.join(', ')}` : '', r.eventsOnly ? 'events only, no regular classes' : '']
    lines.push(`- ${r.name}: ${roomTypeName(data, r.type)}, ${r.capacity} seats${extras.filter(Boolean).map((x) => `; ${x}`).join('')}`)
  }

  lines.push('', 'TEACHERS')
  for (const t of data.teachers) {
    const off = t.unavailable?.length ? `; unavailable ${t.unavailable.join(', ')}` : ''
    lines.push(`- ${t.name} (${t.department || 'no department'}); max ${t.maxHours} h/week${off}`)
  }

  lines.push('', 'SUBJECTS')
  for (const s of data.subjects) {
    const lab = s.labHours ? `, lab ${s.labSessions > 1 ? `${s.labSessions} x ` : ''}${s.labHours} periods per group` : ''
    lines.push(`- ${s.name}${s.code ? ` (${s.code})` : ''}: ${s.lectureHours} lectures/week${lab}`)
  }

  lines.push('', 'SECTIONS')
  for (const sec of data.sections) {
    const groups = sec.labGroups > 1 ? `, lab groups ${(sec.groupNames || []).join('/') || sec.labGroups}` : ''
    lines.push(`- ${sec.name} (${sec.department || 'no department'}), ${sec.students} students${groups}`)
    for (const a of sec.assignments) {
      const lab = a.labTeacherId ? `; lab by ${teachers.get(a.labTeacherId)?.name}` : ''
      lines.push(`    ${subjects.get(a.subjectId)?.name ?? '?'}: ${teachers.get(a.teacherId)?.name ?? 'no teacher'}${lab}`)
    }
  }

  const tt = data.timetable
  if (!tt) {
    lines.push('', 'TIMETABLE: not generated yet. The administrator can generate it from Setup > Sections > Generate timetable.')
    return [...lines, ...bookingLines(data)].join('\n')
  }

  // With accounts, a user receives only the classes their role may see (and students no summary at all).
  const limited = !tt.stats || (data.busy?.rooms?.length ?? 0) > 0
  if (tt.stats) {
    lines.push('', `TIMETABLE: ${tt.stats.placed}/${tt.stats.total} classes placed, ${tt.stats.clashes} clashes, quality ${tt.stats.quality}/100`)
  } else {
    lines.push('', 'TIMETABLE: generated.')
  }
  if (limited) {
    lines.push(
      'Only the classes this user is allowed to see are listed. Sections not listed are hidden from them, not free: never say',
      'anything about them or about who uses a room. For free rooms, point to the Campus Guide tab.',
    )
  }
  if (tt.reason) lines.push(`Incomplete because: ${tt.reason}`)
  const time = (e) => `${periods[e.period]?.start}-${periods[e.period + e.length - 1]?.end}`
  const shown = new Set(tt.entries.map((e) => e.sectionId))
  for (const sec of data.sections) {
    if (limited && !shown.has(sec.id)) continue
    lines.push('', `## ${sec.name}`)
    data.time.days.forEach((day, d) => {
      const today = tt.entries
        .filter((e) => e.sectionId === sec.id && e.day === d)
        .sort((a, b) => a.period - b.period || (a.group ?? '').localeCompare(b.group ?? ''))
      const text = today.map((e) => {
        const what = `${subjects.get(e.subjectId)?.name ?? '?'} ${e.kind === 'lab' ? `lab${e.group ? ` (group ${e.group})` : ''}` : 'lecture'}`
        return `${time(e)} ${what}, ${teachers.get(e.teacherId)?.name ?? '?'}, ${rooms.get(e.roomId)?.name ?? '?'}`
      })
      lines.push(`${day}: ${text.length ? text.join(' | ') : 'no classes'}`)
    })
  }
  return [...lines, ...bookingLines(data)].join('\n')
}
