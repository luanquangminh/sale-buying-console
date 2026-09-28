/* Payment tracking: where an invoice stands against its due date. */

const dayNumber = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 : null;
};

/** paid → "paid"; no due date → "open"; due date already passed → "overdue" with the days late; otherwise "due" with the days left (0 = today). */
export function dueState(row, todayIso) {
  if (row.paid) return { state: "paid", days: 0 };
  const due = dayNumber(row.dueDate);
  const today = dayNumber(todayIso);
  if (due === null || today === null) return { state: "open", days: 0 };
  return due < today ? { state: "overdue", days: today - due } : { state: "due", days: due - today };
}

export function dueLabel(row, todayIso) {
  const { state, days } = dueState(row, todayIso);
  if (state === "paid") return "Paid";
  if (state === "open") return "No due date";
  if (state === "overdue") return `Overdue ${days} day${days === 1 ? "" : "s"}`;
  return days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`;
}

export const DUE_TONE = { paid: "green", overdue: "red", due: "gray", open: "gray" };
