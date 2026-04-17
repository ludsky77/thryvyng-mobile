export function calculateAgeGroup(dateOfBirth: string, seasonStartYear: number): string | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const month = dob.getMonth();
  const sportYear = month >= 7 ? dob.getFullYear() + 1 : dob.getFullYear();
  const uNumber = seasonStartYear - sportYear + 1;
  if (uNumber >= 5 && uNumber <= 19) return `U${uNumber}`;
  return null;
}

export function getSeasonStartYear(seasonStartDate: string | null, seasonEndDate: string | null): number {
  if (seasonStartDate) return new Date(seasonStartDate).getFullYear();
  if (seasonEndDate) return new Date(seasonEndDate).getFullYear() - 1;
  return new Date().getFullYear();
}

export function getSeasonLabel(seasonStartYear: number): string {
  return `${seasonStartYear}\u2013${seasonStartYear + 1}`;
}

export function getAgeGroupBirthRange(ageGroup: string, seasonStartYear: number): { from: string; to: string } | null {
  const match = ageGroup.match(/U(\d+)/);
  if (!match) return null;
  const u = parseInt(match[1]);
  return { from: `Aug 1, ${seasonStartYear - u}`, to: `Jul 31, ${seasonStartYear - u + 1}` };
}

export const AGE_GROUP_GRADES: Record<number, string> = {
  7: '~1st', 8: '~2nd', 9: '~3rd', 10: '~4th',
  11: '~5th', 12: '~6th', 13: '~7th', 14: '~8th',
  15: '~9th', 16: '~Soph', 17: '~Jr', 18: '~Sr', 19: 'Post-HS'
};
