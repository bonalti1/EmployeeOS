/** The companies whose work tasks live in the shared weekly planner. */
export type CompanyId = 'stb' | 'alto' | 'ranch'

export type Company = { id: CompanyId; name: string; logo: string; desc?: string }

export const COMPANIES: Company[] = [
  { id: 'stb', name: 'South Texas Builders', logo: '/logos/stb.png' },
  { id: 'alto', name: 'Alto-Pro', logo: '/logos/alto.png' },
  { id: 'ranch', name: 'Ranch Land Group', logo: '/logos/ranch.png' },
]

export const companyById = (id?: string): Company | undefined =>
  COMPANIES.find((c) => c.id === id)
