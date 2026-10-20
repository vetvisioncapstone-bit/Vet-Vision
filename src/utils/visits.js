// Date of a patient's latest visit, or '' when they have never been seen: the server's `lastVisit` (latest
// consultation or service visit), else the newest consultation in the row.
export function getLastVisitDate(patient) {
  if (patient.lastVisit) return patient.lastVisit
  return (patient.consultations || []).reduce((latest, c) => ((c.date || '') > latest ? c.date : latest), '')
}
