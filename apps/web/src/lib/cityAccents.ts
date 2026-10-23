// ============================================
// Dispatch HQ — City Radio Accents
// ============================================
// Per-city dispatch terminology, call-sign formatting, and radio codes.
// When the player is in an international city, the radio dialogue engine
// swaps in locale-appropriate phrasing so London says "Acknowledged" instead
// of "10-4", Paris uses "Reçu" codes, and Tokyo uses Japanese-style dispatch.

import type { CommsService } from './radioDialogueEngine';

export interface CityAccent {
  /** City name (lowercase, matches selectedCity.name) */
  city: string;
  /** Country code for broad locale fallback */
  country: string;
  /** Dispatcher names — who speaks on the radio */
  dispatcherNames: string[];
  /** Supervisor titles per service */
  supervisorTitles: Record<CommsService, string[]>;
  /** Call codes per service (used in {code} placeholder) */
  callCodes: Record<CommsService, string[]>;
  /** Status codes per service (ack, en_route, on_scene, etc.) */
  codes: Record<CommsService, Record<string, string[]>>;
  /** Call-sign format: {icon} {name} (e.g. "🚒 Engine 1" → "🚒 Appliance 1") */
  callSignOverrides?: Record<string, string>;
  /** Template phrasing overrides — key is template context, value is array of alternate phrases */
  templateOverrides?: Record<CommsService, Record<string, string[]>>;
}

// ── London (UK) ───────────────────────────────────────────────────────────
// British emergency services use "Acknowledged"/"Received" instead of 10-codes,
// call signs are "Appliance" (fire), "Unit" (police), "Ambulance" (EMS),
// and dispatch is handled by "Control" not "Dispatch".

