// Dropdown option sets, matching the web login.html <select> lists exactly.
//
// The gendered splits (Boys/Girls Basketball, Soccer, Volleyball, Lacrosse) are
// the web's current lists verbatim — coach scouting matches a player's `sport`
// string against the coach's own, so any drift between the two apps silently
// hides players from the coaches recruiting them. Keep these in lockstep with
// eyescout-site/social-app/login.html.
const BASE_SPORTS = [
  'Football',
  'Boys Basketball', 'Girls Basketball',
  'Baseball', 'Softball',
  'Boys Soccer', 'Girls Soccer',
  'Boys Volleyball', 'Girls Volleyball',
  'Track & Field', 'Wrestling',
  'Boys Lacrosse', 'Girls Lacrosse',
  'Tennis', 'Swimming', 'Cross Country',
];

export const SPORTS = [...BASE_SPORTS, 'Other'].map((s) => ({ label: s, value: s }));

// Coaches get "Multiple Sports" (sees every athlete) instead of "Other".
export const COACH_SPORTS = [...BASE_SPORTS, 'Multiple Sports'].map((s) => ({ label: s, value: s }));

export const GRAD_YEARS = ['2025', '2026', '2027', '2028', '2029', '2030', '2031', '2032'].map((y) => ({
  label: y,
  value: y,
}));

export const DIVISIONS = [
  { label: 'Division I (D1)', value: 'D1' },
  { label: 'Division II (D2)', value: 'D2' },
  { label: 'Division III (D3)', value: 'D3' },
  { label: 'NAIA', value: 'NAIA' },
  { label: 'JUCO (Junior College)', value: 'JUCO' },
  { label: 'High School', value: 'High School' },
];

export const TITLES = [
  'Head Coach', 'Assistant Coach', 'Recruiting Coordinator',
  'Director of Recruiting', 'Graduate Assistant', 'Scout',
].map((t) => ({ label: t, value: t }));

export const BIRTH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
].map((m, i) => ({ label: m, value: String(i + 1).padStart(2, '0') }));

export const BIRTH_DAYS = Array.from({ length: 31 }, (_, i) => {
  const d = String(i + 1).padStart(2, '0');
  return { label: d, value: d };
});

// Deliberately reaches down to 5 years ago, not floored at 13 — the whole point
// of this field is to honestly capture an under-13 birth date so signup can
// actually detect and block it (see SignupQuiz's COPPA gate). Floor the list
// and there's no way to select a true too-young date, silently defeating it.
export const BIRTH_YEARS = Array.from({ length: 96 }, (_, i) => {
  const y = String(new Date().getFullYear() - 5 - i);
  return { label: y, value: y };
});
