// ============================================
// Dispatch HQ — Radio Dialogue Sequences (lazy)
// ============================================
// Heavy sequence generators split from radioDialogueEngine.ts to keep them
// out of the main bundle. Imported via dynamic import() from components that
// need them (RadioComms, MissionCard, MapView, SelectedUnitPanel, UDC).

import type { Unit, Mission } from '@dispatch-hq/shared';
import type { CommsService, DialogueMessage } from './radioDialogueEngine';
import {
  getUnitServiceType, isAirliftMission, statusCode,
  rand, unitDisplay, missionName, findPartner, findSupervisor,
  renderTpl, makeCtx, pickTemplate, line, etaMinutes,
  DISPATCHER_NAMES, SUPERVISOR_TITLES, TEMPLATES, AIR_TEMPLATES,
  CROSS_SERVICE_TEMPLATES, POOLS, WEATHER,
} from './radioDialogueEngine';

export function statusReport(
  unit: Unit,
  units: Unit[],
  missions: Mission[],
  helipadName?: string,
): DialogueMessage[] {
  const service = getUnitServiceType(unit.type);
  const partner = findPartner(unit, units);
  const mission = missions.find((m) => m.id === unit.missionId);
  const airCarrying = mission?.patientTransport?.mode === 'air';
  const airborne = (isAirliftMission(mission) && !!helipadName) || airCarrying;
  const ctx = makeCtx(unit, service, missions, partner, {
    ...(helipadName ? { helipad: helipadName } : {}),
    ...(mission?.patientTransport ? { hospital: mission.patientTransport.hospitalName } : {}),
  });
  const unitName = unitDisplay(unit);
  const out: DialogueMessage[] = [];

  if (unit.status === 'en_route') {
    ctx.code = statusCode(service, 'en_route');
    if (airCarrying) {
      const hospitalLeg = mission?.patientTransport?.padReached === true;
      out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(rand(hospitalLeg ? AIR_TEMPLATES.air_hospital : AIR_TEMPLATES.air_returning), ctx), 'unit', service, unit.id));
    } else if (airborne) {
      out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(rand(AIR_TEMPLATES.air_en_route), ctx), 'unit', service, unit.id));
    } else {
      out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, 'unit_en_route'), ctx), 'unit', service, unit.id));
    }
  }

  if (unit.status === 'on_scene') {
    ctx.code = statusCode(service, 'on_scene');
    out.push(line(unitName, rand(DISPATCHER_NAMES), airborne
      ? renderTpl(rand(AIR_TEMPLATES.air_on_scene), ctx)
      : renderTpl(pickTemplate(service, 'unit_on_scene'), ctx), 'unit', service, unit.id));
    const sup = findSupervisor(unit, units);
    if (sup) {
      ctx.code = statusCode(service, 'ack');
      out.push(line(rand(SUPERVISOR_TITLES[service]), unitName, renderTpl(pickTemplate(service, 'supervisor_check'), ctx), 'unit', service, sup.id, unit.id));
    }
    if (partner && Math.random() > 0.5) {
      out.push(line(unitName, unitDisplay(partner), renderTpl(pickTemplate(service, 'unit_to_unit'), ctx), 'unit', service, unit.id, partner.id));
    }
  }

  if (unit.status === 'patrolling') {
    ctx.code = statusCode(service, 'patrolling');
    out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, 'unit_patrol'), ctx), 'unit', service, unit.id));
    if (partner && Math.random() > 0.6) {
      out.push(line(unitName, unitDisplay(partner), renderTpl(pickTemplate(service, 'unit_to_unit'), ctx), 'unit', service, unit.id, partner.id));
    }
  }

  if (unit.status === 'returning') {
    ctx.code = statusCode(service, 'returning');
    out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, 'unit_returning'), ctx), 'unit', service, unit.id));
  }

  return out;
}

