// ============================================
// Dispatch HQ — Mission Constants
// ============================================

import { MissionTemplate, MissionCategory, MissionPriority } from '../types/mission';
import type { ServiceType } from '../types/station';

export const FIRE_MISSIONS: MissionTemplate[] = [
  {
    id: 'bin_fire',
    spawnWeight: 1.0,
    name: 'Bin Fire',
    description: 'A waste bin is on fire',
    category: 'fire',
    icon: '🔥',
    baseCredits: 110,
    baseXp: 20,
    difficulty: 1,
    requirements: [{ unitType: 'engine', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 60,
    poiTypes: ['residential', 'commercial', 'park'],
  },
  {
    id: 'container_fire',
    spawnWeight: 0.8,
    name: 'Container Fire',
    description: 'A shipping container is on fire',
    category: 'fire',
    icon: '🔥',
    baseCredits: 170,
    baseXp: 30,
    difficulty: 2,
    requirements: [{ unitType: 'engine', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 90,
    poiTypes: ['industrial', 'cargo_port'],
  },
  {
    id: 'burning_car',
    spawnWeight: 1.0,
    name: 'Burning Car',
    description: 'A vehicle is fully engulfed in flames',
    category: 'fire',
    icon: '🚗',
    baseCredits: 370,
    baseXp: 60,
    difficulty: 3,
    requirements: [{ unitType: 'engine', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 120,
    poiTypes: ['road', 'parking', 'highway'],
  },
  {
    id: 'room_fire',
    spawnWeight: 1.2,
    name: 'Room Fire',
    description: 'A room in a building is on fire',
    category: 'fire',
    icon: '🏠',
    baseCredits: 1400,
    baseXp: 200,
    difficulty: 5,
    requirements: [
      { unitType: 'engine', count: 2, minTrainingLevel: 1 },
    ],
    estimatedDuration: 300,
    poiTypes: ['residential', 'commercial'],
  },
  {
    id: 'garage_fire',
    spawnWeight: 0.9,
    name: 'Garage Fire',
    description: 'A garage structure is on fire',
    category: 'fire',
    icon: '🏚️',
    baseCredits: 1700,
    baseXp: 240,
    difficulty: 6,
    requirements: [
      { unitType: 'engine', count: 4, minTrainingLevel: 1 },
    ],
    estimatedDuration: 360,
    poiTypes: ['residential'],
  },
  {
    id: 'gas_leak',
    spawnWeight: 0.9,
    name: 'Gas Leak',
    description: 'Reported gas leak in a building',
    category: 'fire',
    icon: '⚠️',
    baseCredits: 400,
    baseXp: 70,
    difficulty: 4,
    requirements: [{ unitType: 'engine', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 180,
    poiTypes: ['residential', 'commercial', 'industrial'],
  },
  {
    id: 'kitchen_fire',
    spawnWeight: 1.0,
    name: 'Kitchen Fire',
    description: 'Kitchen fire at a restaurant or commercial kitchen',
    category: 'fire',
    icon: '🍳',
    baseCredits: 400,
    baseXp: 60,
    difficulty: 3,
    requirements: [{ unitType: 'engine', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 150,
    poiTypes: ['commercial', 'retail'],
  },
  {
    id: 'chimney_fire',
    spawnWeight: 0.9,
    name: 'Chimney Fire',
    description: 'Creosote buildup in a chimney has ignited',
    category: 'fire',
    icon: '🔥',
    baseCredits: 390,
    baseXp: 55,
    difficulty: 3,
    requirements: [{ unitType: 'engine', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 150,
    poiTypes: ['residential'],
  },
  {
    id: 'fuel_spill',
    spawnWeight: 0.9,
    name: 'Fuel Spill',
    description: 'Fuel spill on the forecourt of a gas station',
    category: 'fire',
    icon: '⛽',
    baseCredits: 180,
    baseXp: 30,
    difficulty: 2,
    requirements: [{ unitType: 'engine', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 90,
    poiTypes: ['road', 'commercial', 'retail'],
  },
  {
    id: 'warehouse_fire',
    spawnWeight: 0.8,
    name: 'Warehouse Fire',
    description: 'Major fire in a warehouse facility',
    category: 'fire',
    icon: '🏭',
    baseCredits: 10000,
    baseXp: 1500,
    difficulty: 10,
    requirements: [
      { unitType: 'engine', count: 20, minTrainingLevel: 2 },
    ],
    estimatedDuration: 900,
    poiTypes: ['warehouse', 'industrial'],
  },
  {
    id: 'factory_fire',
    spawnWeight: 0.6,
    name: 'Factory Fire',
    description: 'Fire in a manufacturing facility',
    category: 'fire',
    icon: '🏗️',
    baseCredits: 2000,
    baseXp: 350,
    difficulty: 7,
    requirements: [
      { unitType: 'engine', count: 8, minTrainingLevel: 1 },
    ],
    estimatedDuration: 600,
    poiTypes: ['factory', 'industrial'],
  },
  {
    id: 'vehicle_accident',
    spawnWeight: 1.1,
    name: 'Vehicle Accident',
    description: 'Multi-vehicle collision on the road',
    category: 'traffic',
    icon: '💥',
    baseCredits: 1000,
    baseXp: 150,
    difficulty: 5,
    requirements: [
      { unitType: 'engine', count: 3, minTrainingLevel: 1 },
    ],
    estimatedDuration: 240,
    poiTypes: ['road', 'highway', 'intersection'],
  },
  {
    id: 'building_collapse',
    spawnWeight: 0.35,
    name: 'Building Collapse',
    description: 'Partial structural collapse',
    category: 'rescue',
    icon: '🏚️',
    baseCredits: 7300,
    baseXp: 1000,
    difficulty: 9,
    requirements: [
      { unitType: 'engine', count: 5, minTrainingLevel: 2 },
      { unitType: 'rescue', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 1200,
    poiTypes: ['commercial', 'residential', 'industrial'],
  },
  {
    id: 'high_rise_fire',
    spawnWeight: 0.4,
    name: 'High-Rise Fire',
    description: 'Fire in a tall building',
    category: 'fire',
    icon: '🏢',
    baseCredits: 4000,
    baseXp: 600,
    difficulty: 8,
    requirements: [
      { unitType: 'engine', count: 13, minTrainingLevel: 2 },
      { unitType: 'ladder', count: 2, minTrainingLevel: 1 },
    ],
    estimatedDuration: 900,
    poiTypes: ['high_rise', 'commercial'],
  },
  {
    id: 'wildfire',
    spawnWeight: 0.35,
    name: 'Brush Fire',
    description: 'Wildfire spreading through vegetation',
    category: 'fire',
    icon: '🌿',
    baseCredits: 450,
    baseXp: 85,
    difficulty: 4,
    requirements: [
      { unitType: 'engine', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 300,
    poiTypes: ['forest', 'park', 'rural'],
  },
  {
    id: 'multi_alarm_fire',
    spawnWeight: 0.3,
    name: 'Multi-Alarm Fire',
    description: 'A fast-moving fire requiring command-level coordination',
    category: 'fire',
    icon: '🚨',
    baseCredits: 5200,
    baseXp: 750,
    difficulty: 9,
    requirements: [
      { unitType: 'engine', count: 2, minTrainingLevel: 2 },
      { unitType: 'battalion_chief', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 900,
    poiTypes: ['commercial', 'industrial', 'high_rise'],
  },
  {
    id: 'brush_fire',
    spawnWeight: 0.8,
    name: 'Brush Fire',
    description: 'Dry brush is burning at the city edge, threatening nearby homes',
    category: 'fire',
    icon: '🔥',
    baseCredits: 425,
    baseXp: 85,
    difficulty: 4,
    requirements: [{ unitType: 'engine', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 300,
    poiTypes: ['park', 'road', 'residential'],
  },
];

// Police Missions
export const POLICE_MISSIONS: MissionTemplate[] = [
  {
    id: 'theft_in_progress',
    spawnWeight: 1.0,
    name: 'Theft in Progress',
    description: 'Shoplifting or burglary in progress',
    category: 'police',
    icon: '🚨',
    baseCredits: 105,
    baseXp: 20,
    difficulty: 1,
    requirements: [{ unitType: 'patrol_car', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 60,
    poiTypes: ['commercial', 'retail'],
  },
  {
    id: 'traffic_violation',
    spawnWeight: 1.1,
    name: 'Traffic Violation',
    description: 'Reckless driving reported',
    category: 'traffic',
    icon: '🚦',
    baseCredits: 80,
    baseXp: 15,
    difficulty: 1,
    requirements: [{ unitType: 'patrol_car', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 45,
    poiTypes: ['road', 'highway'],
  },
  {
    id: 'traffic_stop',
    spawnWeight: 1.0,
    name: 'Traffic Stop',
    description: 'Officer-initiated stop on a moving violation',
    category: 'traffic',
    icon: '🛑',
    baseCredits: 75,
    baseXp: 15,
    difficulty: 1,
    requirements: [{ unitType: 'patrol_car', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 40,
    poiTypes: ['road', 'highway', 'intersection'],
  },
  {
    id: 'speeding_vehicle',
    spawnWeight: 1.0,
    name: 'Speeding Vehicle',
    description: 'Radar hit on a vehicle exceeding the limit',
    category: 'traffic',
    icon: '🏎️',
    baseCredits: 90,
    baseXp: 15,
    difficulty: 1,
    requirements: [{ unitType: 'patrol_car', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 45,
    poiTypes: ['road', 'highway'],
  },
  {
    id: 'dui_checkpoint',
    spawnWeight: 0.7,
    name: 'DUI Checkpoint',
    description: 'Possible impaired driver stopped in traffic',
    category: 'traffic',
    icon: '🍺',
    baseCredits: 210,
    baseXp: 40,
    difficulty: 2,
    requirements: [{ unitType: 'patrol_car', count: 2, minTrainingLevel: 1 }],
    estimatedDuration: 120,
    poiTypes: ['road', 'intersection'],
  },
  {
    id: 'signal_malfunction',
    spawnWeight: 0.8,
    name: 'Signal Malfunction',
    description: 'Traffic lights are out at a busy intersection',
    category: 'traffic',
    icon: '🚥',
    baseCredits: 155,
    baseXp: 30,
    difficulty: 2,
    requirements: [{ unitType: 'patrol_car', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 90,
    poiTypes: ['intersection'],
  },
  {
    id: 'school_zone_speeding',
    spawnWeight: 0.8,
    name: 'School Zone Speeding',
    description: 'Speeding reported near a school crossing',
    category: 'traffic',
    icon: '🏫',
    baseCredits: 100,
    baseXp: 20,
    difficulty: 1,
    requirements: [{ unitType: 'patrol_car', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 50,
    poiTypes: ['school', 'road'],
  },
  {
    id: 'noise_complaint',
    spawnWeight: 1.2,
    name: 'Noise Complaint',
    description: 'Residents report loud music late at night',
    category: 'police',
    icon: '📢',
    baseCredits: 90,
    baseXp: 18,
    difficulty: 1,
    requirements: [{ unitType: 'patrol_car', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 45,
    poiTypes: ['residential'],
  },
  {
    id: 'school_disturbance',
    spawnWeight: 0.8,
    name: 'School Disturbance',
    description: 'Disturbance reported at a school — officers requested',
    category: 'police',
    icon: '🏫',
    baseCredits: 180,
    baseXp: 35,
    difficulty: 2,
    requirements: [{ unitType: 'patrol_car', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 90,
    poiTypes: ['school', 'public'],
  },
  {
    id: 'government_threat',
    spawnWeight: 0.5,
    name: 'Government Threat',
    description: 'Threat reported at a government building',
    category: 'police',
    icon: '🏛️',
    baseCredits: 320,
    baseXp: 60,
    difficulty: 4,
    requirements: [{ unitType: 'patrol_car', count: 2, minTrainingLevel: 1 }],
    estimatedDuration: 180,
    poiTypes: ['public', 'commercial', 'high_rise'],
  },
  {
    id: 'domestic_dispute',
    spawnWeight: 1.2,
    name: 'Domestic Dispute',
    description: 'Noise and disturbance reported at residence',
    category: 'police',
    icon: '🏠',
    baseCredits: 200,
    baseXp: 40,
    difficulty: 3,
    requirements: [{ unitType: 'patrol_car', count: 2, minTrainingLevel: 1 }],
    estimatedDuration: 120,
    poiTypes: ['residential'],
  },
  {
    id: 'suspicious_package',
    spawnWeight: 0.6,
    name: 'Suspicious Package',
    description: 'A caller reports an unattended package',
    category: 'police',
    icon: '📦',
    baseCredits: 240,
    baseXp: 45,
    difficulty: 3,
    requirements: [{ unitType: 'patrol_car', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 120,
    poiTypes: ['public', 'commercial'],
  },
  {
    id: 'robbery',
    spawnWeight: 0.9,
    name: 'Armed Robbery',
    description: 'Armed robbery at a business',
    category: 'police',
    icon: '💰',
    baseCredits: 500,
    baseXp: 100,
    difficulty: 6,
    requirements: [
      { unitType: 'patrol_car', count: 2, minTrainingLevel: 1 },
      { unitType: 'swat_van', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 240,
    poiTypes: ['commercial', 'bank', 'retail'],
  },
  {
    id: 'hostage_situation',
    spawnWeight: 0.04,
    name: 'Hostage Situation',
    description: 'Active hostage situation',
    category: 'police',
    icon: '🆘',
    baseCredits: 2000,
    baseXp: 400,
    difficulty: 9,
    requirements: [
      { unitType: 'patrol_car', count: 3, minTrainingLevel: 2 },
      { unitType: 'swat_van', count: 2, minTrainingLevel: 1 },
    ],
    estimatedDuration: 600,
    poiTypes: ['commercial', 'residential'],
  },
  {
    id: 'missing_person',
    spawnWeight: 0.8,
    name: 'Missing Person',
    description: 'Missing vulnerable person',
    category: 'police',
    icon: '🔍',
    baseCredits: 300,
    baseXp: 60,
    difficulty: 4,
    requirements: [
      { unitType: 'patrol_car', count: 1, minTrainingLevel: 1 },
      { unitType: 'k9_unit', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 300,
    poiTypes: ['park', 'residential'],
  },
  {
    id: 'stolen_vehicle',
    spawnWeight: 1.0,
    name: 'Stolen Vehicle',
    description: 'A vehicle reported stolen is on the move',
    category: 'police',
    icon: '🚙',
    baseCredits: 280,
    baseXp: 50,
    difficulty: 3,
    requirements: [{ unitType: 'patrol_car', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 120,
    poiTypes: ['road', 'residential', 'commercial'],
  },
  {
    id: 'high_speed_pursuit',
    spawnWeight: 0.4,
    name: 'High-Speed Pursuit',
    description: 'A fleeing suspect in a high-performance vehicle',
    category: 'police',
    icon: '🏎️',
    baseCredits: 1400,
    baseXp: 260,
    difficulty: 7,
    requirements: [
      { unitType: 'patrol_car', count: 2, minTrainingLevel: 1 },
      { unitType: 'police_suv', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 300,
    poiTypes: ['road', 'highway', 'intersection'],
  },
  {
    id: 'barricade_situation',
    spawnWeight: 0.4,
    name: 'Barricade Situation',
    description: 'A subject has barricaded themselves inside',
    category: 'police',
    icon: '🚧',
    baseCredits: 1200,
    baseXp: 220,
    difficulty: 7,
    requirements: [
      { unitType: 'swat_van', count: 1, minTrainingLevel: 1 },
      { unitType: 'patrol_car', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 300,
    poiTypes: ['commercial', 'industrial', 'residential'],
  },
];

// EMS Missions
export const EMS_MISSIONS: MissionTemplate[] = [
  {
    id: 'medical_call',
    spawnWeight: 1.1,
    name: 'Medical Call',
    description: 'Person needs medical attention',
    category: 'ems',
    icon: '🩺',
    baseCredits: 100,
    baseXp: 20,
    difficulty: 1,
    requirements: [{ unitType: 'ambulance', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 60,
    poiTypes: ['residential', 'commercial'],
  },
  {
    id: 'cardiac_emergency',
    spawnWeight: 1.0,
    name: 'Cardiac Emergency',
    description: 'Heart attack reported',
    category: 'ems',
    icon: '❤️',
    baseCredits: 400,
    baseXp: 80,
    difficulty: 5,
    requirements: [{ unitType: 'paramedic_unit', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 180,
    poiTypes: ['residential', 'commercial', 'public'],
  },
  {
    id: 'car_crash_injury',
    spawnWeight: 1.0,
    name: 'Car Crash with Injuries',
    description: 'Vehicle accident with injuries',
    category: 'ems',
    icon: '🚑',
    baseCredits: 350,
    baseXp: 65,
    difficulty: 4,
    requirements: [
      { unitType: 'ambulance', count: 2, minTrainingLevel: 1 },
      { unitType: 'paramedic_unit', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 200,
    poiTypes: ['road', 'highway', 'intersection'],
  },
  {
    id: 'fall_rescue',
    spawnWeight: 0.9,
    name: 'Fall from Height',
    description: 'Person fallen from building',
    category: 'ems',
    icon: '🏢',
    baseCredits: 600,
    baseXp: 110,
    difficulty: 6,
    requirements: [
      { unitType: 'ambulance', count: 1, minTrainingLevel: 1 },
      { unitType: 'paramedic_unit', count: 1, minTrainingLevel: 1 },
      { unitType: 'fire_ambulance', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 300,
    poiTypes: ['high_rise', 'commercial'],
  },
  {
    id: 'multi_victim',
    spawnWeight: 0.3,
    name: 'Mass Casualty Incident',
    description: 'Multiple victims requiring triage',
    category: 'ems',
    icon: '🏥',
    baseCredits: 2500,
    baseXp: 500,
    difficulty: 10,
    requirements: [
      { unitType: 'ambulance', count: 6, minTrainingLevel: 2 },
      { unitType: 'paramedic_unit', count: 3, minTrainingLevel: 2 },
      { unitType: 'ems_supervisor', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 900,
    poiTypes: ['public', 'commercial'],
  },
  {
    id: 'bus_crash',
    spawnWeight: 0.3,
    name: 'Bus Crash',
    description: 'A city bus collision with multiple passengers injured',
    category: 'ems',
    icon: '🚌',
    baseCredits: 1300,
    baseXp: 240,
    difficulty: 7,
    requirements: [
      { unitType: 'ambulance', count: 2, minTrainingLevel: 1 },
      { unitType: 'paramedic_unit', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 360,
    poiTypes: ['road', 'intersection', 'public'],
  },
  {
    id: 'stroke_response',
    spawnWeight: 1.0,
    name: 'Stroke Response',
    description: 'Signs of a stroke — rapid transport needed',
    category: 'ems',
    icon: '🧠',
    baseCredits: 200,
    baseXp: 40,
    difficulty: 2,
    requirements: [{ unitType: 'ambulance', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 120,
    poiTypes: ['residential', 'commercial'],
  },
  {
    id: 'food_poisoning',
    spawnWeight: 0.8,
    name: 'Food Poisoning',
    description: 'Multiple diners report food poisoning at a restaurant',
    category: 'ems',
    icon: '🤢',
    baseCredits: 200,
    baseXp: 40,
    difficulty: 2,
    requirements: [{ unitType: 'ambulance', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 120,
    poiTypes: ['commercial', 'retail'],
  },
  {
    id: 'allergic_reaction',
    spawnWeight: 0.9,
    name: 'Allergic Reaction',
    description: 'Severe allergic reaction reported',
    category: 'ems',
    icon: '💉',
    baseCredits: 200,
    baseXp: 40,
    difficulty: 2,
    requirements: [{ unitType: 'ambulance', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 90,
    poiTypes: ['residential', 'commercial', 'public'],
  },
  {
    id: 'crowd_incident',
    spawnWeight: 0.5,
    name: 'Crowd Incident',
    description: 'Multiple injuries at a large gathering',
    category: 'ems',
    icon: '👥',
    baseCredits: 450,
    baseXp: 90,
    difficulty: 5,
    requirements: [
      { unitType: 'ambulance', count: 1, minTrainingLevel: 1 },
      { unitType: 'paramedic_unit', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 240,
    poiTypes: ['public', 'commercial', 'park'],
  },
  {
    id: 'overdose_response',
    spawnWeight: 0.9,
    name: 'Overdose Response',
    description: 'Suspected overdose — advanced care required',
    category: 'ems',
    icon: '💉',
    baseCredits: 320,
    baseXp: 60,
    difficulty: 3,
    requirements: [{ unitType: 'paramedic_unit', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 150,
    poiTypes: ['residential', 'commercial'],
  },
  {
    id: 'maternity_emergency',
    spawnWeight: 0.8,
    name: 'Maternity Emergency',
    description: 'Childbirth complications at home',
    category: 'ems',
    icon: '👶',
    baseCredits: 450,
    baseXp: 85,
    difficulty: 4,
    requirements: [
      { unitType: 'ambulance', count: 1, minTrainingLevel: 1 },
      { unitType: 'paramedic_unit', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 180,
    poiTypes: ['residential'],
  },
  {
    id: 'bicycle_accident',
    spawnWeight: 0.8,
    name: 'Bicycle Accident',
    description: 'A cyclist is down with injuries on a city street',
    category: 'ems',
    icon: '🚴',
    baseCredits: 400,
    baseXp: 75,
    difficulty: 4,
    requirements: [{ unitType: 'ambulance', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 150,
    poiTypes: ['road', 'park'],
  },
  {
    id: 'heatstroke_response',
    spawnWeight: 0.9,
    name: 'Heatstroke Response',
    description: 'Heat exhaustion during a heatwave',
    category: 'ems',
    icon: '☀️',
    baseCredits: 300,
    baseXp: 55,
    difficulty: 3,
    requirements: [{ unitType: 'ambulance', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 120,
    poiTypes: ['public', 'park', 'road'],
  },
  {
    id: 'school_emergency',
    spawnWeight: 0.5,
    name: 'School Emergency',
    description: 'Multiple students injured at a school event',
    category: 'ems',
    icon: '🏫',
    baseCredits: 800,
    baseXp: 150,
    difficulty: 6,
    requirements: [
      { unitType: 'ambulance', count: 2, minTrainingLevel: 1 },
      { unitType: 'paramedic_unit', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 300,
    poiTypes: ['school', 'public'],
  },
  {
    id: 'hazmat_medical',
    spawnWeight: 0.35,
    name: 'Hazmat Exposure',
    description: 'Workers exposed to hazardous material',
    category: 'hazmat',
    icon: '☣️',
    baseCredits: 1300,
    baseXp: 240,
    difficulty: 7,
    requirements: [
      { unitType: 'rescue', count: 1, minTrainingLevel: 1 },
      { unitType: 'ambulance', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 360,
    poiTypes: ['industrial', 'warehouse'],
  },
  // ── Airlift-capable EMS missions (v0.22.13) ──────────────────────────────
  // Difficulty ≥ 6 → buildPatientFromMission marks the victim CRITICAL, and a
  // critical patient airlifts to the commander's helipad when one is built.
  // These two give the air-ambulance layer its own call volume instead of
  // relying on rare high-difficulty rolls from the general pool.
  {
    id: 'remote_rescue_airlift',
    spawnWeight: 0.6,
    name: 'Remote Rescue',
    description: 'Victim injured in hard-to-reach terrain — airlift extraction advised',
    category: 'ems',
    icon: '🚁',
    baseCredits: 700,
    baseXp: 130,
    difficulty: 6,
    requirements: [
      { unitType: 'paramedic_unit', count: 1, minTrainingLevel: 1 },
      { unitType: 'ambulance', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 300,
    poiTypes: ['park', 'forest', 'industrial'],
  },
  {
    id: 'highway_trauma_airlift',
    spawnWeight: 0.5,
    name: 'Highway Trauma',
    description: 'Critical multi-vehicle crash — air ambulance on standby for the worst victim',
    category: 'ems',
    icon: '🛣️',
    baseCredits: 1300,
    baseXp: 240,
    difficulty: 7,
    requirements: [
      { unitType: 'ambulance', count: 2, minTrainingLevel: 1 },
      { unitType: 'paramedic_unit', count: 1, minTrainingLevel: 1 },
    ],
    estimatedDuration: 360,
    poiTypes: ['road', 'highway', 'intersection'],
  },
  {
    id: 'water_rescue',
    spawnWeight: 0.7,
    name: 'Water Rescue',
    description: 'A swimmer is in distress in the river, swept downstream',
    category: 'ems',
    icon: '🌊',
    baseCredits: 425,
    baseXp: 100,
    difficulty: 5,
    requirements: [{ unitType: 'ambulance', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 240,
    poiTypes: ['park', 'road'],
  },
];

// ── Disaster recovery templates ────────────────────────────────────────────
// Post-disaster restoration calls (damage assessment, displaced residents,
// debris clearing). Kept OUT of the service pools with spawnWeight 0 so they
// never appear organically — they are selected explicitly by the aftermath
// wave (apps/web/src/lib/disasters.ts → spawnRecoveryWave) after a disaster
// window closes. Payouts are deliberately modest: the emergency is over, the
// city is just putting itself back together.

export const RECOVERY_TEMPLATES: MissionTemplate[] = [
  {
    id: 'recovery_assessment',
    spawnWeight: 0,
    name: 'Damage Assessment',
    description: 'Structures in the affected zone need safety checks',
    category: 'police',
    icon: '📋',
    baseCredits: 250,
    baseXp: 45,
    difficulty: 2,
    requirements: [{ unitType: 'patrol_car', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 150,
    poiTypes: ['residential', 'commercial'],
  },
  {
    id: 'recovery_relocation',
    spawnWeight: 0,
    name: 'Displaced Residents',
    description: 'Residents need medical check and transport to shelter',
    category: 'ems',
    icon: '🏘️',
    baseCredits: 220,
    baseXp: 40,
    difficulty: 2,
    requirements: [{ unitType: 'ambulance', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 150,
    poiTypes: ['residential', 'public'],
  },
  {
    id: 'recovery_debris',
    spawnWeight: 0,
    name: 'Debris Clearing',
    description: 'Roadways blocked by storm debris need clearing',
    category: 'fire',
    icon: '🧹',
    baseCredits: 260,
    baseXp: 45,
    difficulty: 2,
    requirements: [{ unitType: 'engine', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 150,
    poiTypes: ['residential', 'park'],
  },
];

// ── Field-activity templates (police) ─────────────────────────────────────
// Officer-initiated incidents — high-speed pursuits and warrant services —
// that patrolling units can escalate into real missions. Kept OFF the organic
// pools (spawnWeight 0) so they never appear on the board randomly; they are
// selected explicitly by the field-activity system
// (apps/web/src/lib/fieldActivities.ts → buildMission with opts.template).

export const FIELD_ACTIVITY_TEMPLATES: MissionTemplate[] = [
  {
    id: 'police_pursuit',
    spawnWeight: 0,
    name: 'High-Speed Pursuit',
    description: 'A fleeing vehicle is refusing to stop. Backup requested.',
    category: 'police',
    icon: '🏎️',
    baseCredits: 260,
    baseXp: 55,
    difficulty: 3,
    requirements: [{ unitType: 'patrol_car', count: 2, minTrainingLevel: 1 }],
    estimatedDuration: 150,
    poiTypes: ['road', 'highway', 'intersection'],
  },
  {
    id: 'warrant_service',
    spawnWeight: 0,
    name: 'Warrant Service',
    description: 'Records show an active warrant. Locate and take the subject into custody.',
    category: 'police',
    icon: '📋',
    baseCredits: 130,
    baseXp: 28,
    difficulty: 2,
    requirements: [{ unitType: 'patrol_car', count: 1, minTrainingLevel: 1 }],
    estimatedDuration: 90,
    poiTypes: ['residential', 'commercial'],
  },
];

export const MISSION_SPAWN_CONFIG = {
  urbanRate: 30,
  suburbanRate: 120,
  ruralRate: 300,
  nightModifier: 0.7,
  weekendModifier: 1.2,
  maxActiveMissions: 50,
  expirationTime: 600,
};

/**
 * Reward sanity: mission payouts should track difficulty. A ±20% band around the
 * median of a difficulty tier keeps outliers from collapsing variety into one
 * "always farm this call" template (see the v0.18.0 reward-band retune).
 */
export const REWARD_BAND_PCT = 0.2;

export function medianRewardForDifficulty(
  difficulty: number,
  missions: MissionTemplate[],
  field: 'baseCredits' | 'baseXp' = 'baseCredits',
): number {
  const inTier = missions
    .filter((m) => m.difficulty === difficulty)
    .map((m) => m[field])
    .sort((a, b) => a - b);
  if (inTier.length === 0) return 0;
  const mid = Math.floor(inTier.length / 2);
  return inTier.length % 2 === 1 ? inTier[mid] : (inTier[mid - 1] + inTier[mid]) / 2;
}

export function rewardBandFor(
  difficulty: number,
  missions: MissionTemplate[],
  field: 'baseCredits' | 'baseXp' = 'baseCredits',
): { min: number; max: number } {
  const median = medianRewardForDifficulty(difficulty, missions, field);
  return { min: Math.round(median * (1 - REWARD_BAND_PCT)), max: Math.round(median * (1 + REWARD_BAND_PCT)) };
}

/** Get missions for a specific service type */
export function getMissionsForService(service: 'fire' | 'police' | 'ems'): MissionTemplate[] {
  switch (service) {
    case 'fire': return FIRE_MISSIONS;
    case 'police': return POLICE_MISSIONS;
    case 'ems': return EMS_MISSIONS;
    default: return FIRE_MISSIONS;
  }
}

/** POI types that indicate road-side incidents. */
export const ROAD_POI_TYPES = ['road', 'highway', 'intersection'];

// ── Chain missions ─────────────────────────────────────────────────────────
// Chain definitions drive staged mission sequences: completing stage N spawns
// stage N+1 at the same location via apps/web/src/lib/missionChains.ts.

export interface ChainStage {
  templateId: string;
  service: ServiceType;
  label: string;
}

export interface ChainDefinition {
  id: string;
  name: string;
  stages: ChainStage[];
}

export const CHAIN_DEFINITIONS: ChainDefinition[] = [
  {
    id: 'fire_chain',
    name: 'Fire Escalation',
    stages: [
      { templateId: 'room_fire', service: 'fire', label: 'Structure Fire' },
      { templateId: 'gas_leak', service: 'fire', label: 'Gas Leak' },
      { templateId: 'car_crash_injury', service: 'ems', label: 'Injury Response' },
    ],
  },
  {
    id: 'police_chain',
    name: 'Robbery Follow-Up',
    stages: [
      { templateId: 'robbery', service: 'police', label: 'Robbery' },
      { templateId: 'hostage_situation', service: 'police', label: 'Hostage Situation' },
      { templateId: 'car_crash_injury', service: 'ems', label: 'Crash Response' },
    ],
  },
  {
    id: 'ems_chain',
    name: 'Mass Casualty Response',
    stages: [
      { templateId: 'multi_victim', service: 'ems', label: 'Mass Casualty' },
      { templateId: 'cardiac_emergency', service: 'ems', label: 'Secondary Cardiac' },
      { templateId: 'traffic_stop', service: 'police', label: 'Traffic Control' },
    ],
  },
  {
    id: 'chemical_chain',
    name: 'Chemical Spill Response',
    stages: [
      { templateId: 'fuel_spill', service: 'fire', label: 'Fuel Spill' },
      { templateId: 'hazmat_medical', service: 'ems', label: 'Exposure Treatment' },
      { templateId: 'factory_fire', service: 'fire', label: 'Chemical Fire' },
    ],
  },
  {
    id: 'mci_chain',
    name: 'Mass Transit Incident',
    stages: [
      { templateId: 'bus_crash', service: 'ems', label: 'Bus Crash' },
      { templateId: 'multi_victim', service: 'ems', label: 'Mass Casualty' },
      { templateId: 'hazmat_medical', service: 'ems', label: 'Exposure Treatment' },
    ],
  },
];

export function chainForId(id?: string): ChainDefinition | null {
  return CHAIN_DEFINITIONS.find((d) => d.id === id) ?? null;
}

/** Return the stage that follows the given 1-based stage, or null at the end. */
export function nextStage(def: ChainDefinition, currentStage: number): ChainStage | null {
  return def.stages[currentStage] ?? null;
}

/** Numeric ordering for sorting missions by priority, low → critical. */
export const MISSION_PRIORITY_RANK: Record<MissionPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Dispatch priority derived from incident severity and time window. Severe incidents
 * (difficulty 8+, or hazmat/rescue) are always critical; short-window calls bump one
 * tier since they need a quick response.
 */
export function getMissionPriority(difficulty: number, category: MissionCategory, durationSec?: number): MissionPriority {
  if (difficulty >= 8 || category === 'hazmat' || category === 'rescue') return 'critical';
  if (difficulty >= 5) return 'high';
  if (difficulty >= 3 || (durationSec != null && durationSec <= 60)) return 'medium';
  return 'low';
}

/**
 * Templates suitable for officer/crew-initiated traffic duties: dedicated traffic
 * incidents, plus road/highway calls for services without dedicated traffic templates
 * (e.g. EMS accident response) — never arbitrary calls.
 */
export function getTrafficDutyTemplates(service: 'fire' | 'police' | 'ems'): MissionTemplate[] {
  return getMissionsForService(service).filter(
    (t) => t.category === 'traffic' || t.poiTypes.some((p) => ROAD_POI_TYPES.includes(p))
  );
}
