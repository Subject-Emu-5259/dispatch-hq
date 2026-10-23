// ============================================
// Dispatch HQ — Paris Street & District Data
// ============================================
// Real City of Paris road names + district names so radio traffic in a Paris
// campaign references actual streets and neighbourhoods instead of the West
// Memphis defaults. Streets are grouped by patrol zone direction (the same
// nw/n/ne/w/c/e/sw/s/se grid as patrolZones) so a Central unit reports from
// Rue de Rivoli, a South unit from Avenue des Gobelins, etc. The grid spans
// the whole ville de Paris (all 20 arrondissements inside the Boulevard
// Périphérique), matching the precise boundary — the two bois (Boulogne,
// Vincennes) are Paris parks inside the city, not suburbs.
//
// SUBURB RULE (v0.34.x): Paris proper is ringed by the banlieue — Boulogne-
// Billancourt, Neuilly, Levallois, Saint-Denis, Montreuil, Ivry, Versailles,
// La Défense… Never list those as a place/landmark/zone name: they must not
// read as addressable locations inside the dispatch area. Street NAMES that
// pass through the city (Rue de Sèvres, Rue de Charenton, Boulevard
// Saint-Denis) are fine — the roads run through Paris — and are exempted
// explicitly in cityStreets.test.ts. Enforced by cityStreets.test.ts.

import type { ZoneStreetData } from './cityStreets';

/** Per-zone street pools (real Paris roads). */
export const PARIS_ZONE_STREETS: Record<string, ZoneStreetData> = {
  nw: {
    streets: ['Avenue Kléber', 'Avenue Victor Hugo', 'Rue de Passy', 'Rue de la Pompe', 'Boulevard de Courcelles', 'Avenue de Wagram', 'Rue des Batignolles', 'Avenue de la Grande Armée', 'Boulevard Pereire', 'Rue de Longchamp'],
    landmarks: ['the Trocadéro', 'the Palais de Chaillot', 'Parc Monceau', 'the Roland Garros stadium', 'the Bois de Boulogne'],
  },
  n: {
    streets: ['Rue Lepic', 'Rue des Abbesses', 'Boulevard de Clichy', 'Boulevard de Rochechouart', 'Rue Ordener', 'Rue Marx Dormoy', 'Rue Caulaincourt', 'Rue Championnet', 'Rue du Poteau'],
    landmarks: ['Sacré-Cœur', 'the Moulin Rouge', 'the Place du Tertre', 'the Pigalle district', 'the Montmartre cemetery'],
  },
  ne: {
    streets: ['Rue de Belleville', 'Rue de Ménilmontant', 'Boulevard de Belleville', 'Rue de la Villette', 'Avenue Jean Jaurès', 'Rue des Pyrénées', 'Boulevard Sérurier', 'Rue de Crimée', 'Avenue Simon Bolivar'],
    landmarks: ['the Parc des Buttes-Chaumont', 'the Cité des Sciences', 'Père Lachaise', 'the Place des Fêtes', 'the Canal de l\'Ourcq'],
  },
  w: {
    streets: ['Avenue des Champs-Élysées', 'Avenue Montaigne', 'Rue du Faubourg Saint-Honoré', 'Boulevard Saint-Germain', 'Rue de Grenelle', 'Avenue de Suffren', 'Boulevard de La Tour-Maubourg', 'Avenue Marceau'],
    landmarks: ['the Arc de Triomphe', 'the Eiffel Tower', 'Les Invalides', 'the Grand Palais', 'the Petit Palais'],
  },
  c: {
    streets: ['Rue de Rivoli', 'Rue Saint-Honoré', 'Rue du Louvre', 'Rue de la Paix', 'Rue Royale', 'Boulevard de Sébastopol', 'Rue du Temple', 'Rue des Archives', 'Rue Saint-Antoine', 'Rue de la Verrerie', 'Boulevard Henri-IV'],
    landmarks: ['the Louvre', 'Notre-Dame', 'the Pompidou Centre', 'the Tuileries Garden', 'the Palais-Royal', 'the Conciergerie', 'Place de la Concorde'],
  },
  e: {
    streets: ['Rue de la Roquette', 'Rue Oberkampf', 'Boulevard Voltaire', 'Boulevard Richard-Lenoir', 'Avenue de la République', 'Rue de Charonne', 'Rue du Faubourg Saint-Antoine', 'Boulevard Beaumarchais', 'Rue de Lappe'],
    landmarks: ['the Bastille', 'the Place de la République', 'the Opéra Bastille', 'the Marché d\'Aligre', 'the Place de la Nation'],
  },
  sw: {
    streets: ['Boulevard du Montparnasse', 'Rue de Rennes', 'Rue de Vaugirard', 'Avenue du Maine', 'Boulevard Pasteur', 'Rue de la Convention', 'Rue des Entrepreneurs', 'Rue du Commerce', 'Boulevard Garibaldi'],
    landmarks: ['the Tour Montparnasse', 'the Catacombs', 'the Gare Montparnasse', 'the Parc Georges Brassens', 'the Porte de Versailles'],
  },
  s: {
    streets: ['Avenue des Gobelins', 'Rue de Tolbiac', 'Avenue d\'Italie', 'Rue de la Butte-aux-Cailles', 'Boulevard Auguste Blanqui', 'Rue du Château-des-Rentiers', 'Avenue de Choisy', 'Rue Nationale', 'Boulevard Kellermann'],
    landmarks: ['the Manufacture des Gobelins', 'the Butte-aux-Cailles', 'the Place d\'Italie', 'the Parc Montsouris', 'the Cité universitaire'],
  },
  se: {
    streets: ['Rue de Bercy', 'Avenue Daumesnil', 'Boulevard Diderot', 'Quai de la Gare', 'Avenue de France', 'Rue du Chevaleret', 'Boulevard Vincent-Auriol', 'Rue de Charenton', 'Rue des Terres au Curé'],
    landmarks: ['the Bercy Arena', 'the Gare de Lyon', 'the Bibliothèque François-Mitterrand', 'the Accor Arena', 'the Bois de Vincennes'],
  },
};

