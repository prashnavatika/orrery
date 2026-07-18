/** Chart JSON Schema v0.1.0 — FROZEN. This document is the contract between the
 * engine and any consumer; it is data, not code, and is the only artifact that
 * crosses the service boundary. Bump schema_version for any shape change.
 */
export const CHART_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://orrery.dev/schema/chart/0.1.0",
  title: "orrery chart",
  type: "object",
  required: ["schema_version", "meta", "ascendant", "planets", "vimshottari"],
  properties: {
    schema_version: { const: "0.1.0" },
    meta: {
      type: "object",
      required: ["ayanamsa", "ayanamsa_value", "node", "house_system", "ephemeris", "jd_ut"],
      properties: {
        ayanamsa: { const: "lahiri" },
        ayanamsa_value: { type: "number" },
        node: { const: "mean" },
        house_system: { const: "whole_sign" },
        ephemeris: { const: "moshier" },
        jd_ut: { type: "number" },
      },
    },
    ascendant: { $ref: "#/$defs/lonParts" },
    planets: {
      type: "object",
      required: ["Su", "Mo", "Ma", "Me", "Ju", "Ve", "Sa", "Ra", "Ke"],
      additionalProperties: { $ref: "#/$defs/planet" },
    },
    vimshottari: {
      type: "array", minItems: 9, maxItems: 9,
      items: { $ref: "#/$defs/dasha" },
    },
  },
  $defs: {
    lonParts: {
      type: "object",
      required: ["lon", "sign", "sign_index", "degree_in_sign", "nakshatra", "nakshatra_index", "pada"],
      properties: {
        lon: { type: "number", minimum: 0, exclusiveMaximum: 360 },
        sign: { type: "string" },
        sign_index: { type: "integer", minimum: 1, maximum: 12 },
        degree_in_sign: { type: "number", minimum: 0, exclusiveMaximum: 30 },
        nakshatra: { type: "string" },
        nakshatra_index: { type: "integer", minimum: 1, maximum: 27 },
        pada: { type: "integer", minimum: 1, maximum: 4 },
      },
    },
    planet: {
      allOf: [
        { $ref: "#/$defs/lonParts" },
        {
          type: "object",
          required: ["retrograde", "navamsa_sign", "house"],
          properties: {
            retrograde: { type: "boolean" },
            navamsa_sign: { type: "string" },
            house: { type: "integer", minimum: 1, maximum: 12 },
          },
        },
      ],
    },
    dasha: {
      type: "object",
      required: ["lord", "start_jd", "end_jd"],
      properties: {
        lord: { enum: ["Ke", "Ve", "Su", "Mo", "Ma", "Ra", "Ju", "Sa", "Me"] },
        start_jd: { type: "number" },
        end_jd: { type: "number" },
        antardashas: { type: "array", items: { $ref: "#/$defs/dasha" } },
      },
    },
  },
} as const;
