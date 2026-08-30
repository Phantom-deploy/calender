/* Bell schedules for Poway Unified schools.

   Every schedule below was transcribed from that school's own
   "Bell Schedules (Printer Friendly)" page on powayusd.com, checked in
   August 2026. `year` records the school year the source page was labelled
   with, and `stale: true` marks a school whose page had not yet been updated
   for 2026-27 when this was written — those need re-checking before anyone
   relies on them.

   Times are the school's local (Pacific) time in 24-hour form. Each row is
   [label, start, end, period?]; `period` ties a row to one of that school's
   class period slots, and rows without it are breaks, lunches and passing
   time. Staff-only blocks are left out.

   `periods` lists the period slots a student actually picks classes for, so
   schools that run 3 blocks and schools that run 7 periods both work.

   To update: re-read the school's printer-friendly page and edit the rows.  */

window.SCHOOLS = {

  delnorte: {
    name: 'Del Norte High School',
    level: 'High school',
    year: '2026-27',
    periods: [1, 2, 3, 4, 5],


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
  },

  westview: {
    name: 'Westview High School',
    level: 'High school',
    year: '2026-27',
    periods: [1, 2, 3, 4],

    schedules: {
      mf: {
        name: 'Monday / Friday',
        rows: [
          ['Period 1', '08:35', '10:00', 1],
          ['Passing', '10:00', '10:06'],
          ['The DEN', '10:06', '10:27'],
          ['Passing', '10:27', '10:33'],
          ['Period 2', '10:33', '11:58', 2],
          ['Lunch', '11:58', '12:33'],
          ['Passing', '12:33', '12:39'],
          ['Period 3', '12:39', '14:04', 3],
          ['Passing', '14:04', '14:10'],
          ['Period 4', '14:10', '15:35', 4]
        ]
      },

      tt: {
        name: 'Tuesday / Thursday',
        rows: [
          ['Period 1', '08:35', '09:56', 1],
          ['Wolverine Time', '09:56', '10:26'],
          ['Passing', '10:26', '10:32'],
          ['Period 2', '10:32', '11:53', 2],
          ['Lunch', '11:53', '12:28'],
          ['Passing', '12:28', '12:34'],
          ['SSH', '12:34', '12:47'],
          ['Period 3', '12:47', '14:08', 3],
          ['Passing', '14:08', '14:14'],
          ['Period 4', '14:14', '15:35', 4]
        ]
      },

      wednesday: {
        name: 'Wednesday (late start)',
        rows: [
          ['Period 1', '09:35', '10:44', 1],
          ['Passing', '10:44', '10:50'],
          ['Period 2', '10:50', '11:59', 2],
          ['Lunch', '11:59', '12:34'],
          ['Passing', '12:34', '12:40'],
          ['Period 3', '12:40', '13:49', 3],
          ['Wolverine Time', '13:49', '14:20'],
          ['Passing', '14:20', '14:26'],
          ['Period 4', '14:26', '15:35', 4]
        ]
      },

      minimum: {
        name: 'Minimum day',
        rows: [
          ['Period 1', '08:35', '09:33', 1],
          ['Period 2', '09:39', '10:37', 2],
          ['Lunch', '10:37', '11:07'],
          ['Period 3', '11:13', '12:11', 3],
          ['Period 4', '12:17', '13:15', 4]
        ]
      },

      finalsA: {
        name: 'Finals — day 1',
        rows: [
          ['Period 1 Final', '08:35', '10:35', 1],
          ['Lunch', '10:35', '11:09'],
          ['Period 2 Final', '11:15', '13:15', 2]
        ]
      },

      finalsB: {
        name: 'Finals — day 2',
        rows: [
          ['Period 3 Final', '08:35', '10:35', 3],
          ['Lunch', '10:35', '11:09'],
          ['Period 4 Final', '11:15', '13:15', 4]
        ]
      }
    },

    byDate: {},

    byWeekday: [null, 'mf', 'tt', 'wednesday', 'tt', 'mf', null],
    pickable: ['mf', 'tt', 'wednesday', 'minimum', 'finalsA', 'finalsB']
  },

  mtcarmel: {
    name: 'Mt. Carmel High School',
    level: 'High school',
    year: '2026-27',
    periods: [1, 2, 3, 4, 5],

    schedules: {
      mf: {
        name: 'Monday / Friday',
        rows: [
          ['Period 1', '08:35', '09:46', 1],
          ['Break', '09:46', '09:56'],
          ['Period 2', '10:02', '11:13', 2],
          ['Period 3', '11:19', '12:31', 3],
          ['Lunch', '12:31', '13:01'],
          ['Period 4', '13:07', '14:18', 4],
          ['Period 5', '14:24', '15:35', 5]
        ]
      },

      tt: {
        name: 'Tuesday / Thursday',
        rows: [
          ['Period 1', '08:35', '09:40', 1],
          ['Break', '09:40', '09:50'],
          ['Period 2', '09:56', '11:01', 2],
          ['Tutorial', '11:01', '11:29'],
          ['Period 3', '11:35', '12:43', 3],
          ['Lunch', '12:43', '13:13'],
          ['Period 4', '13:19', '14:24', 4],
          ['Period 5', '14:30', '15:35', 5]
        ]
      },

      wednesday: {
        name: 'Wednesday (late start)',
        rows: [
          ['Period 1', '09:35', '10:36', 1],
          ['Period 2', '10:42', '11:43', 2],
          ['Period 3', '11:49', '12:51', 3],
          ['Lunch', '12:51', '13:21'],
          ['Period 4', '13:27', '14:28', 4],
          ['Period 5', '14:34', '15:35', 5]
        ]
      },

      minimum: {
        name: 'Minimum day',
        rows: [
          ['Period 1', '08:35', '09:20', 1],
          ['Period 2', '09:26', '10:11', 2],
          ['Period 3', '10:17', '11:02', 3],
          ['Period 4', '11:08', '11:53', 4],
          ['Lunch', '11:53', '12:23'],
          ['Period 5', '12:29', '13:14', 5]
        ]
      },

      extLunch: {
        name: 'Extended lunch',
        rows: [
          ['Period 1', '08:35', '09:45', 1],
          ['Period 2', '09:51', '11:01', 2],
          ['Period 3', '11:07', '12:17', 3],
          ['Lunch', '12:17', '13:03'],
          ['Period 4', '13:09', '14:19', 4],
          ['Period 5', '14:25', '15:35', 5]
        ]
      },

      firstDay: {
        name: 'First day',
        rows: [
          ['Orientation', '09:35', '10:59'],
          ['Period 1', '11:05', '12:01', 1],
          ['Period 2', '12:07', '12:47', 2],
          ['Period 3', '12:53', '13:33', 3],
          ['Lunch', '13:33', '14:03'],
          ['Period 4', '14:09', '14:49', 4],
          ['Period 5', '14:55', '15:35', 5]
        ]
      },

      finalsA: {
        name: 'Finals — day 1',
        rows: [
          ['Period 1', '09:35', '10:19', 1],
          ['Period 2', '10:25', '11:09', 2],
          ['Break', '11:09', '11:19'],
          ['Period 3', '11:25', '12:09', 3],
          ['Period 4', '12:15', '12:59', 4],
          ['Lunch', '12:59', '13:29'],
          ['Period 5 Final', '13:35', '15:35', 5]
        ]
      },

      finalsB: {
        name: 'Finals — day 2',
        rows: [
          ['Tutorial', '09:35', '10:53'],
          ['Period 1 Final', '10:59', '12:59', 1],
          ['Lunch', '12:59', '13:29'],
          ['Period 2 Final', '13:35', '15:35', 2]
        ]
      },

      finalsC: {
        name: 'Finals — day 3',
        rows: [
          ['Period 3 Final', '08:35', '10:35', 3],
          ['Lunch', '10:35', '11:05'],
          ['Period 4 Final', '11:11', '13:11', 4]
        ]
      }
    },

    byDate: {},

    byWeekday: [null, 'mf', 'tt', 'wednesday', 'tt', 'mf', null],
    pickable: ['mf', 'tt', 'wednesday', 'minimum', 'extLunch', 'firstDay', 'finalsA', 'finalsB', 'finalsC']
  },

  poway: {
    name: 'Poway High School',
    level: 'High school',
    year: '2024-25',
    stale: true,
    note: 'Their site still showed the 2024-25 schedule when this was written.',
    periods: [1, 2, 3, 4, 5],

    schedules: {
      regular: {
        name: 'Regular day',
        rows: [
          ['Period 1', '08:35', '09:45', 1],
          ['Passing', '09:45', '09:50'],
          ['Period 2', '09:50', '11:00', 2],
          ['Break', '11:00', '11:10'],
          ['Passing', '11:10', '11:15'],
          ['Period 3', '11:15', '12:35', 3],
          ['Lunch', '12:35', '13:05'],
          ['Passing', '13:05', '13:10'],
          ['Period 4', '13:10', '14:20', 4],
          ['Passing', '14:20', '14:25'],
          ['Period 5', '14:25', '15:35', 5]
        ]
      },

      wednesday: {
        name: 'Wednesday (late start)',
        rows: [
          ['Period 1', '09:35', '10:34', 1],
          ['Passing', '10:34', '10:39'],
          ['Period 2', '10:39', '11:38', 2],
          ['Break', '11:38', '11:48'],
          ['Passing', '11:48', '11:53'],
          ['Period 3', '11:53', '12:57', 3],
          ['Lunch', '12:57', '13:27'],
          ['Passing', '13:27', '13:32'],
          ['Period 4', '13:32', '14:31', 4],
          ['Passing', '14:31', '14:36'],
          ['Period 5', '14:36', '15:35', 5]
        ]
      }
    },

    byDate: {},

    byWeekday: [null, 'regular', 'regular', 'wednesday', 'regular', 'regular', null],
    pickable: ['regular', 'wednesday']
  },

  ranchobernardo: {
    name: 'Rancho Bernardo High School',
    level: 'High school',
    year: '2026-27',
    periods: [1, 2, 3, 4],

    schedules: {
      regular: {
        name: 'Regular day',
        rows: [
          ['Period 1', '08:35', '10:05', 1],
          ['Period 2', '10:15', '11:45', 2],
          ['Lunch', '11:45', '12:15'],
          ['Period 3', '12:25', '13:55', 3],
          ['Period 4', '14:05', '15:35', 4]
        ]
      },

      wednesday: {
        name: 'Wednesday (late start)',
        rows: [
          ['Collaboration', '08:35', '09:25'],
          ['Period 1', '09:35', '10:50', 1],
          ['Period 2', '11:00', '12:15', 2],
          ['Lunch', '12:15', '12:45'],
          ['Period 3', '12:55', '14:10', 3],
          ['Period 4', '14:20', '15:35', 4]
        ]
      },

      minimum: {
        name: 'Minimum day',
        rows: [
          ['Period 1', '08:35', '09:30', 1],
          ['Period 2', '09:40', '10:35', 2],
          ['Period 3', '10:45', '11:40', 3],
          ['Lunch', '11:40', '12:10'],
          ['Period 4', '12:20', '13:15', 4]
        ]
      },

      extLunch: {
        name: 'Extended lunch',
        rows: [
          ['Period 1', '08:35', '10:00', 1],
          ['Period 2', '10:10', '11:35', 2],
          ['Lunch', '11:35', '12:25'],
          ['Period 3', '12:35', '14:00', 3],
          ['Period 4', '14:10', '15:35', 4]
        ]
      },

      finalsLate: {
        name: 'Finals (late start)',
        rows: [
          ['Period 2 Final', '10:55', '12:55', 2],
          ['Lunch', '12:55', '13:25'],
          ['Period 4 Final', '13:35', '15:35', 4]
        ]
      },

      finalsA: {
        name: 'Finals — A',
        rows: [
          ['Period 1 Final', '08:35', '10:35', 1],
          ['Lunch', '10:35', '11:05'],
          ['Period 3 Final', '11:15', '13:15', 3]
        ]
      }
    },

    byDate: {
      '2026-09-15': 'minimum',
      '2026-10-20': 'minimum',
      '2026-12-18': 'minimum',
      '2027-01-12': 'minimum',
      '2027-03-02': 'minimum',
      '2027-03-30': 'minimum',
      '2027-05-04': 'minimum',
      '2027-06-01': 'minimum',
      '2026-12-04': 'extLunch',
      '2027-05-07': 'extLunch',
      '2026-10-15': 'finalsLate',
      '2026-10-16': 'finalsA',
      '2027-01-07': 'finalsA',
      '2027-03-25': 'finalsA',
      '2027-06-02': 'finalsLate',
      '2027-06-03': 'finalsA'
    },

    byWeekday: [null, 'regular', 'regular', 'wednesday', 'regular', 'regular', null],
    pickable: ['regular', 'wednesday', 'minimum', 'extLunch', 'finalsLate', 'finalsA']
  },

  abraxas: {
    name: 'Abraxas High School',
    level: 'Continuation high school',
    year: '2026-27',
    periods: [1, 2, 3, 4, 5],

    schedules: {
      regular: {
        name: 'Regular day',
        rows: [
          ['Period 1', '08:35', '09:45', 1],
          ['Passing', '09:45', '09:50'],
          ['Period 2', '09:50', '11:00', 2],
          ['Lunch', '11:00', '11:30'],
          ['Period 3', '11:30', '12:10', 3],
          ['Passing', '12:10', '12:15'],
          ['Period 4', '12:15', '13:25', 4],
          ['Passing', '13:25', '13:30'],
          ['Period 5', '13:30', '14:40', 5]
        ]
      },

      early: {
        name: 'Early release',
        rows: [
          ['Period 1', '08:35', '09:25', 1],
          ['Passing', '09:25', '09:30'],
          ['Period 2', '09:30', '10:20', 2],
          ['Passing', '10:20', '10:25'],
          ['Period 3', '10:25', '10:55', 3],
          ['Lunch', '10:55', '11:25'],
          ['Period 4', '11:25', '12:15', 4],
          ['Passing', '12:15', '12:20'],
          ['Period 5', '12:20', '13:10', 5]
        ]
      }
    },

    byDate: {},

    byWeekday: [null, 'regular', 'regular', 'regular', 'regular', 'regular', null],
    pickable: ['regular', 'early']
  },

  twinpeaks: {
    name: 'Twin Peaks Middle School',
    level: 'Middle school',
    year: '2026-27',
    periods: [1, 2, 3, 4],

    schedules: {
      regular: {
        name: 'Regular day',
        rows: [
          ['Block 1', '08:30', '09:45', 1],
          ['Morning break', '09:45', '09:55'],
          ['Passing', '09:55', '09:59'],
          ['Block 2', '09:59', '11:14', 2],
          ['Passing', '11:14', '11:19'],
          ['1st lunch / RAM', '11:19', '11:49'],
          ['2nd lunch / RAM', '11:53', '12:23'],
          ['Passing', '12:23', '12:27'],
          ['Block 3', '12:27', '13:42', 3],
          ['Afternoon break', '13:42', '13:46'],
          ['Passing', '13:46', '13:50'],
          ['Block 4', '13:50', '15:05', 4]
        ]
      },

      wednesday: {
        name: 'Wednesday (late start)',
        rows: [
          ['Block 1', '09:30', '10:30', 1],
          ['Break', '10:30', '10:40'],
          ['Passing', '10:40', '10:44'],
          ['Block 2', '10:44', '11:44', 2],
          ['1st lunch / RAM', '11:48', '12:18'],
          ['2nd lunch / RAM', '12:22', '12:52'],
          ['Block 3', '12:58', '13:56', 3],
          ['Block 4', '14:05', '15:05', 4]
        ]
      },

      minimum: {
        name: 'Minimum day',
        rows: [
          ['Block 1', '08:30', '09:17', 1],
          ['Block 2', '09:21', '10:07', 2],
          ['1st brunch / RAM', '10:11', '10:31'],
          ['2nd brunch / RAM', '10:35', '10:55'],
          ['Block 3', '10:59', '11:45', 3],
          ['Block 4', '11:49', '12:35', 4]
        ]
      }
    },

    byDate: {},

    byWeekday: [null, 'regular', 'regular', 'wednesday', 'regular', 'regular', null],
    pickable: ['regular', 'wednesday', 'minimum']
  },

  bernardoheights: {
    name: 'Bernardo Heights Middle School',
    level: 'Middle school',
    year: '2026-27',
    note: 'Their bell schedule lists three blocks a day and does not publish a period rotation, so each block is treated as one class.',
    periods: [1, 2, 3],

    schedules: {
      regular: {
        name: 'Regular day',
        rows: [
          ['1st block', '08:00', '09:35', 1],
          ['Break', '09:35', '09:49'],
          ['2nd block', '09:53', '11:23', 2],
          ['Bobcat lunch A', '11:27', '12:02'],
          ['Bobcat lunch B', '12:06', '12:41'],
          ['3rd block', '12:45', '14:15', 3]
        ]
      },

      minimum: {
        name: 'Minimum day',
        rows: [
          ['1st block', '08:00', '08:56', 1],
          ['Break', '08:56', '09:06'],
          ['2nd block', '09:10', '10:03', 2],
          ['Bobcat lunch A', '10:07', '10:33'],
          ['Bobcat lunch B', '10:37', '11:03'],
          ['3rd block', '11:07', '12:00', 3]
        ]
      }
    },

    byDate: {},

    byWeekday: [null, 'regular', 'regular', 'regular', 'regular', 'regular', null],
    pickable: ['regular', 'minimum']
  },

  blackmountain: {
    name: 'Black Mountain Middle School',
    level: 'Middle school',
    year: '2024-25',
    stale: true,
    note: 'Their site still showed the 2024-25 schedule when this was written, and it does not say which periods meet on Thursday versus Friday \u2014 those blocks show times only.',
    periods: [1, 2, 3, 4, 5, 6, 7],

    schedules: {
      mt: {
        name: 'Monday / Tuesday',
        rows: [
          ['Period 1', '08:00', '09:01', 1],
          ['Period 2', '09:05', '10:00', 2],
          ['Period 3', '10:04', '10:59', 3],
          ['Period 4', '11:03', '11:58', 4],
          ['Period 5', '12:02', '12:37', 5],
          ['Period 6', '12:41', '13:36', 6],
          ['Period 7', '13:40', '14:35', 7]
        ]
      },

      wednesday: {
        name: 'Wednesday (late start)',
        rows: [
          ['Period 1', '09:00', '09:51', 1],
          ['Period 2', '09:55', '10:40', 2],
          ['Period 3', '10:44', '11:29', 3],
          ['Period 4', '11:33', '12:18', 4],
          ['Period 5', '12:22', '12:57', 5],
          ['Period 6', '13:01', '13:46', 6],
          ['Period 7', '13:50', '14:35', 7]
        ]
      },

      block: {
        name: 'Block day (Thu / Fri)',
        /* The rows are labelled "Period 1/4/5", "2/6" and "3/7", but the
           school does not publish which of those meet on Thursday and which
           on Friday. Rather than bind the wrong class to a block, these rows
           carry no period: the times are right, the class name is left out. */
        rows: [
          ['Period 1 / 4 / 5', '08:00', '09:41'],
          ['Nutrition break', '09:41', '09:51'],
          ['Period 2 / 6', '09:55', '11:34'],
          ['Lunch A', '11:38', '12:13'],
          ['Lunch B', '12:17', '12:52'],
          ['Period 3 / 7', '12:56', '14:35']
        ]
      }
    },

    byDate: {},

    byWeekday: [null, 'mt', 'mt', 'wednesday', 'block', 'block', null],
    pickable: ['mt', 'wednesday', 'block']
  },

  mesaverde: {
    name: 'Mesa Verde Middle School',
    level: 'Middle school',
    year: '2026-27',
    periods: [1, 2, 3, 4, 5, 6, 7],

    schedules: {
      regular: {
        name: 'Regular day',
        rows: [
          ['Period 1', '08:00', '08:55', 1],
          ['Period 2', '08:59', '09:52', 2],
          ['Period 3', '09:56', '10:49', 3],
          ['Period 4', '10:53', '11:46', 4],
          ['Period 5', '11:50', '12:31', 5],
          ['Period 6', '12:35', '13:28', 6],
          ['Period 7', '13:32', '14:25', 7]
        ]
      },

      wednesday: {
        name: 'Wednesday (late start)',
        rows: [
          ['Period 1', '09:03', '09:41', 1],
          ['Period 2', '09:45', '10:23', 2],
          ['Homeroom', '10:27', '10:55'],
          ['Period 3', '10:59', '11:37', 3],
          ['Period 4', '11:41', '12:19', 4],
          ['Period 5', '12:23', '13:01', 5],
          ['Period 6', '13:05', '13:43', 6],
          ['Period 7', '13:47', '14:25', 7]
        ]
      },

      minimum: {
        name: 'Minimum day',
        rows: [
          ['Period 1', '08:00', '08:31', 1],
          ['Period 2', '08:35', '09:05', 2],
          ['Period 3', '09:09', '09:39', 3],
          ['Period 4', '09:43', '10:13', 4],
          ['Period 5', '10:17', '10:47', 5],
          ['Period 6', '10:51', '11:21', 6],
          ['Period 7', '11:25', '11:55', 7]
        ]
      }
    },

    byDate: {},

    byWeekday: [null, 'regular', 'regular', 'wednesday', 'regular', 'regular', null],
    pickable: ['regular', 'wednesday', 'minimum']
  },

  oakvalley: {
    name: 'Oak Valley Middle School',
    level: 'Middle school',
    year: '2026-27',
    /* The school states it plainly on the minimum-day schedule:
       "Periods 1, 3, & 7 (Odds)" and "Periods 2, 4, & 8 (Evens)". Which
       calendar day is odd and which is even is published only as an image,
       and it shifts around holidays, so the app asks you once instead of
       guessing — see `rotation`. */
    rotation: { names: ['Odd day', 'Even day'] },
    periods: [1, 2, 3, 4, 7, 8],

    schedules: {
      regular: {
        name: 'Regular day',
        rows: [
          ['Period 1 / 2', '08:00', '09:40', [1, 2]],
          ['Break', '09:40', '09:50'],
          ['Period 3 / 4', '09:55', '11:30', [3, 4]],
          ['A lunch', '11:30', '12:10'],
          ['B lunch', '12:10', '12:50'],
          ['Period 7 / 8', '12:55', '14:30', [7, 8]]
        ]
      },

      wednesday: {
        name: 'Wednesday (late start)',
        rows: [
          ['Period 1 / 2', '09:00', '10:20', [1, 2]],
          ['Break', '10:20', '10:30'],
          ['Period 3 / 4', '10:35', '11:50', [3, 4]],
          ['A lunch', '11:50', '12:30'],
          ['B lunch', '12:30', '13:10'],
          ['Period 7 / 8', '13:15', '14:30', [7, 8]]
        ]
      },

      minimum: {
        name: 'Minimum day',
        rows: [
          ['Period 1 / 2', '08:00', '08:55', [1, 2]],
          ['Period 3 / 4', '09:00', '09:55', [3, 4]],
          ['A lunch', '09:55', '10:25'],
          ['B lunch', '10:25', '10:55'],
          ['Period 7 / 8', '11:00', '11:55', [7, 8]]
        ]
      }
    },

    byDate: {},

    byWeekday: [null, 'regular', 'regular', 'wednesday', 'regular', 'regular', null],
    pickable: ['regular', 'wednesday', 'minimum']
  },

  meadowbrook: {
    name: 'Meadowbrook Middle School',
    level: 'Middle school',
    year: '2026-27',
    periods: [1, 2, 3, 4, 5, 6, 7, 8],

    schedules: {
      regular: {
        name: 'Regular day',
        rows: [
          ['Period 1', '08:00', '08:50', 1],
          ['Period 2', '08:54', '09:41', 2],
          ['Period 3', '09:45', '10:32', 3],
          ['Period 4 / lunch', '10:32', '11:11', 4],
          ['Period 5', '11:15', '12:02', 5],
          ['Period 6', '12:06', '12:53', 6],
          ['Period 7', '12:57', '13:44', 7],
          ['Period 8', '13:48', '14:35', 8]
        ]
      },

      wednesday: {
        name: 'Wednesday (block)',
        rows: [
          ['MBMS News', '09:00', '09:23'],
          ['Period 1', '09:23', '10:51', 1],
          ['Period 2', '10:55', '12:23', 2],
          ['Lunch', '12:23', '13:03'],
          ['Period 3', '13:07', '14:35', 3]
        ]
      },

      thursday: {
        name: 'Thursday (block)',
        rows: [
          ['Period 4 / 5', '08:00', '09:28', 4],
          ['Period 6', '09:32', '10:57', 6],
          ['Lunch', '10:57', '11:37'],
          ['Period 7', '11:41', '13:06', 7],
          ['Period 8', '13:10', '14:35', 8]
        ]
      }
    },

    byDate: {},

    byWeekday: [null, 'regular', 'regular', 'wednesday', 'thursday', 'regular', null],
    pickable: ['regular', 'wednesday', 'thursday']
  },

  design39: {
    name: 'Design39Campus',
    level: 'K-8',
    year: '2026-27',
    note: 'Design39 publishes gate and dismissal times rather than numbered periods, so there are no class periods to fill in.',
    periods: [],

    schedules: {
      regular: {
        name: 'Regular day',
        rows: [
          ['School day', '09:10', '15:15']
        ]
      },

      minimum: {
        name: 'Minimum day',
        rows: [
          ['School day', '09:10', '13:10']
        ]
      }
    },

    byDate: {},

    byWeekday: [null, 'regular', 'regular', 'regular', 'regular', 'regular', null],
    pickable: ['regular', 'minimum']
  },

  palomar: {
    name: 'Poway to Palomar Middle College',
    level: 'Middle college',
    year: '2026-27',
    note: 'Students attend Palomar College, which does not publish a school bell schedule. Set your own periods, or use another school\u2019s schedule.',
    periods: [],

    schedules: {
      regular: {
        name: 'College day',
        rows: [
          ['On campus at Palomar', '08:00', '15:00']
        ]
      }
    },

    byDate: {},

    byWeekday: [null, 'regular', 'regular', 'regular', 'regular', 'regular', null],
    pickable: ['regular']
  }
};

/* The order they appear in the picker. */
window.SCHOOL_ORDER = ['delnorte', 'mtcarmel', 'poway', 'ranchobernardo', 'westview',
  'abraxas', 'palomar', 'bernardoheights', 'blackmountain', 'design39',
  'meadowbrook', 'mesaverde', 'oakvalley', 'twinpeaks'];

/* app.js swaps this to the school you picked; Del Norte keeps working for
   anyone who used the app before schools existed. */
window.BELL = window.SCHOOLS.delnorte;