/** Random background chatter / banter / cross-service coordination. */
export function idleChatter(
  unit: Unit,
  units: Unit[],
  missions: Mission[],
  helipadName?: string,
): DialogueMessage[] {
  const service = getUnitServiceType(unit.type);
  const partner = findPartner(unit, units);
  const mission = missions.find((m) => m.id === unit.missionId);
  const airborne = isAirliftMission(mission) && !!helipadName;
  const ctx = makeCtx(unit, service, missions, partner, {
    ...(helipadName ? { helipad: helipadName } : {}),
  });
  const unitName = unitDisplay(unit);
  const out: DialogueMessage[] = [];

  if (airborne) {
    ctx.code = statusCode(service, 'ack');
    out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(rand(AIR_TEMPLATES.air_chatter), ctx), 'unit', service, unit.id));
    return out;
  }

  const roll = Math.random();
  if (roll < 0.35) {
    ctx.code = statusCode(service, unit.status === 'patrolling' ? 'patrolling' : 'ack');
    if (partner) {
      out.push(line(unitName, unitDisplay(partner), renderTpl(pickTemplate(service, 'unit_to_unit'), ctx), 'unit', service, unit.id, partner.id));
    } else {
      out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, 'unit_patrol'), ctx), 'unit', service, unit.id));
    }
  } else if (roll < 0.65) {
    ctx.code = statusCode(service, 'ack');
    out.push(line(rand(DISPATCHER_NAMES), unitName, renderTpl(pickTemplate(service, 'dispatcher_reply'), ctx), 'dispatch', service, undefined, unit.id));
  } else {
    const mission = missions.find((m) => m.id === unit.missionId);
    if (mission) {
      const otherServices: CommsService[] = ['police', 'fire', 'ems'].filter((s) => s !== service) as CommsService[];
      const cross = rand(otherServices);
      const key = `${service}_to_${cross}` as keyof typeof CROSS_SERVICE_TEMPLATES;
      const pool = CROSS_SERVICE_TEMPLATES[key]?.[service];
      if (pool && pool.length) {
        out.push(line(unitName, cross === 'police' ? 'Police' : cross === 'fire' ? 'Fire Command' : 'EMS', renderTpl(rand(pool), ctx), 'unit', service, unit.id));
      }
    }
  }

  return out;
}

