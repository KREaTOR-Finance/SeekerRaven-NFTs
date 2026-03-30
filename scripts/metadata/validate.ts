import path from "node:path";
import { z } from "zod";
import { readJson } from "../common/io.js";
import { rootPath } from "../common/paths.js";
import {
  assertMetadataFileSet,
  buildImageMappings,
  EXPECTED_SUPPLY,
  parseTraitCsv
} from "../common/traits.js";

const ATTRIBUTE_SCHEMA = z.object({
  trait_type: z.string().min(1),
  value: z.string().min(1)
});

const METADATA_SCHEMA = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  description: z.string().min(1),
  seller_fee_basis_points: z.number().int().min(0).max(10000),
  image: z.string().min(1),
  external_url: z.string().min(1),
  attributes: z.array(ATTRIBUTE_SCHEMA).length(6),
  collection: z.object({
    name: z.string().min(1),
    family: z.string().min(1)
  }),
  properties: z.object({
    files: z
      .array(
        z.object({
          uri: z.string().min(1),
          type: z.string().min(1)
        })
      )
      .min(1),
    category: z.literal("image"),
    creators: z
      .array(
        z.object({
          address: z.string().min(1),
          share: z.number().int()
        })
      )
      .min(1)
  })
});

function assertAttributes(
  metadataAttributes: Array<{ trait_type: string; value: string }>,
  expected: {
    glyph: string;
    eyeColor: string;
    dominantGlow: string;
    rarityTier: string;
    specialTrait: string;
    backgroundCityHue: string;
  },
  id: number
): void {
  const byTrait = new Map(metadataAttributes.map((a) => [a.trait_type, a.value]));
  const expectedTraits: Record<string, string> = {
    Glyph: expected.glyph,
    "Eye Color": expected.eyeColor,
    "Dominant Glow": expected.dominantGlow,
    "Rarity Tier": expected.rarityTier,
    "Special Trait": expected.specialTrait,
    "Background City Hue": expected.backgroundCityHue
  };

  for (const [key, value] of Object.entries(expectedTraits)) {
    const actual = byTrait.get(key);
    if (actual !== value) {
      throw new Error(`Metadata ${id}.json trait "${key}" mismatch: expected "${value}", got "${actual}"`);
    }
  }
}

function main(): void {
  const metadataDir = rootPath("metadata");
  const rows = parseTraitCsv(rootPath("data", "seekerravens_traits.csv"));
  const mappings = buildImageMappings(rootPath());
  const mappingSet = new Map(mappings.map((m) => [m.id, m.imageFile]));

  assertMetadataFileSet(metadataDir);

  for (let id = 1; id <= EXPECTED_SUPPLY; id += 1) {
    const metadataPath = path.join(metadataDir, `${id}.json`);
    const metadata = METADATA_SCHEMA.parse(readJson<unknown>(metadataPath));
    const row = rows.find((r) => r.id === id);

    if (!row) {
      throw new Error(`Trait row not found for metadata ${id}.json`);
    }

    if (metadata.name !== row.name) {
      throw new Error(`Metadata ${id}.json name mismatch.`);
    }

    assertAttributes(metadata.attributes, row, id);

    const expectedImage = mappingSet.get(id);
    if (!expectedImage) {
      throw new Error(`Image mapping missing for ID ${id}`);
    }
  }

  console.log(`Validated ${EXPECTED_SUPPLY} metadata files and image mapping consistency.`);
}

main();

