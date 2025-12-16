/**
 * Strips Unicode characters and keeps only ASCII printable characters (alphanumeric and common punctuation).
 * Keeps: a-z, A-Z, 0-9, space, and common punctuation: - _ ' , . etc.
 *
 * This automatically removes:
 * - BOM (Byte Order Mark) characters
 * - Object replacement characters (U+FFFD)
 * - Control characters
 * - Other Unicode junk
 *
 * @param str - The string to clean, or undefined/null
 * @returns The cleaned string with only ASCII printable characters, or undefined if input was falsy
 */
export function keepOnlyAscii(str: string | undefined | null): string | undefined {
    if (!str) return undefined;
    // Keep only ASCII printable characters (0x20-0x7E)
    // This includes: space, ! " # $ % & ' ( ) * + , - . / 0-9 : ; < = > ? @ A-Z [ \ ] ^ _ ` a-z { | } ~
    // This automatically removes BOM, object replacement characters, and other Unicode junk
    return str.replace(/[^\x20-\x7E]/g, '').trim();
}