/** Streets that make sense in any zone (the ring road, the bridges, the grands boulevards). */
export const PARIS_THROUGH_STREETS = [
  'the Boulevard Périphérique', 'Pont Neuf', 'Pont Alexandre III', 'Pont des Arts', 'Pont d\'Iéna', 'Pont Marie', 'Pont de la Concorde',
  'Boulevard Bonne-Nouvelle', 'Boulevard Saint-Martin', 'the Quai de la Seine',
];

/** Generic Paris landmarks for when a specific zone has no pool hit. */
export const PARIS_CITY_LANDMARKS = [
  'the Seine', 'the Eiffel Tower', 'the Louvre', 'Notre-Dame', 'the Arc de Triomphe', 'Sacré-Cœur',
  'the Panthéon', 'the Pompidou Centre', 'the Luxembourg Gardens', 'the Opéra Garnier',
];

/** Real Paris district names keyed by zone id. */
export const PARIS_ZONE_NAMES: Record<string, string> = {
  nw: 'Passy', n: 'Montmartre', ne: 'Belleville',
  w: 'the Champs-Élysées', c: 'the Marais', e: 'the Bastille',
  sw: 'Montparnasse', s: 'the Gobelins', se: 'Bercy',
};

/** Streets used when no zone matches (through-roads + a central mix). */
export const PARIS_FALLBACK_STREETS = [
  ...PARIS_THROUGH_STREETS,
  'Rue de Rivoli', 'Boulevard Saint-Germain', 'Avenue des Champs-Élysées', 'Rue de la Roquette', 'Boulevard du Montparnasse', 'Avenue des Gobelins',
];