const LONDON_ACCENT: CityAccent = {
  city: 'london',
  country: 'gb',
  dispatcherNames: ['Control', 'Comms', 'LFB Control', 'Met Control', 'LAS Control'],
  supervisorTitles: {
    police: ['Inspector', 'Chief Inspector', 'Silver Command'],
    fire: ['Station Commander', 'Incident Commander', 'Bronze Officer'],
    ems: ['Clinical Lead', 'Operations Commander', 'Duty Officer'],
  },
  callCodes: {
    police: ['IMMEDIATE', 'PRIORITY', 'SLOW', 'ROUTINE'],
    fire: ['MAKE PUMPS 4', 'MAKE PUMPS 6', 'FULL SCALE', 'SMALL FIRE'],
    ems: ['CAT 1', 'CAT 2', 'CAT 3', 'CAT 4'],
  },
  codes: {
    police: {
      ack: ['Acknowledged', 'Received', 'Roger', 'Copy that'],
      en_route: ['En route', 'Responding', 'On my way', 'Heading there now'],
      on_scene: ['On scene', 'Arrived', 'Present at location', 'At the address'],
      returning: ['Returning to base', 'Back in service', 'Available', 'Clear'],
      patrolling: ['Patrolling', 'Area check', 'On watch', 'Covering sector'],
      available: ['Available', 'Ready', 'Standing by', 'In position'],
      request: ['Requesting assistance', 'Need backup', 'Requesting further units'],
      traffic_stop: ['Traffic stop', 'Vehicle check', 'Stopped vehicle'],
      suspect: ['Suspicious person', 'Possible suspect', 'Individual of interest'],
    },
    fire: {
      ack: ['Acknowledged', 'Received', 'Understood', 'Copy'],
      en_route: ['Responding', 'En route', 'Making best speed', 'On scene shortly'],
      on_scene: ['On scene', 'Arrived', 'First appliance on scene', 'In attendance'],
      returning: ['Returning to station', 'Back in quarters', 'Available', 'Clear'],
      patrolling: ['Inspection', 'Home safety check', 'Hydrant test', 'Community visit'],
      available: ['Available', 'Ready', 'In quarters', 'On station'],
      request: ['Requesting further appliances', 'Need breathing apparatus', 'Request water supply'],
    },
    ems: {
      ack: ['Acknowledged', 'Received', 'Copy', 'Affirmative'],
      en_route: ['Responding', 'En route', 'Making way', 'On scene shortly'],
      on_scene: ['On scene', 'Patient contact', 'Arrived at location', 'At the address'],
      returning: ['Returning to station', 'Back in service', 'Available', 'Clear'],
      patrolling: ['Standby', 'On cover', 'Area coverage', 'Ready state'],
      available: ['Available', 'Ready', 'In service', 'Standing by'],
      request: ['Requesting HART team', 'Need critical care', 'Requesting air ambulance'],
    },
  },
  // British fire services use different terminology
  templateOverrides: {
    police: {},
    fire: {
      dispatch_assign: [
        '{dispatcher} to {unit}, {call} at {landmark}, make pumps 4.',
        '{dispatcher} to {unit}, {call} reported at {road}, respond immediately.',
        '{unit}, {dispatcher}, {call} near {landmark}, all pumps to attend.',
        '{dispatcher} to {unit}, BA entry board for {call} at {landmark}.',
        '{dispatcher} to {unit}, persons reported at {road}, respond on pumps.',
      ],
      unit_on_scene: [
        '{unit} to {dispatcher}, {code}, first appliance on scene at {call}.',
        '{unit}, {code}, establishing water supply at {landmark}.',
        '{unit} to {dispatcher}, {code}, BA team entering building.',
        '{unit}, {code}, roof ventilation in progress.',
        '{unit} to {dispatcher}, {code}, two lines in use at {landmark}.',
        '{unit}, {code}, all persons accounted for.',
        '{unit} to {dispatcher}, {code}, fire under control.',
        '{unit}, {code}, damping down at {landmark}.',
      ],
      dispatch_backup: [
        '{dispatcher} to {unit}, {call} at {landmark} — make pumps 6. Additional appliances requested.',
        '{dispatcher} to {unit}, {call} on {road} escalating. Requesting {backup} support.',
        '{unit}, {dispatcher}, {call} at {landmark} — BA entry team needed. Coordinate with {backup}.',
      ],
      unit_patrol: [
        '{unit} to {dispatcher}, {code}, home visit complete in {sector}.',
        '{unit}, {code}, hydrant check on {road}, good flow.',
        '{unit} to {dispatcher}, all clear at {landmark}.',
        '{unit}, {code}, fire safety inspection at {road}.',
      ],
    },
    ems: {
      dispatch_assign: [
        '{dispatcher} to {unit}, {call} at {landmark}, respond {code}.',
        '{unit}, {dispatcher}, {call} on {road}, {code}.',
        '{dispatcher} to {unit}, {code}, {call} reported in {sector}.',
        '{unit}, {dispatcher}, standby for {call} near {landmark}.',
        '{dispatcher} to {unit}, Category 1 response to {call} from {road}.',
      ],
      unit_on_scene: [
        '{unit} to {dispatcher}, {code}, patient contact at {landmark}.',
        '{unit}, {code}, beginning primary survey.',
        '{unit} to {dispatcher}, {code}, loading patient for transport.',
        '{unit}, {code}, requesting police for scene safety at {call}.',
        '{unit}, {code}, vitals stable, en route to hospital.',
        '{unit} to {dispatcher}, {code}, patient transferred to hospital crew.',
      ],
    },
  },
};

// ── Paris (France) ────────────────────────────────────────────────────────
// French emergency services use numeric codes and "Reçu"/"Affirmatif" for
// acknowledgments. Dispatch is "Central" and units use "Samu" (EMS), "Sapeurs-
// Pompiers" (fire), "Police" (police).

