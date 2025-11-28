/**
 * Output Formatter Service
 * Supports JSON and TOON output formats for MCP tool responses
 * TOON (Token-Oriented Object Notation) reduces token usage by 30-60%
 *
 * Configure via environment variable: MCP_OUTPUT_FORMAT=toon|json (default: json)
 */

import { encode } from "@toon-format/toon";

export type OutputFormat = "json" | "toon";

/**
 * Get the output format from environment variable
 */
function getOutputFormat(): OutputFormat {
  const format = process.env.MCP_OUTPUT_FORMAT?.toLowerCase();
  return format === "toon" ? "toon" : "json";
}

/**
 * Format data for output based on MCP_OUTPUT_FORMAT env variable
 * @param data - The data to format (object or array)
 * @returns Formatted string (JSON or TOON)
 */
export function formatOutput(data: unknown): string {
  const format = getOutputFormat();

  if (format === "toon") {
    try {
      return encode(data);
    } catch (error) {
      // Fallback to JSON if TOON encoding fails
      console.error("TOON encoding failed, falling back to JSON:", error);
      return JSON.stringify(data, null, 2);
    }
  }

  return JSON.stringify(data, null, 2);
}
