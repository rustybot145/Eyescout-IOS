// Dropdown option sets, matching the web login.html <select> lists exactly.

export const SPORTS = [
  'Football', 'Basketball', 'Baseball', 'Softball', 'Soccer', 'Track & Field',
  'Volleyball', 'Wrestling', 'Lacrosse', 'Tennis', 'Swimming', 'Cross Country', 'Other',
].map((s) => ({ label: s, value: s }));

export const COACH_SPORTS = [
  'Football', 'Basketball', 'Baseball', 'Softball', 'Soccer', 'Track & Field',
  'Volleyball', 'Wrestling', 'Lacrosse', 'Tennis', 'Swimming', 'Cross Country', 'Multiple Sports',
].map((s) => ({ label: s, value: s }));

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
