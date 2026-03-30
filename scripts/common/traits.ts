import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseCsvObjects } from "./csv.js";

export const EXPECTED_SUPPLY = 34;

const TRAIT_ROW_SCHEMA = z.object({
  ID: z.coerce.number().int().min(1),
  Name: z.string().min(1),
  Glyph: z.string().min(1),
  "Eye Color": z.string().min(1),
  "Dominant Glow": z.string().min(1),
  "Rarity Tier": z.string().min(1),
  "Other Traits": z.string().min(1)
});

export type CsvTraitRow = z.infer<typeof TRAIT_ROW_SCHEMA>;

export type TraitRow = {
  id: number;
  name: string;
  glyph: string;
  eyeColor: string;
  dominantGlow: string;
  rarityTier: string;
  otherTraits: string;
  specialTrait: string;
  backgroundCityHue: string;
};

export type ImageMapping = {
  id: number;
  imageFile: string;
};

function splitOtherTraits(input: string): { specialTrait: string; backgroundCityHue: string } {
  const index = input.indexOf(",");
  if (index < 0) {
    throw new Error(`Invalid "Other Traits" value (missing comma): "${input}"`);
  }

  const specialTrait = input.slice(0, index).trim();
  const backgroundCityHue = input.slice(index + 1).trim();

  if (!specialTrait || !backgroundCityHue) {
    throw new Error(`Invalid "Other Traits" value (empty parts): "${input}"`);
  }

  return { specialTrait, backgroundCityHue };
}

export function parseTraitCsv(csvPath: string): TraitRow[] {
  const csvRaw = fs.readFileSync(csvPath, "utf8");
  const records = parseCsvObjects(csvRaw);

  const rows = records.map((record) => {
    const parsed = TRAIT_ROW_SCHEMA.parse(record);
    const split = splitOtherTraits(parsed["Other Traits"]);

    return {
      id: parsed.ID,
      name: parsed.Name,
      glyph: parsed.Glyph,
      eyeColor: parsed["Eye Color"],
      dominantGlow: parsed["Dominant Glow"],
      rarityTier: parsed["Rarity Tier"],
      otherTraits: parsed["Other Traits"],
      specialTrait: split.specialTrait,
      backgroundCityHue: split.backgroundCityHue
    };
  });

  validateRows(rows);
  return rows;
}

export function validateRows(rows: TraitRow[]): void {
  if (rows.length !== EXPECTED_SUPPLY) {
    throw new Error(`Expected ${EXPECTED_SUPPLY} trait rows, got ${rows.length}`);
  }

  const ids = rows.map((row) => row.id).sort((a, b) => a - b);
  for (let i = 1; i <= EXPECTED_SUPPLY; i += 1) {
    if (ids[i - 1] !== i) {
      throw new Error(`Trait IDs must be contiguous 1..${EXPECTED_SUPPLY}`);
    }
  }
}

export function buildImageMappings(repoRoot: string): ImageMapping[] {
  const files = fs
    .readdirSync(repoRoot)
    .filter((name) => /\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b));

  const byNumber = new Map<number, string>();
  for (const fileName of files) {
    const match = /^raven(\d+)\.png$/i.exec(fileName);
    if (!match) {
      continue;
    }
    const num = Number.parseInt(match[1], 10);
    byNumber.set(num, fileName);
  }

  const mappings: ImageMapping[] = [];
  for (let id = 1; id <= EXPECTED_SUPPLY; id += 1) {
    const expectedFileNum = id + 1;
    const imageFile = byNumber.get(expectedFileNum);
    if (!imageFile) {
      throw new Error(`Missing expected image file for ID ${id}: raven${expectedFileNum}.png`);
    }
    mappings.push({ id, imageFile });
  }

  if (mappings.length !== EXPECTED_SUPPLY) {
    throw new Error("Image mapping failed.");
  }

  return mappings;
}

export function assertMetadataFileSet(metadataDir: string): void {
  const files = fs
    .readdirSync(metadataDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.parse(f).name)
    .map((name) => Number.parseInt(name, 10))
    .sort((a, b) => a - b);

  if (files.length !== EXPECTED_SUPPLY) {
    throw new Error(`Expected ${EXPECTED_SUPPLY} metadata files, found ${files.length}`);
  }

  for (let i = 1; i <= EXPECTED_SUPPLY; i += 1) {
    if (files[i - 1] !== i) {
      throw new Error(`Metadata files must be exactly 1.json..${EXPECTED_SUPPLY}.json`);
    }
  }
}
