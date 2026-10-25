import { createBooking } from '../../booking.js'
import { createRequest, needsApproval } from '../../campusGuide.js'

/**
 * Book-or-request for staff in the Campus Guide: their own department's rooms are booked straight away
 * (checked again at the moment of booking); shared and other departments' rooms become requests for the
 * administrator. `who`: { role, name, teacherId?, deptId, department }.
 */
export function staffActions(college, who) {
  const actionFor = (room) =>
    needsApproval(who.role, room, who.deptId) ? { label: 'Request', kind: 'request' } : { label: 'Book now', kind: 'book' }

  const onAction = async (room, req) => {
    const fields = { ...req, organizerName: who.name, organizerId: who.teacherId, department: who.department, deptId: who.deptId }
    if (actionFor(room).kind === 'request') {
      const sent = await college.requestSpace(createRequest(fields, room, { role: who.role, name: who.name, teacherId: who.teacherId, deptId: who.deptId }))
      if (sent?.ok === false) return { ok: false, message: `Request not sent: ${sent.reasons.map((r) => r.text).join('; ')}` }
      return { ok: true, message: `Request sent for ${room.name}: it is shared or belongs to another department, so the administrator confirms it. It is not booked yet.` }
    }
    const result = await college.bookSpace(createBooking(fields, room, { role: who.role, teacherId: who.teacherId, deptId: who.deptId }))
    return result.ok
      ? { ok: true, message: `${room.name} is booked for you.` }
      : { ok: false, message: `${room.name} was just taken: ${result.reasons.map((r) => r.text).join('; ')}. Pick another space.` }
  }
  return { actionFor, onAction }
}

export const STAFF_EVENT_TYPES = ['Extra Class', 'Meeting', 'Workshop', 'Seminar', 'Guest Lecture', 'Joint session', 'Other']
