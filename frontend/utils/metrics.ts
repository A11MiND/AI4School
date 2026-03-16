export const metricLabelMap: Record<string, string> = {
  LD: 'Lexical Density (LD)',
  TTR: 'Type-Token Ratio (TTR)',
  MSTTR: 'Mean Segmental TTR (MSTTR)',
  MLS: 'Mean Length of Sentence (MLS)',
  MLT: 'Mean Length of T-unit (MLT)',
  'C/S': 'Clause per Sentence (C/S)',
  Temporal_token_density: 'Temporal Cohesion Density',
  Expansion_token_density: 'Expansion Cohesion Density',
  Comparison_token_density: 'Comparison Cohesion Density',
};

export const selectedMetricKeys = [
  'LD',
  'TTR',
  'MSTTR',
  'MLS',
  'MLT',
  'C/S',
  'Temporal_token_density',
  'Expansion_token_density',
  'Comparison_token_density',
];

export function toFriendlyMetricLabel(key: string): string {
  if (metricLabelMap[key]) return metricLabelMap[key];
  return key.replace(/_/g, ' ');
}