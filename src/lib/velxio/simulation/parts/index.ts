// @ts-nocheck
import { PartSimulationRegistry } from "@/lib/velxio/simulation/parts/PartSimulationRegistry";
export * from "@/lib/velxio/simulation/parts/PartSimulationRegistry";
export * from "@/lib/velxio/simulation/parts/ActiveParts";
// Side-effect imports — each of these files registers entries into the
// PartSimulationRegistry on module load. ActiveParts must run too so that
// semiconductors are marked self-managed (see the file header for why).
import "@/lib/velxio/simulation/parts/ActiveParts";
import "@/lib/velxio/simulation/parts/BasicParts";
import "@/lib/velxio/simulation/parts/ComplexParts";
import "@/lib/velxio/simulation/parts/ChipParts";
import "@/lib/velxio/simulation/parts/SensorParts";
import "@/lib/velxio/simulation/parts/MotorDriverParts";
import "@/lib/velxio/simulation/parts/LogicGateParts";
import "@/lib/velxio/simulation/parts/ProtocolParts";
import "@/lib/velxio/simulation/parts/CustomChipPart";
import "@/lib/velxio/simulation/parts/EPaperPart";
import {
  registerSensorUpdate,
  unregisterSensorUpdate,
} from "@/lib/velxio/simulation/SensorUpdateRegistry";
import { setAdcVoltage } from "@/lib/velxio/simulation/parts/partUtils";

const aliasPart = (alias: string, target: string) => {
  const logic = PartSimulationRegistry.get(target);
  if (logic) PartSimulationRegistry.register(alias, logic);
};

aliasPart("led-red", "led");
aliasPart("led-yellow", "led");
aliasPart("led-blue", "led");
aliasPart("led-green", "led");
aliasPart("buzzer-passive", "buzzer");
aliasPart("buzzer-active", "buzzer");
aliasPart("thermistor", "ntc-temperature-sensor");
aliasPart("74hc595", "74hc595");

PartSimulationRegistry.register("ir-transmitter", {
  attachEvents: (
    element,
    simulator,
    getArduinoPinHelper,
    _componentId,
    getPinResolver,
  ) => {
    const pinManager = (simulator as any).pinManager;
    const pinA = getArduinoPinHelper("A");
    const resolver = getPinResolver?.("A") ?? null;
    const setActive = (active: boolean) => {
      (element as any).active = active;
    };

    if (resolver)
      return resolver.onChange((state) => setActive(state === "HIGH"));
    if (!pinManager || pinA === null) return () => {};
    return pinManager.onPinChange(pinA, (_pin: number, state: boolean) =>
      setActive(state),
    );
  },
});

PartSimulationRegistry.register("microphone-module", {
  attachEvents: (element, simulator, getArduinoPinHelper, componentId) => {
    const pinAOUT = getArduinoPinHelper("AO") ?? getArduinoPinHelper("AOUT");
    const pinDOUT = getArduinoPinHelper("DO") ?? getArduinoPinHelper("DOUT");
    const setLevel = (level: number) => {
      const soundLevel = Math.max(0, Math.min(1023, Number(level) || 0));
      (element as any).soundLevel = soundLevel;
      if (pinAOUT !== null)
        setAdcVoltage(simulator, pinAOUT, (soundLevel / 1023) * 5);
      if (pinDOUT !== null) simulator.setPinState(pinDOUT, soundLevel > 512);
    };

    setLevel(512);
    registerSensorUpdate(componentId, (values) => {
      if ("soundLevel" in values) setLevel(Number(values.soundLevel));
    });

    return () => unregisterSensorUpdate(componentId);
  },
});

PartSimulationRegistry.register("obstacle-avoidance-module", {
  attachEvents: (element, simulator, getArduinoPinHelper, componentId) => {
    const out = getArduinoPinHelper("OUT");
    const setDistance = (distance: number) => {
      const detected = distance < 20;
      (element as any).detected = detected;
      if (out !== null) simulator.setPinState(out, detected);
    };

    setDistance(100);
    registerSensorUpdate(componentId, (values) => {
      if ("distance" in values) setDistance(Number(values.distance));
    });

    return () => unregisterSensorUpdate(componentId);
  },
});

PartSimulationRegistry.register("relay-2ch", {
  attachEvents: (element, simulator, getArduinoPinHelper) => {
    const pinManager = (simulator as any).pinManager;
    if (!pinManager) return () => {};
    const unsubscribers: (() => void)[] = [];
    const in1 = getArduinoPinHelper("IN1");
    const in2 = getArduinoPinHelper("IN2");
    (element as any).relay1 = false;
    (element as any).relay2 = false;
    if (in1 !== null) {
      unsubscribers.push(
        pinManager.onPinChange(in1, (_pin: number, state: boolean) => {
          (element as any).relay1 = state;
        }),
      );
    }
    if (in2 !== null) {
      unsubscribers.push(
        pinManager.onPinChange(in2, (_pin: number, state: boolean) => {
          (element as any).relay2 = state;
        }),
      );
    }
    return () => {
      unsubscribers.forEach((unsubscribe) => {
        unsubscribe();
      });
    };
  },
});

PartSimulationRegistry.register("relay-1ch", {
  attachEvents: (element, simulator, getArduinoPinHelper) => {
    const pinManager = (simulator as any).pinManager;
    const input = getArduinoPinHelper("IN");
    (element as any).relay = false;
    if (!pinManager || input === null) return () => {};
    return pinManager.onPinChange(input, (_pin: number, state: boolean) => {
      (element as any).relay = state;
    });
  },
});
