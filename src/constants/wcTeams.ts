export type WcTeam = {
  code: string;
  name: string;
  short: string;
  group: string;
  flag: string;
  bg: string;
  tx: string;
};

export const TEAMS: WcTeam[] = [
  { code: 'MEX', name: 'Mexico', short: 'Mexico', group: 'A', flag: '🇲🇽', bg: '#006847', tx: '#fff' },
  { code: 'RSA', name: 'South Africa', short: 'S. Africa', group: 'A', flag: '🇿🇦', bg: '#007749', tx: '#fff' },
  { code: 'KOR', name: 'South Korea', short: 'S. Korea', group: 'A', flag: '🇰🇷', bg: '#003478', tx: '#fff' },
  { code: 'CZE', name: 'Czech Republic', short: 'Czech Rep.', group: 'A', flag: '🇨🇿', bg: '#11457E', tx: '#fff' },
  { code: 'CAN', name: 'Canada', short: 'Canada', group: 'B', flag: '🇨🇦', bg: '#D52B1E', tx: '#fff' },
  { code: 'BIH', name: 'Bosnia & Herz.', short: 'Bosnia', group: 'B', flag: '🇧🇦', bg: '#002F6C', tx: '#fff' },
  { code: 'QAT', name: 'Qatar', short: 'Qatar', group: 'B', flag: '🇶🇦', bg: '#8A1538', tx: '#fff' },
  { code: 'SUI', name: 'Switzerland', short: 'Switzerland', group: 'B', flag: '🇨🇭', bg: '#D52B1E', tx: '#fff' },
  { code: 'BRA', name: 'Brazil', short: 'Brazil', group: 'C', flag: '🇧🇷', bg: '#009C3B', tx: '#FEDF00' },
  { code: 'MAR', name: 'Morocco', short: 'Morocco', group: 'C', flag: '🇲🇦', bg: '#C1272D', tx: '#fff' },
  { code: 'HAI', name: 'Haiti', short: 'Haiti', group: 'C', flag: '🇭🇹', bg: '#00209F', tx: '#fff' },
  { code: 'SCO', name: 'Scotland', short: 'Scotland', group: 'C', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', bg: '#0065BD', tx: '#fff' },
  { code: 'USA', name: 'United States', short: 'USA', group: 'D', flag: '🇺🇸', bg: '#3C3B6E', tx: '#fff' },
  { code: 'PAR', name: 'Paraguay', short: 'Paraguay', group: 'D', flag: '🇵🇾', bg: '#DA121A', tx: '#fff' },
  { code: 'AUS', name: 'Australia', short: 'Australia', group: 'D', flag: '🇦🇺', bg: '#00843D', tx: '#FEDD00' },
  { code: 'TUR', name: 'Turkey', short: 'Turkey', group: 'D', flag: '🇹🇷', bg: '#E30A17', tx: '#fff' },
  { code: 'GER', name: 'Germany', short: 'Germany', group: 'E', flag: '🇩🇪', bg: '#1a1a1a', tx: '#FFCE00' },
  { code: 'CUW', name: 'Curaçao', short: 'Curaçao', group: 'E', flag: '🇨🇼', bg: '#002B7F', tx: '#fff' },
  { code: 'CIV', name: 'Ivory Coast', short: 'Ivory Coast', group: 'E', flag: '🇨🇮', bg: '#F77F00', tx: '#fff' },
  { code: 'ECU', name: 'Ecuador', short: 'Ecuador', group: 'E', flag: '🇪🇨', bg: '#FFD100', tx: '#003893' },
  { code: 'NED', name: 'Netherlands', short: 'Netherl.', group: 'F', flag: '🇳🇱', bg: '#FF6C00', tx: '#fff' },
  { code: 'JPN', name: 'Japan', short: 'Japan', group: 'F', flag: '🇯🇵', bg: '#BC002D', tx: '#fff' },
  { code: 'SWE', name: 'Sweden', short: 'Sweden', group: 'F', flag: '🇸🇪', bg: '#005293', tx: '#FECC00' },
  { code: 'TUN', name: 'Tunisia', short: 'Tunisia', group: 'F', flag: '🇹🇳', bg: '#E70013', tx: '#fff' },
  { code: 'BEL', name: 'Belgium', short: 'Belgium', group: 'G', flag: '🇧🇪', bg: '#ED2939', tx: '#FAE042' },
  { code: 'EGY', name: 'Egypt', short: 'Egypt', group: 'G', flag: '🇪🇬', bg: '#CE1126', tx: '#fff' },
  { code: 'IRN', name: 'Iran', short: 'Iran', group: 'G', flag: '🇮🇷', bg: '#239F40', tx: '#fff' },
  { code: 'NZL', name: 'New Zealand', short: 'N. Zealand', group: 'G', flag: '🇳🇿', bg: '#1a1a1a', tx: '#fff' },
  { code: 'ESP', name: 'Spain', short: 'Spain', group: 'H', flag: '🇪🇸', bg: '#C60B1E', tx: '#FFC400' },
  { code: 'CPV', name: 'Cape Verde', short: 'C. Verde', group: 'H', flag: '🇨🇻', bg: '#003893', tx: '#fff' },
  { code: 'KSA', name: 'Saudi Arabia', short: 'S. Arabia', group: 'H', flag: '🇸🇦', bg: '#006C35', tx: '#fff' },
  { code: 'URU', name: 'Uruguay', short: 'Uruguay', group: 'H', flag: '🇺🇾', bg: '#7B9DD7', tx: '#1a1a1a' },
  { code: 'FRA', name: 'France', short: 'France', group: 'I', flag: '🇫🇷', bg: '#002395', tx: '#fff' },
  { code: 'SEN', name: 'Senegal', short: 'Senegal', group: 'I', flag: '🇸🇳', bg: '#00853F', tx: '#fff' },
  { code: 'IRQ', name: 'Iraq', short: 'Iraq', group: 'I', flag: '🇮🇶', bg: '#CE1126', tx: '#fff' },
  { code: 'NOR', name: 'Norway', short: 'Norway', group: 'I', flag: '🇳🇴', bg: '#BA0C2F', tx: '#fff' },
  { code: 'ARG', name: 'Argentina', short: 'Argentina', group: 'J', flag: '🇦🇷', bg: '#74ACDF', tx: '#fff' },
  { code: 'ALG', name: 'Algeria', short: 'Algeria', group: 'J', flag: '🇩🇿', bg: '#006233', tx: '#fff' },
  { code: 'AUT', name: 'Austria', short: 'Austria', group: 'J', flag: '🇦🇹', bg: '#ED2939', tx: '#fff' },
  { code: 'JOR', name: 'Jordan', short: 'Jordan', group: 'J', flag: '🇯🇴', bg: '#007A3D', tx: '#fff' },
  { code: 'POR', name: 'Portugal', short: 'Portugal', group: 'K', flag: '🇵🇹', bg: '#006600', tx: '#FF0000' },
  { code: 'COD', name: 'DR Congo', short: 'DR Congo', group: 'K', flag: '🇨🇩', bg: '#007FFF', tx: '#FFD100' },
  { code: 'UZB', name: 'Uzbekistan', short: 'Uzbekistan', group: 'K', flag: '🇺🇿', bg: '#1EB53A', tx: '#fff' },
  { code: 'COL', name: 'Colombia', short: 'Colombia', group: 'K', flag: '🇨🇴', bg: '#FFCD00', tx: '#003893' },
  { code: 'ENG', name: 'England', short: 'England', group: 'L', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', bg: '#CE1124', tx: '#fff' },
  { code: 'CRO', name: 'Croatia', short: 'Croatia', group: 'L', flag: '🇭🇷', bg: '#171796', tx: '#fff' },
  { code: 'GHA', name: 'Ghana', short: 'Ghana', group: 'L', flag: '🇬🇭', bg: '#006B3F', tx: '#FFD700' },
  { code: 'PAN', name: 'Panama', short: 'Panama', group: 'L', flag: '🇵🇦', bg: '#005AA7', tx: '#fff' },
];

export const teamByCode = (code: string) => TEAMS.find((t) => t.code === code);

export const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;