const PARIS_ACCENT: CityAccent = {
  city: 'paris',
  country: 'fr',
  dispatcherNames: ['Central', 'PC Central', 'Com Central'],
  supervisorTitles: {
    police: ['Commandant', 'Commissaire', 'Officier de garde'],
    fire: ['Chef d\'agrès', 'Officier pompiers', 'Chef de团体'],
    ems: ['Médecin chef', 'Chef de bord', 'Coordinateur SAMU'],
  },
  callCodes: {
    police: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
    fire: ['FEU', 'URGENCE', 'SINISTRE', 'ALERT'],
    ems: ['P1 URGENT', 'P2 PRIORITAIRE', 'P3 STANDARD', 'P4 ROUTINE'],
  },
  codes: {
    police: {
      ack: ['Reçu', 'Affirmatif', 'Compris', 'C\'est noté'],
      en_route: ['En route', 'En déplacement', 'J\'arrive', 'Direction'],
      on_scene: ['Sur place', 'Présent', 'Arrivé', 'À l\'adresse'],
      returning: ['Retour base', 'Disponible', 'En service', 'Libre'],
      patrolling: ['Patrouille', 'Ronde', 'Surveille', 'En secteur'],
      available: ['Disponible', 'Prêt', 'En attente', 'Opérationnel'],
      request: ['Besoin de renforts', 'Demande d\'assistance', 'Appui requis'],
      traffic_stop: ['Contrôle routier', 'Véhicule contrôlé', 'Stop'],
      suspect: ['Individu suspect', 'Personne intéressante', 'Possible suspect'],
    },
    fire: {
      ack: ['Reçu', 'Affirmatif', 'Compris', 'Bien noté'],
      en_route: ['En route', 'En intervention', 'Direction', 'Arrive bientôt'],
      on_scene: ['Sur place', 'Présent', 'Première unité sur place', 'En intervention'],
      returning: ['Retour caserne', 'Disponible', 'En service', 'Libre'],
      patrolling: ['Inspection', 'Vérification', 'Prévention', 'Visite sécurité'],
      available: ['Disponible', 'Prêt', 'À la caserne', 'En station'],
      request: ['Demande de moyens supplémentaires', 'Besoin de DSA', 'Appui LT'],
    },
    ems: {
      ack: ['Reçu', 'Affirmatif', 'Compris', 'Bien noté'],
      en_route: ['En route', 'En déplacement', 'Direction le lieu', 'Arrive bientôt'],
      on_scene: ['Sur place', 'Contact patient', 'Arrivé', 'À l\'adresse'],
      returning: ['Retour base', 'Disponible', 'En service', 'Libre'],
      patrolling: ['Veille', 'Disponibilité', 'Couverture', 'En attente'],
      available: ['Disponible', 'Prêt', 'En service', 'Opérationnel'],
      request: ['Demande SMUR', 'Besoin médecin', 'Hélico requis'],
    },
  },
  templateOverrides: {
    police: {
      dispatch_assign: [
        '{dispatcher} à {unit}, {call} au {landmark}, intervention {code}.',
        '{dispatcher} à {unit}, {call} signalé au {road}, direction immédiate.',
        '{unit}, {dispatcher}, {call} près du {landmark}, répondre {code}.',
        '{dispatcher} à {unit}, alerte au {road}, vérifier sur place.',
      ],
      unit_on_scene: [
        '{unit} au {dispatcher}, {code}, sur place au {call}.',
        '{unit}, {code}, périmètre établi au {landmark}.',
        '{unit} au {dispatcher}, {code}, scène maîtrisée.',
        '{unit}, {code}, interpellation en cours au {call}.',
      ],
    },
    fire: {
      dispatch_assign: [
        '{dispatcher} à {unit}, {call} au {landmark}, {code}.',
        '{dispatcher} à {unit}, {call} au {road}, intervenir.',
        '{unit}, {dispatcher}, {call} près du {landmark}, {code}.',
        '{dispatcher} à {unit}, feu signalé au {road}, tous moyens.',
      ],
      unit_on_scene: [
        '{unit} au {dispatcher}, {code}, première unité sur place au {call}.',
        '{unit}, {code}, attaque en cours au {landmark}.',
        '{unit} au {dispatcher}, {code}, ventilation en cours.',
        '{unit}, {code}, recherche en profondeur au {landmark}.',
      ],
    },
    ems: {
      dispatch_assign: [
        '{dispatcher} à {unit}, {call} au {landmark}, {code}.',
        '{unit}, {dispatcher}, {call} au {road}, {code}.',
        '{dispatcher} à {unit}, {code}, {call} signalé en zone {sector}.',
        '{dispatcher} à {unit}, {call} au {road}, immédiat.',
      ],
      unit_on_scene: [
        '{unit} au {dispatcher}, {code}, contact patient au {landmark}.',
        '{unit}, {code}, début évaluation.',
        '{unit} au {dispatcher}, {code}, chargement patient, transport imminent.',
        '{unit}, {code}, demande renforts sécurité au {call}.',
      ],
    },
  },
};

// ── Tokyo (Japan) ─────────────────────────────────────────────────────────
// Japanese emergency services use different terminology. Fire is "Shōbōdan"
// (消防団), EMS is "Kyūkyūsha" (救急車), police is "Keisatsu" (警察).
// Dispatch uses "Hōsō" (放送) and acknowledgment is "Shōchi" (承知).

