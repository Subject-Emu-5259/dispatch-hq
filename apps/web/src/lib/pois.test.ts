import { describe, it, expect } from 'vitest';
import {
  makePoi, poiById, findAnchorPoi,
  POI_TYPE_META, POI_TYPES, POI_BUILD_COST, HOSPITAL_BUILD_COST,
} from '@/lib/pois';

const WM = { name: 'West Memphis, AR' };

describe('POI build costs', () => {
  it('exposes affordable landmark + hospital prices', () => {
    expect(POI_BUILD_COST).toBeGreaterThan(0);
    expect(HOSPITAL_BUILD_COST).toBeGreaterThan(POI_BUILD_COST);
  });
});

describe('makePoi (player-placed landmarks)', () => {
  it('builds a landmark with metadata, buckets, and a unique id', () => {
    const a = makePoi('school', { lat: 35.12, lng: -90.19 }, WM);
    const b = makePoi('school', { lat: 35.13, lng: -90.18 }, WM);
    expect(a.type).toBe('school');
    expect(a.id).not.toBe(b.id);
    expect(a.id.startsWith('poi_west_memphis_ar_school_')).toBe(true);
    expect(a.name.length).toBeGreaterThan(0);
    expect(a.buckets).toEqual(POI_TYPE_META.school.buckets);
    expect(a.position).toEqual({ lat: 35.12, lng: -90.19 });
  });

  it('names a second landmark of the same type distinctly (ordinal suffix)', () => {
    const first = makePoi('park', { lat: 35.12, lng: -90.19 }, WM, 0);
    const second = makePoi('park', { lat: 35.13, lng: -90.18 }, WM, 1);
    // Pool picks are random, so assert the ordinal suffix + uniqueness, not
    // the exact base name.
    expect(second.name.endsWith(' 2')).toBe(true);
    expect(second.name).not.toBe(first.name);
    expect(second.id).not.toBe(first.id);
  });

  it('handles a missing city gracefully', () => {
    const poi = makePoi('bank', { lat: 35.12, lng: -90.19 }, null);
    expect(poi.name.length).toBeGreaterThan(0);
    expect(poi.id.startsWith('poi_city_bank_')).toBe(true);
  });

  it('covers every POI type with valid metadata', () => {
    for (const type of POI_TYPES) {
      const poi = makePoi(type, { lat: 35.12, lng: -90.19 }, WM);
      expect(POI_TYPE_META[poi.type].label.length).toBeGreaterThan(0);
      expect(poi.name.length).toBeGreaterThan(0);
      expect(poi.buckets.length).toBeGreaterThan(0);
    }
  });
});

describe('poiById / findAnchorPoi', () => {
  const pois = [
    makePoi('school', { lat: 35.12, lng: -90.19 }, WM),
    makePoi('gas_station', { lat: 35.16, lng: -90.14 }, WM),
    makePoi('bank', { lat: 35.15, lng: -90.16 }, WM),
  ];

  it('finds a POI by id and returns null for unknown ids', () => {
    expect(poiById(pois, pois[0].id)?.id).toBe(pois[0].id);
    expect(poiById(pois, 'poi_nope')).toBeNull();
    expect(poiById(pois, null)).toBeNull();
  });

  it('prefers matching-bucket POIs near the location', () => {
    const school = pois.find((p) => p.type === 'school')!;
    const picked = findAnchorPoi(pois, school.position, ['school', 'road']);
    expect(picked?.type).toBe('school');
    expect(picked?.id).toBe(school.id);
  });

  it('never anchors to an unrelated POI when no bucket matches (v0.22.x fix)', () => {
    // A cargo-port/water call (e.g. a container fire) has NO matching landmark
    // in the city — it must stay street-level instead of anchoring to a school
    // or gas station. The old any-POI fallback produced exactly those wrong
    // anchors ("Container Fire at Grace Community Church").
    const picked = findAnchorPoi(pois, pois[0].position, ['cargo_port', 'water']);
    expect(picked).toBeNull();
  });

  it('prefers a place whose IDENTITY tag matches, even over a nearer generic match', () => {
    // A school disturbance (poiTypes school/public) matches BOTH the school
    // (identity 'school' tag) and a church (via the generic 'public' tag) — and
    // the church is placed nearer the call. Identity must win: the disturbance
    // anchors to the school, never to the closer but wrong kind of building.
    const school = makePoi('school', { lat: 35.12, lng: -90.19 }, WM);
    const church = makePoi('church', { lat: 35.11, lng: -90.18 }, WM);
    const picked = findAnchorPoi([school, church], church.position, ['school', 'public']);
    expect(picked?.type).toBe('school');
  });

  it('anchors a robbery to the bank when one is placed', () => {
    const bank = pois.find((p) => p.type === 'bank')!;
    const picked = findAnchorPoi(pois, bank.position, ['commercial', 'bank', 'retail']);
    expect(picked?.type).toBe('bank');
  });

  it('returns null when everything is beyond maxKm', () => {
    const far = { lat: 35.3, lng: -90.4 };
    expect(findAnchorPoi(pois, far, ['school'], 0.1)).toBeNull();
  });

  it('never anchors pure road/highway calls', () => {
    const picked = findAnchorPoi(pois, pois[0].position, ['road', 'highway']);
    expect(picked).toBeNull();
    expect(findAnchorPoi(pois, pois[0].position, ['road', 'intersection'])).toBeNull();
  });

  it('returns null when no landmarks are placed (empty city)', () => {
    expect(findAnchorPoi([], { lat: 35.12, lng: -90.19 }, ['school'])).toBeNull();
  });
});
