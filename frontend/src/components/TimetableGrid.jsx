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

  const getTimetableEntry = (day, period) => {
    return timetable.find(entry => entry.day === day && entry.period === period);
  };

  return (
    <div data-testid="timetable-grid" className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border-2 border-slate-200 bg-gradient-to-r from-cyan-500 to-blue-500 text-white p-3 font-semibold">
              Day / Period
            </th>
            {periods.map((period) => (
              <th
                key={period}
                className="border-2 border-slate-200 bg-gradient-to-r from-cyan-500 to-blue-500 text-white p-3 font-semibold"
              >
                Period {period}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day}>
              <td className="border-2 border-slate-200 bg-slate-100 p-3 font-semibold text-slate-700">
                {day}
              </td>
              {periods.map((period) => {
                const entry = getTimetableEntry(day, period);
                return (
                  <td
                    key={`${day}-${period}`}
                    data-testid={`timetable-cell-${day}-${period}`}
                    className="timetable-cell bg-white"
                  >
                    {entry ? (
                      <>
                        <div className="subject-badge">{entry.subject_name}</div>
                        <div className="teacher-label">{entry.teacher_name}</div>
                        <div className="room-label">{entry.room_name}</div>
                      </>
                    ) : (
                      <span className="text-slate-400 text-xs">Free</span>
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