const TOKYO_ACCENT: CityAccent = {
  city: 'tokyo',
  country: 'jp',
  dispatcherNames: ['Hōsō', 'Dispatch', 'Control', 'Command'],
  supervisorTitles: {
    police: ['Keibu', 'Hanbasho', 'Tantō'],
    fire: ['Shunin', 'Kachō', 'Bugyō'],
    ems: ['Ishi', 'Kantoku', 'Tantō'],
  },
  callCodes: {
    police: ['Shūten', 'Yūsen', 'Futsū', 'Junbi'],
    fire: ['Kaji', 'Hijō', 'Tokkyū', 'Futsū'],
    ems: ['Kyūkyū', 'Shinkyūkyū', 'Futsū', 'Junbi'],
  },
  codes: {
    police: {
      ack: ['Shōchi', 'Ryōkai', 'Wakarimashita', 'Copy'],
      en_route: ['Shuppatsu', 'Mukau', 'Tōchū', 'En route'],
      on_scene: ['Tōchaku', 'Genba', 'Shikenchi', 'At location'],
      returning: ['Henseki', 'Kikan', 'Yoyū', 'Available'],
      patrolling: ['Patrol', 'Junkai', 'Hōmen', 'Sector'],
      available: ['Yoyū', 'Junbi', 'Hensei', 'Ready'],
      request: ['Homon', 'Toban', 'Shien', 'Backup'],
      traffic_stop: ['Tōsha', 'Hikae', 'Teisha'],
      suspect: ['Fushinsha', 'Giwaku', 'Keisatsu'],
    },
    fire: {
      ack: ['Shōchi', 'Ryōkai', 'Wakarimashita', 'Copy'],
      en_route: ['Shuppatsu', 'Mukau', 'Tōchū', 'En route'],
      on_scene: ['Tōchaku', 'Genba', 'Tōjō', 'On scene'],
      returning: ['Henseki', 'Kikan', 'Hensei', 'Available'],
      patrolling: ['Hōmen', 'Kensa', 'Bōsai', 'Prevention'],
      available: ['Yoyū', 'Junbi', 'Hensei', 'Ready'],
      request: ['Hosei', 'Shien', 'Toban', 'Backup'],
    },
    ems: {
      ack: ['Shōchi', 'Ryōkai', 'Wakarimashita', 'Copy'],
      en_route: ['Shuppatsu', 'Mukau', 'Tōchū', 'En route'],
      on_scene: ['Tōchaku', 'Kanja', 'Genba', 'On scene'],
      returning: ['Henseki', 'Kikan', 'Hensei', 'Available'],
      patrolling: ['Junbi', 'Hōmen', 'Coverage', 'Standby'],
      available: ['Yoyū', 'Junbi', 'Hensei', 'Ready'],
      request: ['Kyūkyū', 'Shien', 'Toban', 'Backup'],
    },
  },
  templateOverrides: {
    police: {
      dispatch_assign: [
        '{dispatcher} to {unit}, {call} at {landmark}, respond {code}.',
        '{dispatcher} to {unit}, {call} reported at {road}, go immediately.',
        '{unit}, {dispatcher}, {call} near {landmark}, {code}.',
        '{dispatcher} to {unit}, disturbance at {road}, investigate.',
      ],
      unit_on_scene: [
        '{unit} to {dispatcher}, {code}, arrived at {call}.',
        '{unit}, {code}, scene secured at {landmark}.',
        '{unit} to {dispatcher}, {code}, investigation underway.',
        '{unit}, {code}, suspect detained at {call}.',
      ],
    },
    fire: {
      dispatch_assign: [
        '{dispatcher} to {unit}, {call} at {landmark}, {code}.',
        '{dispatcher} to {unit}, {call} on {road}, respond immediately.',
        '{unit}, {dispatcher}, {call} near {landmark}, {code}.',
        '{dispatcher} to {unit}, fire alarm at {road}, check it out.',
      ],
      unit_on_scene: [
        '{unit} to {dispatcher}, {code}, on scene at {call}.',
        '{unit}, {code}, fire attack starting at {landmark}.',
        '{unit} to {dispatcher}, {code}, search and rescue in progress.',
        '{unit}, {code}, fire contained at {landmark}.',
      ],
    },
    ems: {
      dispatch_assign: [
        '{dispatcher} to {unit}, {call} at {landmark}, {code}.',
        '{unit}, {dispatcher}, {call} on {road}, {code}.',
        '{dispatcher} to {unit}, {code}, emergency call in {sector}.',
        '{dispatcher} to {unit}, medical emergency at {road}, {code}.',
      ],
      unit_on_scene: [
        '{unit} to {dispatcher}, {code}, patient contact at {landmark}.',
        '{unit}, {code}, beginning assessment.',
        '{unit} to {dispatcher}, {code}, preparing for transport.',
        '{unit}, {code}, patient stable, heading to hospital.',
      ],
    },
  },
};

