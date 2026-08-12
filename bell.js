/* Bell schedules — Del Norte High School, 2026–27.
   Transcribed from "DEL NORTE HIGH SCHOOL — Bell Schedules (Printer Friendly)".

   Times are San Diego local (Pacific) in 24-hour form. Each row is
   [label, start, end, period?] — `period` ties the row to one of your five
   class periods so your own class name can sit next to it. Rows without it
   are breaks, lunches and the like. Staff-only blocks (Pro Grow) are left
   out: students aren't there for them.

   To update for a new year, edit the rows and the dates in `byDate`. */

window.BELL = {

  schedules: {
    regular: {
      name: 'Regular day',
      rows: [
        ['Period 1', '08:35', '09:41', 1],
        ['Period 2', '09:46', '10:55', 2],
        ['Break', '10:55', '11:02'],
        ['Office Hours', '11:02', '11:32'],
        ['Period 3', '11:37', '12:43', 3],
        ['Lunch', '12:43', '13:13'],
        ['Period 4', '13:18', '14:24', 4],
        ['Period 5', '14:29', '15:35', 5]
      ]
    },

    wednesday: {
      name: 'Wednesday (late start)',
      rows: [
        ['Period 1', '09:35', '10:34', 1],
        ['Period 2', '10:39', '11:38', 2],
        ['Break', '11:38', '11:48'],
        ['Period 3', '11:53', '12:57', 3],
        ['Lunch', '12:57', '13:27'],
        ['Period 4', '13:32', '14:31', 4],
        ['Period 5', '14:36', '15:35', 5]
      ]
    },

    firstDay: {
      name: 'First day of school',
      rows: [
        ['9th Grade Orientation', '08:00', '09:25'],
        ['All School Assembly', '09:35', '10:00'],
        ['Period 1', '10:10', '11:03', 1],
        ['Period 2', '11:08', '12:01', 2],
        ['Break', '12:01', '12:11'],
        ['Period 3', '12:16', '13:09', 3],
        ['Lunch', '13:09', '13:39'],
        ['Period 4', '13:44', '14:37', 4],
        ['Period 5', '14:42', '15:35', 5]
      ]
    },

    minimum: {
      name: 'Minimum day',
      rows: [
        ['Period 1', '08:35', '09:25', 1],
        ['Period 2', '09:30', '10:20', 2],
        ['Period 3', '10:25', '11:15', 3],
        ['Lunch', '11:15', '11:45'],
        ['Period 4', '11:50', '12:40', 4],
        ['Period 5', '12:45', '13:35', 5]
      ]
    },

    conferences: {
      name: 'Parent/teacher conferences',
      rows: [
        ['Period 1', '08:35', '09:23', 1],
        ['Period 2', '09:28', '10:16', 2],
        ['Break', '10:16', '10:26'],
        ['Period 3', '10:31', '11:19', 3],
        ['Period 4', '11:24', '12:12', 4],
        ['Lunch', '12:12', '12:42'],
        ['Period 5', '12:47', '13:35', 5],
        ['Conferences', '13:35', '15:45']
      ]
    },

    parade: {
      name: 'Parade / safety drill',
      rows: [
        ['Period 1', '08:35', '09:40', 1],
        ['Period 2', '09:45', '10:50', 2],
        ['Break', '10:50', '11:00'],
        ['Period 3', '11:05', '12:10', 3],
        ['Parade', '12:10', '12:45'],
        ['Lunch', '12:45', '13:15'],
        ['Period 4', '13:20', '14:25', 4],
        ['Period 5', '14:30', '15:35', 5]
      ]
    },

    pepRally: {
      name: 'Pep rally',
      rows: [
        ['Period 1', '08:35', '09:35', 1],
        ['Period 2', '09:40', '10:40', 2],
        ['Break', '10:40', '10:50'],
        ['Period 3A', '10:55', '11:55', 3],
        ['Period 3B', '11:55', '12:55', 3],
        ['Lunch', '12:55', '13:25'],
        ['Period 4', '13:30', '14:30', 4],
        ['Period 5', '14:35', '15:35', 5]
      ]
    },

    finalsA: {
      name: 'Finals — day 1',
      rows: [
        ['Period 1', '09:35', '10:16', 1],
        ['Break', '10:16', '10:26'],
        ['Period 1 Final', '10:31', '12:31', 1],
        ['Lunch', '12:31', '13:01'],
        ['Period 2', '13:06', '13:37', 2],
        ['Period 3', '13:42', '14:13', 3],
        ['Period 4', '14:18', '14:49', 4],
        ['Break', '14:49', '14:59'],
        ['Period 5', '15:04', '15:35', 5]
      ]
    },

    finalsB: {
      name: 'Finals — day 2',
      rows: [
        ['Period 2 Final', '08:35', '10:35', 2],
        ['Lunch', '10:35', '11:05'],
        ['Period 3 Final', '11:10', '13:10', 3]
      ]
    },

    finalsC: {
      name: 'Finals — day 3',
      rows: [
        ['Period 4 Final', '08:35', '10:35', 4],
        ['Lunch', '10:35', '11:05'],
        ['Period 5 Final', '11:10', '13:10', 5]
      ]
    },

    finalsT3A: {
      name: 'Finals — day 1',
      rows: [
        ['Period 1', '08:35', '09:22', 1],
        ['Break', '09:22', '09:32'],
        ['Period 1 Final', '09:37', '11:37', 1],
        ['Lunch', '11:37', '12:07'],
        ['Period 2', '12:12', '12:59', 2],
        ['Period 3', '13:04', '13:51', 3],
        ['Period 4', '13:56', '14:43', 4],
        ['Period 5', '14:48', '15:35', 5]
      ]
    },

    finalsT3B: {
      name: 'Finals — day 2',
      rows: [
        ['Period 2 Final', '09:35', '11:35', 2],
        ['Lunch', '11:35', '12:05'],
        ['Period 3 Final', '12:10', '14:10', 3]
      ]
    }
  },

  /* Dates that override the usual weekday schedule. */
  byDate: {
    '2026-08-13': 'firstDay',

    '2026-09-29': 'conferences',
    '2026-10-06': 'conferences',

    '2026-10-09': 'parade',        // Homecoming parade
    '2026-10-12': 'parade',        // Safety drill
    '2027-02-01': 'parade',        // Safety drill

    '2026-11-09': 'minimum',
    '2026-12-18': 'minimum',
    '2027-03-01': 'minimum',

    '2026-11-04': 'finalsA',       // Trimester 1 finals
    '2026-11-05': 'finalsB',
    '2026-11-06': 'finalsC',

    '2027-02-24': 'finalsA',       // Trimester 2 finals
    '2027-02-25': 'finalsB',
    '2027-02-26': 'finalsC',

    '2027-06-01': 'finalsT3A',     // Trimester 3 finals
    '2027-06-02': 'finalsT3B',
    '2027-06-03': 'finalsC'
  },

  /* Sunday … Saturday. null means no school. */
  byWeekday: [null, 'regular', 'regular', 'wednesday', 'regular', 'regular', null],

  /* Offered when you change a day's schedule by hand. */
  pickable: ['regular', 'wednesday', 'minimum', 'pepRally', 'parade', 'conferences',
             'firstDay', 'finalsA', 'finalsB', 'finalsC', 'finalsT3A', 'finalsT3B']
};
