// @ts-nocheck
import { AVRSimulator } from "@/lib/velxio/simulation/AVRSimulator";
import { RP2040Simulator } from "@/lib/velxio/simulation/RP2040Simulator";
import type { PinResolver } from "@/lib/velxio/simulation/PinResolver";
import {
  checkPowerHookup,
  POWER_PIN_REQUIREMENTS,
} from "@/lib/velxio/simulation/parts/netTrace";
import {
  clearWiringIssue,
  reportWiringIssue,
} from "@/services/velxio/store/useWiringIssuesStore";
import { baseSimId } from "@/lib/velxio/simulation/metadataNormalize";

/** Any simulator that components can interact with (AVR, RP2040, or ESP32 bridge shim). */
export type AnySimulator =
  | {
      setPinState(pin: number, state: boolean): void;
      isRunning(): boolean;
      pinManager: import("@/lib/velxio/simulation/PinManager").PinManager;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    }
  | AVRSimulator
  | RP2040Simulator;

/**
 * Interface for simulation logic mapped to a specific wokwi-element
 */
export interface PartSimulationLogic {
  /**
   * Called when a digital pin connected to this part changes state.
   * Useful for output components (LEDs, buzzers, etc).
   *
   * @param pinName The name of the pin on the component that changed
   * @param state The new digital state (true = HIGH, false = LOW)
   * @param element The DOM element of the wokwi component
   */
  onPinStateChange?: (
    pinName: string,
    state: boolean,
    element: HTMLElement,
  ) => void;

  /**
   * Called when the simulation starts to attach events or setup periodic tasks.
   * Useful for input components (buttons, potentiometers) or complex components (servos).
   *
   * The 5th parameter `getPinResolver` is the recommended entry point for
   * new code — it returns a PinResolver that hides whether the underlying
   * source is the digital PinManager (Phase 0) or a SPICE-resolved net
   * voltage with threshold conversion (Phase 1+). Existing handlers can
   * keep using `getArduinoPinHelper` + `pinManager.onPinChange` directly;
   * the migration happens incrementally per-component in Phase 5.
   *
   * @param element The DOM element of the wokwi component
   * @param avrSimulator The running simulator instance
   * @param getArduinoPinHelper Legacy: returns the Arduino pin number controlling a component pin
   * @param componentId The unique ID of this component instance
   * @param getPinResolver Preferred: returns a PinResolver for a component pin
   * @returns A cleanup function to remove event listeners when simulation stops
   */
  attachEvents?: (
    element: HTMLElement,
    simulator: AnySimulator,
    getArduinoPinHelper: (componentPinName: string) => number | null,
    componentId: string,
    getPinResolver?: (componentPinName: string) => PinResolver | null,
  ) => () => void;
}

class PartRegistry {
  private parts: Map<string, PartSimulationLogic> = new Map();
  private powerGated: Map<string, PartSimulationLogic> = new Map();

  register(metadataId: string, logic: PartSimulationLogic) {
    this.parts.set(metadataId, logic);
    this.powerGated.delete(metadataId);
  }

  get(metadataId: string): PartSimulationLogic | undefined {
    // Resolve catalog variants (led-red, resistor-220, …) to the base id the
    // handler was registered under — see baseSimId. Without this a kit LED
    // gets no runtime behaviour and never lights.
    const baseId = baseSimId(metadataId);
    const logic = this.parts.get(baseId);
    const power = POWER_PIN_REQUIREMENTS[baseId];
    if (!logic || !power || !logic.attachEvents) return logic;

    // Real-life hookup enforcement: kit modules with power pins only
    // attach their simulation when VCC/GND actually trace (through wires
    // and breadboard strips) to a board's supply and ground. Cached so
    // callers get a stable object identity across renders.
    let gated = this.powerGated.get(metadataId);
    if (!gated) {
      gated = {
        ...logic,
        attachEvents: (element, simulator, getPin, componentId, resolver) => {
          if (componentId) {
            const hookup = checkPowerHookup(componentId, power);
            if (!hookup.ok) {
              console.info(
                `[${metadataId}] not powered — check wiring: ${hookup.missing.join(", ")}`,
              );
              reportWiringIssue(componentId, metadataId, hookup.missing);
              return () => clearWiringIssue(componentId);
            }
            clearWiringIssue(componentId);
          }
          return logic.attachEvents(
            element,
            simulator,
            getPin,
            componentId,
            resolver,
          );
        },
      };
      this.powerGated.set(metadataId, gated);
    }
    return gated;
  }

  /**
   * Return every metadataId that has runtime simulation logic
   * registered.  Used by the part-simulators-coverage test
   * (Phase 1d-tests E) to enumerate without duplicating the list.
   */
  listRegisteredParts(): string[] {
    return Array.from(this.parts.keys()).sort();
  }
}

export const PartSimulationRegistry = new PartRegistry();

// Import store explicitly inside a function to avoid circular dependencies if any,
// but since we just need it at runtime, we can import it at the top or dynamically.
import { useSimulatorStore } from "@/services/velxio/store/useSimulatorStore";

PartSimulationRegistry.register("raspberry-pi-3", {
  onPinStateChange: (
    pinName: string,
    state: boolean,
    _element: HTMLElement,
  ) => {
    // When Arduino changes a pin connected to Raspberry Pi, forward to backend
    useSimulatorStore.getState().sendRemotePinEvent(pinName, state ? 1 : 0);
  },
});
