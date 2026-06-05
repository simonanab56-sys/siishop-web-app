// utils/text.js - Text manipulation utilities

/**
 * Truncate text to a maximum length, adding ellipsis if truncated.
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} Truncated text with "..." if needed
 */
export function truncateText(text, maxLength = 100) {
  if (!text || typeof text !== "string") return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

/**
 * Truncate text to a maximum number of words.
 * @param {string} text - The text to truncate
 * @param {number} maxWords - Maximum number of words
 * @returns {string} Truncated text with "..." if needed
 */
export function truncateWords(text, maxWords = 20) {
  if (!text || typeof text !== "string") return "";
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ").trim() + "...";
}