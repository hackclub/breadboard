// @ts-nocheck
/**
 * Intel HEX Format Parser
 * Converts Intel HEX format to Uint8Array for AVR8 program memory
 *
 * Intel HEX format:
 * :LLAAAATT[DD...]CC
 *
 * LL = byte count
 * AAAA = address
 * TT = record type (00=data, 01=EOF)
 * DD = data bytes
 * CC = checksum
 */

// Strict two-hex-digit read: returns -1 for anything that isn't exactly two
// hex chars, so a corrupt line can't slip a NaN (which silently becomes 0)
// into the program image.
function readHexByte(s: string, at: number): number {
  const pair = s.substring(at, at + 2);
  if (pair.length !== 2 || !/^[0-9a-fA-F]{2}$/.test(pair)) return -1;
  return parseInt(pair, 16);
}

export function hexToUint8Array(hexContent: string): Uint8Array {
  const lines = hexContent
    .split("\n")
    .filter((line) => line.trim().startsWith(":"));

  // Determine max address to size the array
  let maxAddress = 0;
  const dataRecords: Array<{ address: number; data: number[] }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(":")) continue;

    // A record is ':' + at least byteCount(1) addr(2) type(1) checksum(1) = 10
    // hex chars, and its length must be even. Reject malformed framing rather
    // than reading NaN fields.
    if (trimmed.length < 11 || trimmed.length % 2 === 0) continue;
    // Every byte in the record must be valid hex and the checksum must match,
    // otherwise the line is corrupt — skip it instead of loading garbage.
    if (!verifyHexChecksum(trimmed)) continue;

    // Remove ':' and parse
    const bytes = trimmed.substring(1);

    // Parse record
    const byteCount = readHexByte(bytes, 0);
    const addrHi = readHexByte(bytes, 2);
    const addrLo = readHexByte(bytes, 4);
    const recordType = readHexByte(bytes, 6);
    if (byteCount < 0 || addrHi < 0 || addrLo < 0 || recordType < 0) continue;
    const address = (addrHi << 8) | addrLo;
    // The record must actually carry byteCount data bytes plus the checksum.
    if (bytes.length !== 8 + byteCount * 2 + 2) continue;

    // Type 00 = data record
    if (recordType === 0x00) {
      const data: number[] = [];
      let ok = true;
      for (let i = 0; i < byteCount; i++) {
        const dataByte = readHexByte(bytes, 8 + i * 2);
        if (dataByte < 0) {
          ok = false;
          break;
        }
        data.push(dataByte);
      }
      if (!ok) continue;

      dataRecords.push({ address, data });
      maxAddress = Math.max(maxAddress, address + byteCount);
    }
    // Type 01 = end of file
    else if (recordType === 0x01) {
      break;
    }
  }

  // Create array with enough space
  const result = new Uint8Array(maxAddress);

  // Fill with data
  for (const record of dataRecords) {
    for (let i = 0; i < record.data.length; i++) {
      result[record.address + i] = record.data[i];
    }
  }

  return result;
}

/**
 * Verify Intel HEX checksum
 */
export function verifyHexChecksum(line: string): boolean {
  if (!line.startsWith(":")) return false;

  const bytes = line.substring(1);
  let sum = 0;

  // Sum all bytes except checksum
  for (let i = 0; i < bytes.length - 2; i += 2) {
    sum += parseInt(bytes.substring(i, i + 2), 16);
  }

  // Get checksum
  const checksum = parseInt(bytes.substring(bytes.length - 2), 16);

  // Checksum = two's complement of sum
  return ((sum + checksum) & 0xff) === 0;
}
