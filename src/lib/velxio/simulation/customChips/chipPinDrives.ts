// @ts-nocheck
export interface ChipDrivenPin {
  pin: string;
  voltage: number;
}

const chipDrives = new Map<string, Map<string, number>>();

export function setChipPinDrive(
  componentId: string,
  pin: string,
  voltage: number | null,
): boolean {
  const pins = chipDrives.get(componentId) ?? new Map<string, number>();
  const previous = pins.get(pin);

  if (voltage === null) {
    if (!pins.has(pin)) return false;
    pins.delete(pin);
    if (pins.size === 0) chipDrives.delete(componentId);
    return true;
  }

  if (previous === voltage) return false;
  pins.set(pin, voltage);
  chipDrives.set(componentId, pins);
  return true;
}

export function getChipDrivenPins(componentId: string): ChipDrivenPin[] {
  const pins = chipDrives.get(componentId);
  if (!pins) return [];
  return Array.from(pins.entries()).map(([pin, voltage]) => ({ pin, voltage }));
}

export function clearChipDrives(componentId?: string): void {
  if (componentId) {
    chipDrives.delete(componentId);
    return;
  }
  chipDrives.clear();
}