/** Dispatcher / AI command response for a typed/issued command. */
export function commandResponse(
  commandText: string,
  unit: Unit,
  units: Unit[],
  missions: Mission[],
): DialogueMessage[] {
  const service = getUnitServiceType(unit.type);
  const partner = findPartner(unit, units);
  const supervisor = findSupervisor(unit, units);
  const ctx = makeCtx(unit, service, missions, partner);
  const unitName = unitDisplay(unit);
  const lower = commandText.toLowerCase();
  const out: DialogueMessage[] = [];

  out.push(line(rand(DISPATCHER_NAMES), unitName, renderTpl(pickTemplate(service, 'dispatcher_reply'), ctx), 'dispatch', service, undefined, unit.id));

  if (lower.includes('status')) {
    ctx.code = statusCode(service, unit.status === 'patrolling' ? 'patrolling' : unit.status === 'en_route' ? 'en_route' : 'on_scene');
    out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, unit.status === 'patrolling' ? 'unit_patrol' : unit.status === 'en_route' ? 'unit_en_route' : 'unit_on_scene'), ctx), 'unit', service, unit.id));
    if (partner && Math.random() > 0.4) {
      ctx.code = statusCode(service, 'ack');
      out.push(line(unitDisplay(partner), unitName, renderTpl(pickTemplate(service, 'unit_to_unit'), ctx), 'unit', service, partner.id, unit.id));
    }
  } else if (lower.includes('backup') || lower.includes('cover') || lower.includes('assist')) {
    ctx.code = statusCode(service, 'request');
    out.push(line(unitName, 'all', renderTpl('[{code}] {unit} requesting backup at {call} near {landmark}.', ctx), 'unit', service, unit.id));
    if (partner) {
      ctx.code = statusCode(service, 'ack');
      out.push(line(unitDisplay(partner), unitName, renderTpl(pickTemplate(service, 'unit_to_unit'), ctx), 'unit', service, partner.id, unit.id));
    }
    if (supervisor) {
      ctx.code = statusCode(service, 'ack');
      out.push(line(rand(SUPERVISOR_TITLES[service]), unitName, renderTpl(pickTemplate(service, 'supervisor_check'), ctx), 'unit', service, supervisor.id, unit.id));
    }
  } else if (lower.includes('code 3') || lower.includes('hurry') || lower.includes('respond')) {
    ctx.code = statusCode(service, 'en_route');
    out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, 'unit_en_route'), ctx), 'unit', service, unit.id));
    ctx.code = statusCode(service, 'ack');
    out.push(line(rand(DISPATCHER_NAMES), unitName, `Continue Code 3 to {call}.`, 'dispatch', service, undefined, unit.id));
  } else if (lower.includes('scene') || lower.includes('on scene') || lower.includes('arrived')) {
    ctx.code = statusCode(service, 'on_scene');
    out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, 'unit_on_scene'), ctx), 'unit', service, unit.id));
    if (partner) {
      ctx.code = statusCode(service, 'ack');
      out.push(line(unitDisplay(partner), unitName, renderTpl(pickTemplate(service, 'unit_to_unit'), ctx), 'unit', service, partner.id, unit.id));
    }
  } else if (lower.includes('return') || lower.includes('station')) {
    ctx.code = statusCode(service, 'returning');
    out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, 'unit_returning'), ctx), 'unit', service, unit.id));
  } else {
    ctx.code = statusCode(service, 'ack');
    out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, 'unit_ack'), ctx), 'unit', service, unit.id));
  }

  return out;
}

/**
 * Dispatcher-initiated follow-up exchange: progress check → unit location /
 * status reply with real streets + zone.
 */
export function followUpExchange(
  unit: Unit,
  units: Unit[],
  missions: Mission[],
  helipadName?: string,
): DialogueMessage[] {
  const service = getUnitServiceType(unit.type);
  const partner = findPartner(unit, units);
  const mission = missions.find((m) => m.id === unit.missionId);
  const airCarrying = mission?.patientTransport?.mode === 'air';
  const airborne = (isAirliftMission(mission) && !!helipadName) || airCarrying;
  const ctx = makeCtx(unit, service, missions, partner, {
    code: statusCode(service, unit.status === 'patrolling' ? 'patrolling' : 'ack'),
    ...(helipadName ? { helipad: helipadName } : {}),
    ...(mission?.patientTransport ? { hospital: mission.patientTransport.hospitalName } : {}),
  });
  const unitName = unitDisplay(unit);
  const out: DialogueMessage[] = [];

  out.push(line(
    rand(DISPATCHER_NAMES),
    unitName,
    renderTpl(airborne ? rand(AIR_TEMPLATES.air_followup) : pickTemplate(service, 'dispatcher_followup'), ctx),
    'dispatch',
    service,
    undefined,
    unit.id,
  ));

  ctx.code = statusCode(service, unit.status === 'en_route' ? 'en_route' : unit.status === 'on_scene' ? 'on_scene' : 'ack');
  out.push(line(
    unitName,
    rand(DISPATCHER_NAMES),
    renderTpl(airborne ? rand(AIR_TEMPLATES.air_en_route) : pickTemplate(service, 'unit_followup'), ctx),
    'unit',
    service,
    unit.id,
  ));

  if (partner && (unit.status === 'on_scene' || unit.status === 'en_route') && Math.random() > 0.5) {
    ctx.code = statusCode(service, 'ack');
    out.push(line(
      unitDisplay(partner),
      unitName,
      renderTpl(pickTemplate(service, 'unit_to_unit'), ctx),
      'unit',
      service,
      partner.id,
      unit.id,
    ));
  }

  return out;
}

