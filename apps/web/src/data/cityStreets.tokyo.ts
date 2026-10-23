// ============================================
// Dispatch HQ — Tokyo City Streets
// ============================================
// Real Tokyo streets, landmarks, and district names for radio dialogue.
// Each zone pool feeds the radio dialogue engine and mission cards.

export interface TokyoZoneData {
  streets: string[];
  landmarks: string[];
  districts: string[];
}

export const TOKYO_STREETS: Record<string, TokyoZoneData> = {
  // ── Central / Chiyoda / Chūō ──
  downtown: {
    streets: [
      'Chūō-dōri', 'Harumi-dōri', 'Ebisu-dōri', 'Showa-dōri',
      'Uchibori-dōri', 'Hōsei-dōri', 'Takebashi-dōri', 'Nijūbashidōri',
      'Ginza-dōri', 'Chūō-dōri', 'Yūrakuchō-dōri', 'Marunouchi-naka-dōri',
      'Hibiya-dōri', 'Kasumigaseki-dōri', 'Uchisaiwaichō-dōri',
    ],
    landmarks: [
      'Tokyo Station', 'Imperial Palace', 'Ginza', 'Yūrakuchō',
      'Marunouchi', 'Nihonbashi', 'Kasumigaseki', 'Hibiya Park',
      'Tokyo International Forum', 'Tsukiji Outer Market',
    ],
    districts: ['Marunouchi', 'Ginza', 'Nihonbashi', 'Yaesu', 'Kasumigaseki', 'Hibiya'],
  },

  // ── Shinjuku / West ──
  west: {
    streets: [
      'Shinjuku-dōri', 'Yasukuni-dōri', 'Meiji-dōri', 'Kōshū-kaidō',
      'Ome-kaidō', 'Takadanobaba-dōri', 'Okubo-dōri', 'Yoyogi-dōri',
      'Sendagaya-dōri', 'Hatagaya-dōri', 'Sasazuka-dōri',
    ],
    landmarks: [
      'Shinjuku Station', 'Tokyo Metropolitan Government Building',
      'Kabukichō', 'Nishi-Shinjuku', 'Shinjuku Gyoen', 'Meiji Shrine',
      'Yoyogi Park', 'Takadanobaba', 'Waseda University',
    ],
    districts: ['Shinjuku', 'Nishi-Shinjuku', 'Takadanobaba', 'Okubo', 'Yoyogi', 'Sendagaya'],
  },

  // ── Shibuya / South-West ──
  south_west: {
    streets: [
      'Shibuya-dōri', 'Meiji-dōri', 'Aoyama-dōri', 'Dōgenzaka',
      'Udagawa-chō', 'Inokashira-dōri', 'Shōten-dōri', 'Sakuragaoka-chō',
      'Harajuku-dōri', 'Omotesandō', 'Aoyama-kōtō',
    ],
    landmarks: [
      'Shibuya Crossing', 'Shibuya 109', 'Harajuku', 'Takeshita-dōri',
      'Omotesandō', 'Meiji Shrine', 'Yoyogi Park', 'Cat Street',
      'Daikanyama', 'Nakameguro', 'Ebisu',
    ],
    districts: ['Shibuya', 'Harajuku', 'Omotesandō', 'Daikanyama', 'Nakameguro', 'Ebisu'],
  },

  // ── Taitō / Ueno / North-East ──
  east: {
    streets: [
      'Kaminarimon-dōri', 'Asakusa-dōri', 'Shin-dōri', 'Kitanomaru-kōen',
      'Ueno-sakuragi-dōri', 'Park-dōri', 'Hanayakushi-dōri',
      'Kuramae-dōri', 'Komagata-dōri', 'Yanaka-dōri',
    ],
    landmarks: [
      'Sensō-ji', 'Kaminarimon', 'Asakusa', 'Ueno Park',
      'Tokyo National Museum', 'Ameya-Yokochō', 'Kuramae',
      'Yanaka', 'Sendagi', 'Nippori',
    ],
    districts: ['Asakusa', 'Ueno', 'Kuramae', 'Yanaka', 'Nippori', 'Taitō'],
  },

  // ── Minato / Roppongi / South ──
  south: {
    streets: [
      'Roppongi-dōri', 'Kūkō-dōri', 'Daimon-dōri', 'Tōkaidō',
      'Azabu-dōri', 'Jingūmae-dōri', 'Aoyama-dōri', 'Shibaura-dōri',
      'Kaigan-dōri', 'Ariake-dōri',
    ],
    landmarks: [
      'Roppongi Hills', 'Tokyo Tower', 'Azabu-Jūban', 'Shibaura',
      'Odaiba', 'Rainbow Bridge', 'Ariake', 'Toyosu Market',
      'Zōjō-ji', 'Shiba Park',
    ],
    districts: ['Roppongi', 'Azabu', 'Shibaura', 'Odaiba', 'Ariake', 'Toyosu'],
  },

  // ── Bunkyō / Kōrakuen / North-Central ──
  north: {
    streets: [
      'Kasuga-dōri', 'Kōrakuen-dōri', 'Hakusan-dōri', 'Meiji-jingūmae',
      'Sendagi-dōri', 'Sakuga-dōri', 'Negishi-dōri', 'Honkomagome',
    ],
    landmarks: [
      'Tokyo Dome', 'Kōrakuen', 'Bunkyō', 'Suidōbashi',
      'Myōgadani', 'Sugamo', 'Komagome', 'Gokoku-ji',
    ],
    districts: ['Bunkyō', 'Kōrakuen', 'Sugamo', 'Komagome', 'Myōgadani'],
  },
};
