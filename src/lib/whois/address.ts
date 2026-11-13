// Pure address arithmetic, shared by the server and browser RDAP parsers.
const ZERO = BigInt(0);
const ONE = BigInt(1);

export function parseAddress(
  input: string,
): { value: bigint; bits: 32 | 128 } | null {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(input)) {
    const parts = input.split(".");
    if (
      parts.some(
        (part) => Number(part) > 255 || (part.length > 1 && part[0] === "0"),
      )
    )
      return null;
    return {
      value: parts.reduce(
        (value, part) => (value << BigInt(8)) + BigInt(part),
        ZERO,
      ),
      bits: 32,
    };
  }
  if (!input.includes(":") || /[^a-f\d:.]/i.test(input)) return null;
  let text = input.toLowerCase();
  if (text.includes(".")) {
    const lastColon = text.lastIndexOf(":");
    const ipv4 = parseAddress(text.slice(lastColon + 1));
    if (!ipv4 || ipv4.bits !== 32) return null;
    text = `${text.slice(0, lastColon)}:${(ipv4.value >> BigInt(16)).toString(16)}:${(ipv4.value & BigInt(65535)).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  if ([...left, ...right].some((part) => !/^[a-f\d]{1,4}$/.test(part)))
    return null;
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const parts = [...left, ...Array(missing).fill("0"), ...right];
  return {
    value: parts.reduce(
      (value, part) => (value << BigInt(16)) + BigInt(`0x${part}`),
      ZERO,
    ),
    bits: 128,
  };
}

export function formatAddress(value: bigint, bits: 32 | 128): string {
  if (bits === 32)
    return [24, 16, 8, 0]
      .map((shift) => Number((value >> BigInt(shift)) & BigInt(255)))
      .join(".");
  const parts = Array.from({ length: 8 }, (_, i) =>
    ((value >> BigInt((7 - i) * 16)) & BigInt(65535)).toString(16),
  );
  let start = -1,
    length = 1;
  for (let i = 0; i < parts.length; ) {
    if (parts[i] !== "0") {
      i++;
      continue;
    }
    let end = i;
    while (parts[end] === "0") end++;
    if (end - i > length) {
      start = i;
      length = end - i;
    }
    i = end;
  }
  return start < 0
    ? parts.join(":")
    : `${parts.slice(0, start).join(":")}::${parts.slice(start + length).join(":")}`;
}

export function parseCidr(input: string) {
  const parts = input.split("/");
  const address = parseAddress(parts[0]);
  if (parts.length !== 2 || !address || !/^\d{1,3}$/.test(parts[1]))
    return null;
  const prefix = Number(parts[1]);
  if (prefix > address.bits) return null;
  const hostBits = BigInt(address.bits - prefix);
  const start = (address.value >> hostBits) << hostBits;
  return {
    ...address,
    prefix,
    start,
    end: start + (ONE << hostBits) - ONE,
    cidr: `${formatAddress(start, address.bits)}/${prefix}`,
  };
}

export function rangeToCidrs(
  startAddress: string,
  endAddress: string,
): string[] {
  const start = parseAddress(startAddress),
    end = parseAddress(endAddress);
  if (!start || !end || start.bits !== end.bits || start.value > end.value)
    return [];
  const result: string[] = [];
  let cursor = start.value;
  while (cursor <= end.value) {
    let hostBits = 0;
    while (hostBits < start.bits) {
      const block = ONE << BigInt(hostBits + 1);
      if (cursor % block !== ZERO || cursor + block - ONE > end.value) break;
      hostBits++;
    }
    result.push(
      `${formatAddress(cursor, start.bits)}/${start.bits - hostBits}`,
    );
    cursor += ONE << BigInt(hostBits);
  }
  return result;
}