/** Total number of distinct dialogue strings the engine can produce. */
export function countDialogues(): number {
  let total = 0;
  for (const service of Object.keys(TEMPLATES) as CommsService[]) {
    for (const context of Object.keys(TEMPLATES[service])) {
      for (const tpl of TEMPLATES[service][context]) {
        let combos = 1;
        for (const key of Object.keys(POOLS)) {
          if (tpl.includes(`{${key}}`)) combos *= POOLS[key as keyof typeof POOLS].length;
        }
        total += combos;
      }
    }
  }
  return total;
}

/** Human-readable summary of the dialogue library. */
export function dialogueSummary(): string {
  const contexts = Object.values(TEMPLATES).reduce((sum, s) => sum + Object.keys(s).length, 0);
  return `${countDialogues().toLocaleString()} distinct radio lines across ${contexts} contexts for police, fire, and EMS.`;
}

// ============================================
// High-level mission / command sequences
// ============================================

export function airliftSequence(
  unit: Unit,
  mission: Mission,
  helipadName: string,
  units: Unit[],
  missions: Mission[],
): DialogueMessage[] {
  const service = getUnitServiceType(unit.type);
  const ctx = makeCtx(unit, service, missions, null, {
    code: statusCode(service, 'en_route'),
    helipad: helipadName,
  });
  const unitName = unitDisplay(unit);
  const out: DialogueMessage[] = [];

  out.push(line(rand(DISPATCHER_NAMES), unitName, renderTpl(rand(AIR_TEMPLATES.air_dispatch), ctx), 'dispatch', service, undefined, unit.id));
  ctx.code = statusCode(service, 'ack');
  out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(rand(AIR_TEMPLATES.air_ack), ctx), 'unit', service, unit.id));
  ctx.code = statusCode(service, 'en_route');
  out.push(line(unitName, 'all', renderTpl(rand(AIR_TEMPLATES.air_en_route), ctx), 'unit', service, unit.id));
  out.push(line(rand(DISPATCHER_NAMES), unitName, `Copy ${unitName} — ${helipadName} is standing by for your recovery.`, 'dispatch', service, undefined, unit.id));

  return out;
}

/** Full dispatch assignment exchange: order, ack, partner check, follow-up. */
export function assignmentSequence(
  unit: Unit,
  mission: Mission,
  units: Unit[],
  missions: Mission[],
  helipadName?: string,
): DialogueMessage[] {
  const service = getUnitServiceType(unit.type);
  if (helipadName && isAirliftMission(mission)) {
    return airliftSequence(unit, mission, helipadName, units, missions);
  }
  const partner = findPartner(unit, units);
  const supervisor = findSupervisor(unit, units);
  const ctx = makeCtx(unit, service, missions, partner, { code: statusCode(service, 'en_route') });
  const unitName = unitDisplay(unit);
  const out: DialogueMessage[] = [];

  out.push(line(rand(DISPATCHER_NAMES), unitName, renderTpl(pickTemplate(service, 'dispatch_assign'), ctx), 'dispatch', service, undefined, unit.id));
  ctx.code = statusCode(service, 'ack');
  out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, 'unit_ack'), ctx), 'unit', service, unit.id));
  ctx.code = statusCode(service, 'en_route');
  out.push(line(unitName, 'all', renderTpl(pickTemplate(service, 'unit_en_route'), ctx), 'unit', service, unit.id));

  if (partner) {
    ctx.code = statusCode(service, 'en_route');
    out.push(line(unitName, unitDisplay(partner), renderTpl(pickTemplate(service, 'unit_to_unit'), ctx), 'unit', service, unit.id, partner.id));
  }

  if (supervisor && (mission.difficulty >= 7)) {
    ctx.code = statusCode(service, 'ack');
    out.push(line(rand(SUPERVISOR_TITLES[service]), unitName, renderTpl(pickTemplate(service, 'supervisor_check'), ctx), 'unit', service, supervisor.id, unit.id));
  }

  if (mission.category !== service) {
    const key = `${service}_to_${mission.category as CommsService}` as keyof typeof CROSS_SERVICE_TEMPLATES;
    const pool = CROSS_SERVICE_TEMPLATES[key]?.[service];
    if (pool && pool.length) {
      ctx.code = statusCode(service, 'ack');
      out.push(line(unitName, mission.category === 'police' ? 'Police' : mission.category === 'fire' ? 'Fire Command' : 'EMS', renderTpl(rand(pool), ctx), 'unit', service, unit.id));
    }
  }

  ctx.code = statusCode(service, 'en_route');
  out.push(line(rand(DISPATCHER_NAMES), unitName, renderTpl(pickTemplate(service, 'dispatcher_reply'), ctx), 'dispatch', service, undefined, unit.id));

  return out;
}