// ── Berlin (Germany) ──────────────────────────────────────────────────────
// German emergency services use "Verstanden"/"Okay" for acknowledgment,
// fire is "Feuerwehr", EMS is "Rettungsdienst", police is "Polizei".

const BERLIN_ACCENT: CityAccent = {
  city: 'berlin',
  country: 'de',
  dispatcherNames: ['Leitstelle', 'Zentrale', 'Dispo', 'Command'],
  supervisorTitles: {
    police: ['Hauptkommissar', 'Kommissar', 'Dienstgruppenleiter'],
    fire: ['Gruppenführer', 'Hauptmann', 'Schichtleiter'],
    ems: ['Notarzt', 'Einsatzleiter', 'Diensthabend'],
  },
  callCodes: {
    police: ['EILIG', 'DRINGEND', 'NORMAL', 'ROUTINE'],
    fire: ['BRAND', 'EILIG', 'HILFSARBEIT', 'NORMAL'],
    ems: ['NOTFALL', 'DRINGEND', 'EILIG', 'ROUTINE'],
  },
  codes: {
    police: {
      ack: ['Verstanden', 'Okay', 'Roger', 'Ist notiert'],
      en_route: ['Unterwegs', 'Bin da', 'On my way', 'En route'],
      on_scene: ['Vor Ort', 'Da', 'Am Einsatzort', 'At location'],
      returning: ['Rückkehr', 'Verfügbar', 'En route', 'Available'],
      patrolling: ['Patrouille', 'Kontrolle', 'Überwachung', 'Sector'],
      available: ['Verfügbar', 'Bereit', 'Bereit', 'Ready'],
      request: ['Verstärkung', 'Hilfe', 'Zusatz', 'Backup'],
      traffic_stop: ['Kontrolle', 'Halt', 'Stopp'],
      suspect: ['Verdächtig', 'Person', 'Möglicher Täter'],
    },
    fire: {
      ack: ['Verstanden', 'Okay', 'Roger', 'Ist notiert'],
      en_route: ['Unterwegs', 'On my way', 'Komme', 'En route'],
      on_scene: ['Vor Ort', 'Da', 'Am Einsatzort', 'On scene'],
      returning: ['Rückkehr', 'Verfügbar', 'En route', 'Available'],
      patrolling: ['Kontrolle', 'Schau', 'Prüfung', 'Prevention'],
      available: ['Verfügbar', 'Bereit', 'In Wache', 'Ready'],
      request: ['Mehr Kräfte', 'Atemschutz', 'Wasser', 'Backup'],
    },
    ems: {
      ack: ['Verstanden', 'Okay', 'Roger', 'Ist notiert'],
      en_route: ['Unterwegs', 'Komme', 'On my way', 'En route'],
      on_scene: ['Vor Ort', 'Patient da', 'Am Einsatzort', 'On scene'],
      returning: ['Rückkehr', 'Verfügbar', 'En route', 'Available'],
      patrolling: ['Bereitschaft', 'Bereit', 'Abdeckung', 'Standby'],
      available: ['Verfügbar', 'Bereit', 'Einsatzbereit', 'Ready'],
      request: ['Notarzt', 'Hubschrauber', 'Verstärkung', 'Backup'],
    },
  },
  templateOverrides: {
    police: {
      dispatch_assign: [
        '{dispatcher} an {unit}, {call} am {landmark}, {code}.',
        '{dispatcher} an {unit}, {call} gemeldet am {road}, sofort los.',
        '{unit}, {dispatcher}, {call} nahe {landmark}, {code}.',
        '{dispatcher} an {unit}, Störung am {road}, überprüfen.',
      ],
      unit_on_scene: [
        '{unit} an {dispatcher}, {code}, am Einsatzort {call}.',
        '{unit}, {code}, Lage gesichert am {landmark}.',
        '{unit} an {dispatcher}, {code}, Ermittlungen laufen.',
        '{unit}, {code}, Tatverdächtiger festgenommen am {call}.',
      ],
    },
    fire: {
      dispatch_assign: [
        '{dispatcher} an {unit}, {call} am {landmark}, {code}.',
        '{dispatcher} an {unit}, {call} am {road}, sofort ausrücken.',
        '{unit}, {dispatcher}, {call} nahe {landmark}, {code}.',
        '{dispatcher} an {unit}, Brandalarm am {road}, überprüfen.',
      ],
      unit_on_scene: [
        '{unit} an {dispatcher}, {code}, am Einsatzort {call}.',
        '{unit}, {code}, Angriff am {landmark}.',
        '{unit} an {dispatcher}, {code}, Suchrettung läuft.',
        '{unit}, {code}, Brand gelöscht am {landmark}.',
      ],
    },
    ems: {
      dispatch_assign: [
        '{dispatcher} an {unit}, {call} am {landmark}, {code}.',
        '{unit}, {dispatcher}, {call} am {road}, {code}.',
        '{dispatcher} an {unit}, {code}, Notfall in {sector}.',
        '{dispatcher} an {unit}, medizinischer Notfall am {road}, {code}.',
      ],
      unit_on_scene: [
        '{unit} an {dispatcher}, {code}, Patient kontaktiert am {landmark}.',
        '{unit}, {code}, beginne Bewertung.',
        '{unit} an {dispatcher}, {code}, Patient wird transportiert.',
        '{unit}, {code}, Patient stabil, unterwegs ins Krankenhaus.',
      ],
    },
  },
};

