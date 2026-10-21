import { useEffect, useState } from 'react'
import { STORAGE_KEY, emptyCollege } from '../data/schema.js'
import { demoCollege } from '../data/demoCollege.js'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...emptyCollege(), ...JSON.parse(raw) }
  } catch {
    // corrupted or blocked storage: fall through to a fresh college
  }
  return emptyCollege()
}

export function useCollegeData() {
  const [data, setData] = useState(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // storage full or unavailable; keep working in memory
    }
  }, [data])

  // Editing any input invalidates a previously generated timetable.
  const update = (key, value) =>
    setData((d) => ({ ...d, [key]: typeof value === 'function' ? value(d[key]) : value, timetable: null }))

  return {
    data,
    update,
    setTimetable: (timetable) => setData((d) => ({ ...d, timetable })),
    loadDemo: () => setData(demoCollege()),
    reset: () => setData(emptyCollege()),
  }
}
