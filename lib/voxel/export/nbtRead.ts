// A reader for the NBT written by lib/voxel/export/nbt.ts. It exists so the
// Litematica writer can be checked by reading its own output back and comparing
// block for block, rather than by trusting that the bytes came out right.

export type NbtCompound = { [key: string]: NbtValue };
export type NbtValue =
  | number
  | bigint
  | string
  | Uint8Array
  | number[]
  | bigint[]
  | NbtValue[]
  | NbtCompound;

const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_FLOAT = 5;
const TAG_DOUBLE = 6;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TAG_INT_ARRAY = 11;
const TAG_LONG_ARRAY = 12;

export class NbtFormatError extends Error {}

class Cursor {
  offset = 0;
  private readonly view: DataView;
  private readonly decoder = new TextDecoder();

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  byte(): number {
    this.require(1);
    const value = this.view.getInt8(this.offset);
    this.offset += 1;
    return value;
  }

  unsignedByte(): number {
    this.require(1);
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  short(): number {
    this.require(2);
    const value = this.view.getInt16(this.offset);
    this.offset += 2;
    return value;
  }

  unsignedShort(): number {
    this.require(2);
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  int(): number {
    this.require(4);
    const value = this.view.getInt32(this.offset);
    this.offset += 4;
    return value;
  }

  long(): bigint {
    this.require(8);
    const value = this.view.getBigInt64(this.offset);
    this.offset += 8;
    return value;
  }

  float(): number {
    this.require(4);
    const value = this.view.getFloat32(this.offset);
    this.offset += 4;
    return value;
  }

  double(): number {
    this.require(8);
    const value = this.view.getFloat64(this.offset);
    this.offset += 8;
    return value;
  }

  string(): string {
    const length = this.unsignedShort();
    this.require(length);
    const value = this.decoder.decode(this.bytes.subarray(this.offset, this.offset + length));
    this.offset += length;
    return value;
  }

  private require(count: number): void {
    if (this.offset + count > this.bytes.byteLength) {
      throw new NbtFormatError(
        `Truncated NBT: needed ${count} bytes at offset ${this.offset} of ${this.bytes.byteLength}`,
      );
    }
  }
}

function readPayload(cursor: Cursor, type: number): NbtValue {
  switch (type) {
    case TAG_BYTE:
      return cursor.byte();
    case TAG_SHORT:
      return cursor.short();
    case TAG_INT:
      return cursor.int();
    case TAG_LONG:
      return cursor.long();
    case TAG_FLOAT:
      return cursor.float();
    case TAG_DOUBLE:
      return cursor.double();
    case TAG_BYTE_ARRAY: {
      const length = cursor.int();
      const out = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) out[index] = cursor.unsignedByte();
      return out;
    }
    case TAG_STRING:
      return cursor.string();
    case TAG_LIST: {
      const childType = cursor.unsignedByte();
      const length = cursor.int();
      const items: NbtValue[] = [];
      for (let index = 0; index < length; index += 1) items.push(readPayload(cursor, childType));
      return items;
    }
    case TAG_COMPOUND:
      return readCompound(cursor);
    case TAG_INT_ARRAY: {
      const length = cursor.int();
      const out: number[] = [];
      for (let index = 0; index < length; index += 1) out.push(cursor.int());
      return out;
    }
    case TAG_LONG_ARRAY: {
      const length = cursor.int();
      const out: bigint[] = [];
      for (let index = 0; index < length; index += 1) out.push(cursor.long());
      return out;
    }
    default:
      throw new NbtFormatError(`Unsupported NBT tag type ${type}`);
  }
}

function readCompound(cursor: Cursor): NbtCompound {
  const out: NbtCompound = {};
  for (;;) {
    const type = cursor.unsignedByte();
    if (type === TAG_END) return out;
    const name = cursor.string();
    out[name] = readPayload(cursor, type);
  }
}

export type NbtDocument = { name: string; value: NbtCompound };

export function readNbt(bytes: Uint8Array): NbtDocument {
  const cursor = new Cursor(bytes);
  const type = cursor.unsignedByte();
  if (type !== TAG_COMPOUND) {
    throw new NbtFormatError(`Expected a root compound, found tag type ${type}`);
  }
  const name = cursor.string();
  return { name, value: readCompound(cursor) };
}

export function expectCompound(value: NbtValue | undefined, path: string): NbtCompound {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Uint8Array) {
    throw new NbtFormatError(`Expected a compound at ${path}`);
  }
  return value as NbtCompound;
}

export function expectInt(value: NbtValue | undefined, path: string): number {
  if (typeof value !== "number") throw new NbtFormatError(`Expected a number at ${path}`);
  return value;
}

export function expectString(value: NbtValue | undefined, path: string): string {
  if (typeof value !== "string") throw new NbtFormatError(`Expected a string at ${path}`);
  return value;
}

export function expectList(value: NbtValue | undefined, path: string): NbtValue[] {
  if (!Array.isArray(value)) throw new NbtFormatError(`Expected a list at ${path}`);
  return value;
}

export function expectLongArray(value: NbtValue | undefined, path: string): bigint[] {
  const list = expectList(value, path);
  for (const item of list) {
    if (typeof item !== "bigint") throw new NbtFormatError(`Expected longs at ${path}`);
  }
  return list as bigint[];
}