export function backupDispatchSequence(
  unit: Unit,
  mission: Mission,
  units: Unit[],
  missions: Mission[],
  backupServices: string[],
  helipadName?: string,
): DialogueMessage[] {
  const service = getUnitServiceType(unit.type);
  if (helipadName && isAirliftMission(mission)) {
    return airliftSequence(unit, mission, helipadName, units, missions);
  }
  const partner = findPartner(unit, units);
  const ctx = makeCtx(unit, service, missions, partner, {
    code: statusCode(service, 'request'),
    backup: backupServices.map((s) => s.toLowerCase()).join(' + '),
  });
  const unitName = unitDisplay(unit);
  const out: DialogueMessage[] = [];

  out.push(line(
    rand(DISPATCHER_NAMES),
    unitName,
    renderTpl(pickTemplate(service, 'dispatch_backup'), ctx),
    'dispatch',
    service,
    undefined,
    unit.id,
  ));

  ctx.code = statusCode(service, 'ack');
  out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, 'unit_ack'), ctx), 'unit', service, unit.id));
  ctx.code = statusCode(service, 'en_route');
  out.push(line(unitName, 'all', renderTpl(pickTemplate(service, 'unit_en_route'), ctx), 'unit', service, unit.id));

  return out;
}

/** Exchange when a unit returns to station after a mission. */
export function returnToStationSequence(
  unit: Unit,
  stationName: string,
  units: Unit[],
  missions: Mission[],
): DialogueMessage[] {
  const service = getUnitServiceType(unit.type);
  const ctx = makeCtx(unit, service, missions, null, { code: statusCode(service, 'returning') });
  const unitName = unitDisplay(unit);
  const out: DialogueMessage[] = [];

  out.push(line(unitName, rand(DISPATCHER_NAMES), renderTpl(pickTemplate(service, 'unit_returning'), ctx), 'unit', service, unit.id));
  ctx.code = statusCode(service, 'ack');
  out.push(line(rand(DISPATCHER_NAMES), unitName, `Copy ${unitName}, return to ${stationName}.`, 'dispatch', service, undefined, unit.id));
  return out;
}

/** Exchange when a unit starts a patrol. */
export function startPatrolSequence(
  unit: Unit,
  stationName: string,
  units: Unit[],
  missions: Mission[],
): DialogueMessage[] {
  const service = getUnitServiceType(unit.type);
  const ctx = makeCtx(unit, service, missions, null, { code: statusCode(service, 'patrolling') });
  const unitName = unitDisplay(unit);
  const out: DialogueMessage[] = [];

  out.push(line(unitName, rand(DISPATCHER_NAMES), `Starting patrol from ${stationName}. 10-41.`, 'unit', service, unit.id));
  ctx.code = statusCode(service, 'patrolling');
  out.push(line(rand(DISPATCHER_NAMES), unitName, `Copy ${unitName}, ${stationName} patrol approved. Keep us posted.`, 'dispatch', service, undefined, unit.id));
  out.push(line(unitName, 'all', renderTpl(pickTemplate(service, 'unit_patrol'), ctx), 'unit', service, unit.id));
  return out;
}
