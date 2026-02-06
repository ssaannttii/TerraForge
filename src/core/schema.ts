import { z } from 'zod';

export const ConfigSchema = z.object({
  seed: z.number(),
  planet: z.object({
    radiusKm: z.number().default(6371),
    oceanCoverage: z.number().min(0.6).max(0.75).default(0.68),
    numContinents: z.number().min(3).max(8).default(5),
    mapWidth: z.number().default(240),
    mapHeight: z.number().default(120),
    tectonicsMode: z.enum(['lite', 'none']).default('lite'),
    climateModel: z.enum(['koppen-lite']).default('koppen-lite')
  }),
  societies: z.object({
    numCultureGroups: z.number().min(20).max(80).default(40),
    numCitiesTarget: z.number().default(180),
    numPolitiesTarget: z.number().min(50).max(400).default(120),
    startingYear: z.number().default(0),
    endingYear: z.number().default(1500),
    techPace: z.enum(['slow', 'medium', 'fast']).default('medium'),
    migrationIntensity: z.number().min(0).max(1).default(0.35)
  }),
  geopolitics: z.object({
    aggression: z.number().min(0).max(1).default(0.45),
    diplomacyBias: z.number().min(0).max(1).default(0.55),
    coalitionTendency: z.number().min(0).max(1).default(0.5),
    imperialOverreachPenalty: z.number().min(0).max(1).default(0.5),
    resourceNeedWeight: z.number().min(0).max(1).default(0.45),
    culturalAffinityWeight: z.number().min(0).max(1).default(0.5),
    warCostModel: z.enum(['logistics-terrain']).default('logistics-terrain'),
    annexationRules: z.object({
      allowVassalization: z.boolean().default(true),
      allowFullAbsorb: z.boolean().default(true),
      maxAnnexationPerDecadePct: z.number().default(0.15)
    })
  }),
  output: z.object({
    detail: z.enum(['summary', 'standard', 'full']).default('standard'),
    snapshotsEveryYears: z.number().default(10),
    exportFormats: z.array(z.enum(['json', 'csv', 'geojson'])).default(['json'])
  })
});

export type TerraForgeConfig = z.infer<typeof ConfigSchema>;

export const RangeSchema = z.object({ start: z.number(), end: z.number() });

export const PolityStatsSchema = z.object({
  population: z.number(),
  gdp: z.number(),
  techLevel: z.number(),
  industrialCapacity: z.number(),
  resourceSecurity: z.number(),
  military: z.number(),
  navalProjection: z.number(),
  stability: z.number(),
  legitimacy: z.number(),
  logistics: z.number(),
  powerScore: z.number()
});

export const PolityStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['kingdom', 'republic', 'empire', 'city-state', 'tribal', 'federation']),
  capitalCityId: z.string(),
  cultureGroupIds: z.array(z.string()),
  stats: PolityStatsSchema,
  territory: z.object({ cellIdsCompressed: z.array(RangeSchema) })
});

export const WorldBundleSchema = z.object({
  meta: z.object({
    seed: z.number(),
    configHash: z.string(),
    createdAtIso: z.string(),
    startYear: z.number(),
    endYear: z.number(),
    tick: z.literal('year'),
    version: z.string(),
    summary: z.object({
      topPowersByDecade: z.array(z.object({
        decade: z.number(),
        top: z.array(z.object({ id: z.string(), powerScore: z.number() }))
      })),
      totals: z.object({ wars: z.number(), battles: z.number(), annexations: z.number(), secessions: z.number() }),
      eras: z.array(z.object({ name: z.string(), start: z.number(), end: z.number(), reason: z.string() }))
    })
  }),
  planet: z.object({ radiusKm: z.number(), oceanCoverage: z.number(), mapWidth: z.number(), mapHeight: z.number() }),
  cells: z.array(z.object({
    id: z.number(),
    x: z.number(),
    y: z.number(),
    lat: z.number(),
    lon: z.number(),
    elevation: z.number(),
    isOcean: z.boolean(),
    riverId: z.number().optional(),
    biomeId: z.string(),
    resourceTags: z.array(z.string())
  })),
  continents: z.array(z.object({ id: z.string(), name: z.string(), cellIds: z.array(z.number()) })),
  cultureGroups: z.array(z.object({
    id: z.string(),
    name: z.string(),
    traits: z.record(z.string(), z.number()),
    coreRegionIds: z.array(z.number())
  })),
  cities: z.array(z.object({
    id: z.string(),
    name: z.string(),
    cellId: z.number(),
    population: z.number(),
    coastal: z.boolean(),
    river: z.boolean(),
    cultureGroupId: z.string()
  })),
  politiesInitial: z.array(PolityStateSchema),
  timelineIndex: z.object({
    snapshots: z.array(z.object({
      year: z.number(),
      polityStates: z.array(PolityStateSchema),
      politicalOwnersRLE: z.array(z.object({ owner: z.string(), ranges: z.array(RangeSchema) })),
      alliances: z.array(z.array(z.string()))
    })),
    deltasBetweenSnapshots: z.array(z.object({
      year: z.number(),
      polityUpdates: z.array(z.object({
        polityId: z.string(),
        statsDelta: z.record(z.string(), z.number())
      })),
      territorialChangeIds: z.array(z.string()),
      events: z.array(z.string())
    }))
  }),
  events: z.array(z.object({
    id: z.string(),
    year: z.number(),
    type: z.string(),
    title: z.string(),
    actors: z.object({ primary: z.array(z.string()), secondary: z.array(z.string()).optional() }),
    causes: z.array(z.object({ key: z.string(), weight: z.number(), ref: z.string().optional() })),
    effects: z.array(z.string()),
    explanation: z.array(z.string()),
    refs: z.record(z.string(), z.string().optional())
  })),
  wars: z.array(z.object({
    id: z.string(),
    name: z.string(),
    startYear: z.number(),
    endYear: z.number().optional(),
    sides: z.object({ A: z.array(z.string()), B: z.array(z.string()) }),
    theaters: z.array(z.string()).optional(),
    battles: z.array(z.object({
      id: z.string(),
      year: z.number(),
      locationCellId: z.number(),
      type: z.enum(['FIELD', 'SIEGE', 'NAVAL']),
      result: z.enum(['A_VICTORY', 'B_VICTORY', 'INDECISIVE']),
      casualtiesEstimate: z.object({ A: z.number(), B: z.number() }),
      factors: z.array(z.string()),
      explanation: z.array(z.string())
    })),
    outcome: z.enum(['A_WIN', 'B_WIN', 'DRAW', 'WHITE_PEACE']),
    treatyId: z.string().optional(),
    territorialChanges: z.array(z.string()),
    explanation: z.array(z.string())
  })),
  treaties: z.array(z.object({
    id: z.string(),
    name: z.string(),
    year: z.number(),
    participants: z.array(z.string()),
    terms: z.array(z.string())
  })),
  territorialChanges: z.array(z.object({
    id: z.string(),
    year: z.number(),
    type: z.enum(['ANNEXATION_PARTIAL', 'ABSORBED_FULL', 'VASSALIZED', 'SECESSION', 'COLONIZATION', 'UNION']),
    winnerPolityId: z.string().optional(),
    loserPolityId: z.string().optional(),
    regionsTransferredCompressed: z.array(RangeSchema),
    reason: z.string(),
    linkedWarId: z.string().optional(),
    treatyId: z.string().optional()
  }))
});
