import { Compass } from 'lucide-react'
import AdminGuide from './AdminGuide.jsx'
import HodGuide from './HodGuide.jsx'
import FacultyGuide from './FacultyGuide.jsx'
import StudentGuide from './StudentGuide.jsx'

const SUBTITLES = {
  admin: 'Every room, every request, across the college.',
  hod: 'Joint sessions and spaces for your department.',
  faculty: 'Your classes and rooms for anything extra.',
  student: 'Your next class and spaces for student activities.',
}

/** Campus Guide: one name for every role; each role sees only its own screen and data. */
export default function CampusGuide({ role, college, deptId }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Compass className="h-6 w-6 text-indigo-600" /> Campus Guide
        </h1>
        <p className="text-slate-500">{SUBTITLES[role]}</p>
      </div>
      {role === 'admin' && <AdminGuide college={college} />}
      {role === 'hod' && <HodGuide college={college} deptId={deptId} />}
      {role === 'faculty' && <FacultyGuide college={college} deptId={deptId} />}
      {role === 'student' && <StudentGuide college={college} deptId={deptId} />}
    </div>
  )
}