// ── Sydney (Australia) ───────────────────────────────────────────────────
// Australian emergency services use "Copy"/"Roger" for acknowledgment,
// fire is "Fire & Rescue NSW" (FRNSW), EMS is "NSW Ambulance",
// police is "NSW Police Force". Australian radio is similar to British
// but uses Australian slang and terminology.

const SYDNEY_ACCENT: CityAccent = {
  city: 'sydney',
  country: 'au',
  dispatcherNames: ['Dispatch', 'Comms', 'Operations', 'Control'],
  supervisorTitles: {
    police: ['Inspector', 'Superintendent', 'Commander'],
    fire: ['Station Officer', 'Divisional Officer', 'Commander'],
    ems: ['Team Leader', 'Paramedic Supervisor', 'Operations Manager'],
  },
  callCodes: {
    police: ['URGENT', 'PRIORITY', 'NON-URGENT', 'ROUTINE'],
    fire: ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'],
    ems: ['PARAMEDIC URGENT', 'PARAMEDIC PRIORITY', 'PARAMEDIC STANDARD', 'PARAMEDIC LOW'],
  },
  codes: {
    police: {
      ack: ['Copy', 'Roger', 'Received', 'Affirmative'],
      en_route: ['Responding', 'En route', 'On my way', 'Heading there'],
      on_scene: ['On scene', 'Arrived', 'At location', 'Present'],
      returning: ['Returning to base', 'Back in service', 'Available', 'Clear'],
      patrolling: ['Patrolling', 'Area check', 'On watch', 'Covering sector'],
      available: ['Available', 'Ready', 'Standing by', 'In position'],
      request: ['Requesting backup', 'Need assistance', 'Requesting further units'],
      traffic_stop: ['Traffic stop', 'Vehicle check', 'Stopped vehicle'],
      suspect: ['Suspicious person', 'Possible suspect', 'Person of interest'],
    },
    fire: {
      ack: ['Copy', 'Roger', 'Received', 'Affirmative'],
      en_route: ['Responding', 'En route', 'On scene shortly', 'Making best speed'],
      on_scene: ['On scene', 'Arrived', 'First appliance on scene', 'In attendance'],
      returning: ['Returning to station', 'Back in quarters', 'Available', 'Clear'],
      patrolling: ['Inspection', 'Home safety check', 'Hydrant test', 'Community visit'],
      available: ['Available', 'Ready', 'In quarters', 'On station'],
      request: ['Requesting further appliances', 'Need BA team', 'Request water supply'],
    },
    ems: {
      ack: ['Copy', 'Roger', 'Received', 'Affirmative'],
      en_route: ['Responding', 'En route', 'On scene shortly', 'Making way'],
      on_scene: ['On scene', 'Patient contact', 'Arrived at location', 'At the address'],
      returning: ['Returning to station', 'Back in service', 'Available', 'Clear'],
      patrolling: ['Standby', 'On cover', 'Area coverage', 'Ready state'],
      available: ['Available', 'Ready', 'In service', 'Standing by'],
      request: ['Requesting helicopter', 'Need intensive care', 'Requesting police assist'],
    },
  },
  templateOverrides: {
    police: {
      dispatch_assign: [
        '{dispatcher} to {unit}, {call} at {landmark}, respond {code}.',
        '{dispatcher} to {unit}, {call} reported at {road}, go immediately.',
        '{unit}, {dispatcher}, {call} near {landmark}, {code}.',
        '{dispatcher} to {unit}, disturbance at {road}, investigate.',
      ],
      unit_on_scene: [
        '{unit} to {dispatcher}, {code}, arrived at {call}.',
        '{unit}, {code}, scene secured at {landmark}.',
        '{unit} to {dispatcher}, {code}, investigation underway.',
        '{unit}, {code}, suspect detained at {call}.',
      ],
    },
    fire: {
      dispatch_assign: [
        '{dispatcher} to {unit}, {call} at {landmark}, {code}.',
        '{dispatcher} to {unit}, {call} on {road}, respond immediately.',
        '{unit}, {dispatcher}, {call} near {landmark}, {code}.',
        '{dispatcher} to {unit}, fire alarm at {road}, check it out.',
      ],
      unit_on_scene: [
        '{unit} to {dispatcher}, {code}, on scene at {call}.',
        '{unit}, {code}, fire attack starting at {landmark}.',
        '{unit} to {dispatcher}, {code}, search and rescue in progress.',
        '{unit}, {code}, fire contained at {landmark}.',
      ],
    },
    ems: {
      dispatch_assign: [
        '{dispatcher} to {unit}, {call} at {landmark}, {code}.',
        '{unit}, {dispatcher}, {call} on {road}, {code}.',
        '{dispatcher} to {unit}, {code}, emergency call in {sector}.',
        '{dispatcher} to {unit}, medical emergency at {road}, {code}.',
      ],
      unit_on_scene: [
        '{unit} to {dispatcher}, {code}, patient contact at {landmark}.',
        '{unit}, {code}, beginning assessment.',
        '{unit} to {dispatcher}, {code}, preparing for transport.',
        '{unit}, {code}, patient stable, heading to hospital.',
      ],
    },
  },
};

