export default function TimetableGrid({ timetable, timeslots }) {
  if (timetable.length === 0) {
    return (
      <div data-testid="no-timetable" className="text-center py-12">
        <p className="text-slate-500 text-lg">No timetable generated yet. Click "Generate Timetable" to start.</p>
      </div>
    );
  }

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const periods = [...new Set(timeslots.map(ts => ts.period))].sort((a, b) => a - b);

  // Create a map for quick lookup
  const slotMap = {};
  timeslots.forEach(ts => {
    slotMap[ts.id] = ts;
  });

  const getTimetableEntry = (day, period) => {
    return timetable.find(entry => entry.day === day && entry.period === period);
  };

  const getTimeLabel = (period) => {
    const slot = timeslots.find(ts => ts.period === period);
    return slot ? `${slot.start_time} - ${slot.end_time}` : `Period ${period}`;
  };

  // Color palette for subjects
  const subjectColors = [
    'from-blue-500 to-cyan-500',
    'from-purple-500 to-pink-500',
    'from-green-500 to-teal-500',
    'from-orange-500 to-red-500',
    'from-indigo-500 to-blue-500',
    'from-yellow-500 to-orange-500',
  ];

  const getSubjectColor = (subjectName) => {
    if (!subjectName) return 'from-gray-500 to-gray-600';
    const hash = subjectName.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
    return subjectColors[hash % subjectColors.length];
  };

  return (
    <div data-testid="timetable-grid" className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border-2 border-slate-200 bg-gradient-to-r from-cyan-600 to-blue-600 text-white p-4 font-semibold">
              <div className="text-base">Day</div>
            </th>
            {periods.map((period) => (
              <th
                key={period}
                className="border-2 border-slate-200 bg-gradient-to-r from-cyan-600 to-blue-600 text-white p-4 font-semibold min-w-[180px]"
              >
                <div className="text-base mb-1">Period {period}</div>
                <div className="text-xs font-normal opacity-90">{getTimeLabel(period)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day}>
              <td className="border-2 border-slate-200 bg-slate-100 p-4 font-semibold text-slate-700 text-center">
                {day}
              </td>
              {periods.map((period) => {
                const entry = getTimetableEntry(day, period);
                return (
                  <td
                    key={`${day}-${period}`}
                    data-testid={`timetable-cell-${day}-${period}`}
                    className="border-2 border-slate-200 p-2 bg-white hover:bg-slate-50 transition-colors"
                  >
                    {entry ? (
                      <div className="flex flex-col gap-1">
                        <div className={`bg-gradient-to-r ${getSubjectColor(entry.subject_name)} text-white px-3 py-2 rounded-lg font-semibold text-sm shadow-md`}>
                          {entry.subject_name}
                          {entry.subject_code && (
                            <span className="text-xs ml-1 opacity-90">({entry.subject_code})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-600 px-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                          </svg>
                          <span className="font-medium">{entry.teacher_name || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-500 px-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                          </svg>
                          <span>{entry.room_name || 'N/A'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-slate-400 text-sm font-medium">
                        Free Period
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}