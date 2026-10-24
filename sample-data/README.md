# Sample data for Import College Data

Made-up colleges for trying **Setup → Import college data** (Administrator). Names, faculty and rooms are fictional.

## `northfield/`: Northfield Institute of Engineering & Technology (imports cleanly)

Upload **either** `northfield-college.xlsx` (one workbook, one sheet per table) **or** all 7 files in `csv/` at once.

| | |
|---|---|
| Week | Mon–Sat, 7 periods of 55 min from 09:00, 40-min break after period 4 |
| Departments | CSE, IT, ECE, ME, plus Applied Sciences and Humanities (service departments) |
| Sections | 11 (3rd and 5th semester), each split into two lab groups (A1/A2, B1/B2) |
| Teachers | 27, with home departments, maximum hours and some unavailable periods |
| Subjects | 36, including 2-period labs, a 3-period drawing lab and a lab held twice a week |
| Rooms | 14 classrooms and lecture theatres, 15 labs, 3 events-only halls (seminar hall, conference room, auditorium) |

It imports with no errors or warnings and generates 244 of 244 classes with 0 clashes (quality about 99/100).

Things to try after importing and generating:
- **Departments:** switch between CSE, IT, ECE and ME. Maths (Applied Sciences) and Humanities teachers are shared,
  so they never clash across departments.
- **Lab groups:** labs run per group (A1/A2) in different labs at the same time; lectures are for the whole section.
- **Student My Day:** classes run on Saturdays too, so there is usually something to show.
- **Faculty view:** for example *Mr. Rohit Verma* (lab teacher in several sections) or *Dr. Sunita Rani* (maths across
  departments).
- **Book a Space:** the Main Seminar Hall, Conference Room and Auditorium are for events only; rooms list facilities
  (projector, sound system, computers, video conferencing) to filter by.
- **Failure guidance:** in Setup → Teachers lower *Mr. Rohit Verma*'s maximum hours to 10, or mark most CSE labs as
  events-only in Setup → Rooms, then generate.

## `with-errors/`: the same college with deliberate mistakes

Upload all 7 files in `with-errors/csv/` to see the checks. The import stays blocked until they're fixed:

| File | Row | Column | Mistake |
|---|---|---|---|
| rooms.csv | 15 | type | `gym` is not a room type |
| rooms.csv | 17 | capacity | `thirty-six` is not a number |
| rooms.csv | 34 | name | `A-101` is listed twice |
| teachers.csv | 2 | unavailable | `Sun-1`: Sunday is not a working day |
| teachers.csv | 5 | max_hours | empty |
| sections.csv | 10 | department | `EEE` is not a department |
| assignments.csv | 5 | subject | `CS399` does not exist |
| assignments.csv | 34 | teacher | `Dr. Unknown Person` does not exist |
| assignments.csv | 10 | teacher | warning only: Dr. Neha Gupta isn't listed for CS303 (added automatically) |

Fix a file (or swap in the matching file from `northfield/csv/`) and re-upload it: a file with the same name
replaces the earlier one.
