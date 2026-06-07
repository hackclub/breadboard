// @ts-nocheck
export {
  ChipInstance,
  type ChipInstanceOptions,
} from "@/lib/velxio/simulation/customChips/ChipRuntime";
export { SPIBus, SPIDevice } from "@/lib/velxio/simulation/customChips/SPIBus";
export { WasiShim } from "@/lib/velxio/simulation/customChips/WasiShim";
export {
  getSimulatorBridges,
  ensureUartBridge,
  ensureSpiBridge,
  avrUartTx,
  getI2CBus,
  detectSimulatorKind,
  type SimulatorKind,
} from "@/lib/velxio/simulation/customChips/simulatorBridges";

/** Decode a base64-encoded WASM blob (from /api/compile-chip or stored in props). */
export function decodeWasmBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
