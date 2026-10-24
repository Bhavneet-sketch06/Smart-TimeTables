# Sample data for Import College Data

Made-up colleges for trying **Setup → Import college data** (Administrator). Names, faculty and rooms are fictional.

## `northfield/`: Northfield Institute of Engineering & Technology (imports cleanly)

Upload **either** `northfield-college.xlsx` (one workbook, one sheet per table) **or** all 8 files in `csv/` at once.
If another college is already loaded, the import suggests **Replace** (it is a complete, different college).

| | |
|---|---|
| Week | Mon–Sat, 7 periods of 55 min from 09:00; tea break after period 2, lunch after period 4 |
| Short day / no-class slots | Saturday ends after period 4; Monday period 1 is Assembly, Wednesday period 7 is Sports |
| Departments | CSE, IT, ECE, ME, plus Applied Sciences and Humanities (service departments) |
| Room types | Classroom, Lecture theatre, Tutorial room, Computer lab, Electronics lab, Mechanical lab, Workshop, Drawing hall, Seminar hall |
| Rooms | 33: 15 for lectures and tutorials, 15 labs of five kinds, 3 events-only halls |
| Subjects | 36: labs tied to the right kind of lab (and facilities, e.g. CS301 needs Computers), double-period lectures, tutorials, a 3-period drawing lab, a lab twice a week |
| Teachers | 27, with weekly maximums, some daily limits (e.g. Mr. Rohit Verma at most 6 a day) and unavailable periods |
| Sections | 11 (3rd and 5th semester), each with two lab groups (A1/A2, B1/B2) and at most 7 periods a day |

It imports with no errors or warnings and generates every class with 0 clashes (quality 99–100/100) in under a second.

Things to try after importing and generating:
- **Departments:** switch between CSE, IT, ECE and ME. Maths and Humanities teachers are shared without clashes.
- **Rooms:** CS and IT labs only use computer labs, ECE labs electronics labs, Machine Drawing the drawing hall.
- **Week shape:** two break rows, Saturday ending early, Assembly and Sports slots shown in the grid.
- **Lab groups and tutorials:** labs and tutorials run per group (A1/A2), lectures for the whole section.
- **Student My Day:** classes run on Saturdays too.
- **Book a Space:** the Main Seminar Hall, Conference Room and Auditorium are for events only; filter by facilities.
- **Failure guidance:** in Setup → Teachers lower *Mr. Rohit Verma*'s maximum hours to 10, or in Setup → Time
  structure block more slots, then generate.
- **Update & add:** after importing, upload just `csv/teachers.csv` with a changed `max_hours`: only that changes.

## `with-errors/`: the same college with deliberate mistakes

Upload all 8 files in `with-errors/csv/` to see the checks. The import stays blocked until they're fixed:

| File | Row | Column | Mistake |
|---|---|---|---|
| rooms.csv | 15 | type | empty (a room type is required) |
| rooms.csv | 18 | capacity | `thirty-six` is not a number |
| rooms.csv | 35 | name | `A-101` is listed twice |
| subjects.csv | 30 | lab_room_type | `Drafting studio` is not a room type |
| teachers.csv | 2 | unavailable | `Sun-1`: Sunday is not a working day |
| teachers.csv | 5 | max_hours | empty |
| sections.csv | 10 | department | `EEE` is not a department |
| assignments.csv | 5 | subject | `CS399` does not exist |
| assignments.csv | 34 | teacher | `Dr. Unknown Person` does not exist |
| assignments.csv | 10 | teacher | warning only: Dr. Neha Gupta isn't listed for CS303 (added automatically) |

Fix a file (or swap in the matching file from `northfield/csv/`) and re-upload it: a file with the same name
replaces the earlier one.