// ── Toronto (Canada) ──────────────────────────────────────────────────────
// Canadian emergency services use "Copy that"/"Roger" for acknowledgment,
// fire is "Toronto Fire Services" (TFS), EMS is "Toronto Paramedic Services",
// police is "Toronto Police Service" (TPS). Canadian radio is similar to
// American but with distinct call signs and terminology.

const TORONTO_ACCENT: CityAccent = {
  city: 'toronto',
  country: 'ca',
  dispatcherNames: ['Dispatch', 'Comms', 'Control', 'Operations'],
  supervisorTitles: {
    police: ['Inspector', 'Staff Superintendent', 'Division Commander'],
    fire: ['District Chief', 'Platoon Chief', 'Battalion Chief'],
    ems: ['Superintendent', 'Operations Supervisor', 'Team Leader'],
  },
  callCodes: {
    police: ['URGENT', 'PRIORITY', 'NON-URGENT', 'ROUTINE'],
    fire: ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'],
    ems: ['PARAMEDIC URGENT', 'PARAMEDIC PRIORITY', 'PARAMEDIC STANDARD', 'PARAMEDIC LOW'],
  },
  codes: {
    police: {
      ack: ['Copy that', 'Roger', 'Received', 'Affirmative'],
      en_route: ['Responding', 'En route', 'On my way', 'Heading there'],
      on_scene: ['On scene', 'Arrived', 'At location', 'Present'],
      returning: ['Returning to base', 'Back in service', 'Available', 'Clear'],
      patrolling: ['Patrolling', 'Area check', 'On watch', 'Covering sector'],
      available: ['Available', 'Ready', 'Standing by', 'In position'],
      request: ['Requesting backup', 'Need assistance', 'Requesting further units'],
      traffic_stop: ['Traffic stop', 'Vehicle check', 'Stopped vehicle'],
      suspect: ['Suspicious person', 'Possible suspect', 'Person of interest'],
    },
    fire: {
      ack: ['Copy that', 'Roger', 'Received', 'Affirmative'],
      en_route: ['Responding', 'En route', 'On scene shortly', 'Making best speed'],
      on_scene: ['On scene', 'Arrived', 'First apparatus on scene', 'In attendance'],
      returning: ['Returning to station', 'Back in quarters', 'Available', 'Clear'],
      patrolling: ['Inspection', 'Home safety check', 'Hydrant test', 'Community visit'],
      available: ['Available', 'Ready', 'In quarters', 'On station'],
      request: ['Requesting further apparatus', 'Need BA team', 'Request water supply'],
    },
    ems: {
      ack: ['Copy that', 'Roger', 'Received', 'Affirmative'],
      en_route: ['Responding', 'En route', 'On scene shortly', 'Making way'],
      on_scene: ['On scene', 'Patient contact', 'Arrived at location', 'At the address'],
      returning: ['Returning to station', 'Back in service', 'Available', 'Clear'],
      patrolling: ['Standby', 'On cover', 'Area coverage', 'Ready state'],
      available: ['Available', 'Ready', 'In service', 'Standing by'],
      request: ['Requesting air ambulance', 'Need critical care', 'Requesting police assist'],
    },
  },
  templateOverrides: {
    police: {
      dispatch_assign: [
        '{dispatcher} to {unit}, {call} at {landmark}, respond {code}.',
        '{dispatcher} to {unit}, {call} reported at {road}, go immediately.',
        '{unit}, {dispatcher}, {call} near {landmark}, {code}.',
        '{dispatcher} to {unit}, disturbance at {road}, investigate.',
      ],
      unit_on_scene: [
        '{unit} to {dispatcher}, {code}, arrived at {call}.',
        '{unit}, {code}, scene secured at {landmark}.',
        '{unit} to {dispatcher}, {code}, investigation underway.',
        '{unit}, {code}, suspect detained at {call}.',
      ],
    },
    fire: {
      dispatch_assign: [
        '{dispatcher} to {unit}, {call} at {landmark}, {code}.',
        '{dispatcher} to {unit}, {call} on {road}, respond immediately.',
        '{unit}, {dispatcher}, {call} near {landmark}, {code}.',
        '{dispatcher} to {unit}, fire alarm at {road}, check it out.',
      ],
      unit_on_scene: [
        '{unit} to {dispatcher}, {code}, on scene at {call}.',
        '{unit}, {code}, fire attack starting at {landmark}.',
        '{unit} to {dispatcher}, {code}, search and rescue in progress.',
        '{unit}, {code}, fire contained at {landmark}.',
      ],
    },
    ems: {
      dispatch_assign: [
        '{dispatcher} to {unit}, {call} at {landmark}, {code}.',
        '{unit}, {dispatcher}, {call} on {road}, {code}.',
        '{dispatcher} to {unit}, {code}, emergency call in {sector}.',
        '{dispatcher} to {unit}, medical emergency at {road}, {code}.',
      ],
      unit_on_scene: [
        '{unit} to {dispatcher}, {code}, patient contact at {landmark}.',
        '{unit}, {code}, beginning assessment.',
        '{unit} to {dispatcher}, {code}, preparing for transport.',
        '{unit}, {code}, patient stable, heading to hospital.',
      ],
    },
  },
};

// ── Accent Registry ───────────────────────────────────────────────────────

const ACCENT_REGISTRY: CityAccent[] = [
  LONDON_ACCENT,
  PARIS_ACCENT,
  TOKYO_ACCENT,
  BERLIN_ACCENT,
  SYDNEY_ACCENT,
  TORONTO_ACCENT,
];

/** Get the radio accent for a city. Returns null for unregistered cities (uses default American). */
export function getCityAccent(cityName: string | null | undefined): CityAccent | null {
  if (!cityName) return null;
  const lower = cityName.toLowerCase();
  return ACCENT_REGISTRY.find((a) => lower.includes(a.city)) ?? null;
}

/** Get the country code for a city (for broad locale fallback). */
export function getCityCountry(cityName: string | null | undefined): string | null {
  if (!cityName) return null;
  const accent = getCityAccent(cityName);
  return accent?.country ?? null;
}
