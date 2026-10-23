// ============================================
// Dispatch HQ — Mission Generator
// ============================================

import type { Mission, MissionCategory, GeoPoint } from '@dispatch-hq/shared';

export interface MissionTemplate {
  name: string;
  description: string;
  category: MissionCategory;
  icon: string;
  baseCredits: number;
  baseXp: number;
  difficulty: number;
  estimatedDuration: number;
}

const MISSION_TEMPLATES: Record<string, MissionTemplate[]> = {
  fire: [
    { name: 'Structure Fire', description: 'A building fire has been reported. Multiple engines needed.', category: 'fire', icon: '🔥', baseCredits: 500, baseXp: 100, difficulty: 3, estimatedDuration: 300 },
    { name: 'Vehicle Fire', description: 'A vehicle is on fire on the highway.', category: 'fire', icon: '🚗', baseCredits: 200, baseXp: 50, difficulty: 1, estimatedDuration: 120 },
    { name: 'Wildfire Alert', description: 'A brush fire is spreading near residential areas.', category: 'fire', icon: '🌲', baseCredits: 800, baseXp: 150, difficulty: 5, estimatedDuration: 600 },
    { name: 'Gas Leak', description: 'A gas leak has been reported in a commercial building.', category: 'hazmat', icon: '⚠️', baseCredits: 600, baseXp: 120, difficulty: 4, estimatedDuration: 240 },
  ],
  police: [
    { name: 'Robbery in Progress', description: 'Armed robbery reported at a local business.', category: 'police', icon: '🔫', baseCredits: 400, baseXp: 80, difficulty: 4, estimatedDuration: 180 },
    { name: 'Domestic Disturbance', description: 'A domestic disturbance call requires officer response.', category: 'police', icon: '🏠', baseCredits: 150, baseXp: 30, difficulty: 2, estimatedDuration: 90 },
    { name: 'Traffic Stop', description: 'A routine traffic stop has escalated.', category: 'traffic', icon: '🚦', baseCredits: 100, baseXp: 20, difficulty: 1, estimatedDuration: 60 },
    { name: 'Pursuit', description: 'A high-speed pursuit is in progress. Backup requested.', category: 'police', icon: '🚨', baseCredits: 600, baseXp: 120, difficulty: 5, estimatedDuration: 240 },
  ],
  ems: [
    { name: 'Cardiac Arrest', description: 'A citizen is experiencing cardiac arrest. EMS needed immediately.', category: 'ems', icon: '❤️', baseCredits: 300, baseXp: 60, difficulty: 3, estimatedDuration: 180 },
    { name: 'Vehicle Accident', description: 'A multi-vehicle accident with injuries reported.', category: 'rescue', icon: '🚑', baseCredits: 400, baseXp: 80, difficulty: 3, estimatedDuration: 240 },
    { name: 'Overdose', description: 'A suspected overdose requires immediate medical attention.', category: 'ems', icon: '💊', baseCredits: 250, baseXp: 50, difficulty: 2, estimatedDuration: 120 },
    { name: 'Mass Casualty', description: 'A mass casualty incident has been declared. All available units respond.', category: 'ems', icon: '🏥', baseCredits: 1000, baseXp: 200, difficulty: 5, estimatedDuration: 600 },
  ],
};

const CROSS_SERVICE_RESPONSES: Record<string, string[]> = {
  fire: ['police', 'ems'],
  police: ['fire', 'ems'],
  ems: ['fire', 'police'],
};

export function generateMission(cityBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }, service: string): Mission | null {
  const templates = MISSION_TEMPLATES[service] || MISSION_TEMPLATES.fire;
  const template = templates[Math.floor(Math.random() * templates.length)];

  const location: GeoPoint = {
    lat: cityBounds.minLat + Math.random() * (cityBounds.maxLat - cityBounds.minLat),
    lng: cityBounds.minLng + Math.random() * (cityBounds.maxLng - cityBounds.minLng),
  };

  const now = Date.now();
  const duration = template.estimatedDuration * 1000;

  return {
    id: `mission-${now}-${Math.random().toString(36).slice(2, 8)}`,
    templateId: template.name.toLowerCase().replace(/\s+/g, '-'),
    name: template.name,
    description: template.description,
    category: template.category,
    icon: template.icon,
    status: 'generated',
    location,
    poiType: null,
    difficulty: template.difficulty,
    creditsReward: template.baseCredits + Math.floor(Math.random() * 100),
    xpReward: template.baseXp + Math.floor(Math.random() * 20),
    requirements: [],
    assignedUnits: [],
    progress: 0,
    timeRemaining: duration / 1000,
    totalTime: duration / 1000,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + duration).toISOString(),
  };
}

export function generateCrossServiceResponse(
  mission: Mission,
  addMission: (mission: Mission) => void
): void {
  const supportingServices = CROSS_SERVICE_RESPONSES[mission.category] || [];
  if (supportingServices.length === 0) return;

  // 30% chance of a cross-service response being triggered
  if (Math.random() > 0.3) return;

  const supportService = supportingServices[Math.floor(Math.random() * supportingServices.length)];
  const templates = MISSION_TEMPLATES[supportService] || [];

  if (templates.length === 0) return;

  const template = templates[Math.floor(Math.random() * templates.length)];

  const now = Date.now();
  const supportMission: Mission = {
    id: `support-${now}-${Math.random().toString(36).slice(2, 8)}`,
    templateId: template.name.toLowerCase().replace(/\s+/g, '-'),
    name: `[Support] ${template.name}`,
    description: `${template.description} (Supporting ${mission.category} incident: ${mission.name})`,
    category: template.category,
    icon: template.icon,
    status: 'generated',
    location: mission.location,
    poiType: null,
    difficulty: template.difficulty,
    creditsReward: Math.floor(template.baseCredits * 0.5),
    xpReward: Math.floor(template.baseXp * 0.5),
    requirements: [],
    assignedUnits: [],
    progress: 0,
    timeRemaining: template.estimatedDuration,
    totalTime: template.estimatedDuration,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + template.estimatedDuration * 1000).toISOString(),
  };

  addMission(supportMission);
}